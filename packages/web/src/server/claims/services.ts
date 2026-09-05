import type {
  AnalyzeReceiptResponse,
  Claim,
  CreateClaimResponse,
  ListClaimsResponse,
  PaymentResult,
  PolicyOutcome,
  ProcessClaimResponse,
  ReconcileClaimResponse,
  ReviewClaimResponse,
  RuleId,
} from '@tali/shared';
import { claimPaymentAmount } from '@tali/shared';
import type { createClaimQuoter } from '../fx/quotes';
import { ZodError } from 'zod';

import { ServerError, isServerError } from '../errors';
import { evaluatePolicy } from '../policy/evaluate';
import type { ReceiptAnalyzer } from '../receipts/gemini';
import { hashReceipt, type ReceiptMimeType } from '../receipts/hash';
import { toReceiptAnalysis } from '../receipts/schema';
import { PaymentSubmissionUncertainError } from '../sui/payment-executor';
import type {
  ClaimRepository,
  AnalysisDraftRepository,
  ClaimProcessContext,
  MandateReader,
  PaymentExecutor,
  ProcessedClaimState,
  ReceiptStore,
} from './ports';
import {
  eventIdSchema,
  parseCreateClaimInput,
  parseProcessClaimInput,
  parseReviewClaimInput,
  suiAddressSchema,
} from './validation';

export interface AnalyzeReceiptInput {
  eventId: string;
  submitter: string;
  bytes: Uint8Array;
  mimeType: ReceiptMimeType;
}

export function databaseError(error: unknown): ServerError {
  return isServerError(error)
    ? error
    : new ServerError(
        'database_failed',
        500,
        'The database operation failed',
        { cause: error },
      );
}

export function createAnalyzeReceiptService(deps: {
  analyzer: ReceiptAnalyzer;
  claims: ClaimRepository;
  receipts: ReceiptStore;
  drafts: AnalysisDraftRepository;
  now?: () => number;
}): (input: AnalyzeReceiptInput) => Promise<AnalyzeReceiptResponse> {
  return async (input) => {
    let eventId: string;
    let submitter: string;
    try {
      eventId = eventIdSchema.parse(input.eventId);
      submitter = suiAddressSchema.parse(input.submitter);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event or submitter', {
        cause: error,
      });
    }

    try {
      await deps.claims.assertEventExists(eventId);
      await deps.claims.assertActiveMember(eventId, submitter);
    } catch (error) {
      throw databaseError(error);
    }

    let receiptHash: string;
    try {
      receiptHash = hashReceipt(input.bytes);
    } catch (error) {
      throw new ServerError('unsupported_receipt', 415, 'Receipt image is empty', {
        cause: error,
      });
    }

    let duplicate;
    try {
      duplicate = await deps.claims.findDuplicateReceipt(eventId, receiptHash);
    } catch (error) {
      throw databaseError(error);
    }
    if (duplicate) {
      return {
        analysis: duplicate.analysis,
        draftId: null,
        draftExpiresAt: null,
        duplicateOf: duplicate.claimId,
      };
    }

    let analysis;
    try {
      const fields = await deps.analyzer.analyze({
        bytes: input.bytes,
        mimeType: input.mimeType,
      });
      analysis = toReceiptAnalysis(fields, receiptHash);
    } catch (error) {
      throw new ServerError(
        'analysis_failed',
        502,
        'Receipt analysis failed',
        { cause: error },
      );
    }

    let storagePath: string;
    try {
      storagePath = await deps.receipts.upload({
        eventId,
        receiptHash,
        bytes: input.bytes,
        mimeType: input.mimeType,
      });
    } catch (error) {
      throw new ServerError('storage_failed', 500, 'Receipt upload failed', {
        cause: error,
      });
    }

    const createdAtMs = deps.now?.() ?? Date.now();
    let draft;
    try {
      draft = await deps.drafts.create({
        eventId,
        walletAddress: submitter,
        storagePath,
        receiptHash,
        analysis,
        createdAtMs,
        expiresAtMs: createdAtMs + 15 * 60_000,
      });
    } catch (error) {
      throw databaseError(error);
    }

    return {
      analysis,
      draftId: draft.id,
      draftExpiresAt: new Date(draft.expiresAtMs).toISOString(),
      duplicateOf: null,
    };
  };
}

export function createClaimService(deps: {
  drafts: AnalysisDraftRepository;
  now?: () => number;
}): (input: unknown) => Promise<CreateClaimResponse> {
  return async (input) => {
    let request;
    try {
      request = parseCreateClaimInput(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ServerError('invalid_request', 400, 'Invalid claim request', {
          cause: error,
        });
      }
      throw error;
    }

    try {
      return {
        claim: await deps.drafts.consumeToClaim({
          draftId: request.draftId,
          walletAddress: request.submitter,
          amount: request.amount,
          merchant: request.merchant,
          receiptDate: request.receiptDate,
          category: request.category,
          description: request.description,
          nowMs: deps.now?.() ?? Date.now(),
        }),
      };
    } catch (error) {
      throw databaseError(error);
    }
  };
}

export function createListClaimsService(deps: {
  claims: ClaimRepository;
  receipts: ReceiptStore;
}): (input: { eventId: string; viewer: string }) => Promise<ListClaimsResponse> {
  return async (input) => {
    let eventId: string;
    let viewer: string;
    try {
      eventId = eventIdSchema.parse(input.eventId);
      viewer = suiAddressSchema.parse(input.viewer);
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid event or viewer', {
        cause: error,
      });
    }

    let storedClaims;
    try {
      await deps.claims.assertEventExists(eventId);
      await deps.claims.assertEventViewer(eventId, viewer);
      storedClaims = await deps.claims.listByEvent(eventId);
    } catch (error) {
      throw databaseError(error);
    }

    /* One receipt whose object is missing must not cost the caller every other
       claim. The screens already render a claim without an image and say so,
       whereas a thrown error leaves the queue empty and the treasurer with
       nothing to act on. */
    const claims = await Promise.all(
      storedClaims.map(async ({ claim, storagePath }) => ({
        ...claim,
        receiptUrl: await deps.receipts
          .createSignedUrl(storagePath, 300)
          .catch(() => null),
      })),
    );
    return { claims, cursor: null };
  };
}

export function createProcessClaimService(deps: {
  quotes?: ReturnType<typeof createClaimQuoter>;
  claims: ClaimRepository;
  mandates: MandateReader;
  payments: PaymentExecutor;
  now?: () => number;
}): (input: unknown) => Promise<ProcessClaimResponse> {
  return async (input) => {
    let request: { claimId: string; processor: string };
    try {
      request = parseProcessClaimInput(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ServerError('invalid_request', 400, 'Invalid claim process request', {
          cause: error,
        });
      }
      throw error;
    }

    let context: ClaimProcessContext;
    try {
      context = await deps.claims.getProcessContext(request.claimId);
    } catch (error) {
      throw databaseError(error);
    }

    if (request.processor.toLowerCase() !== context.event.treasurer.toLowerCase()) {
      throw new ServerError(
        'processor_forbidden',
        403,
        'Only the event treasurer may process claims',
      );
    }

    const conflict = (message = 'Claim is not available for processing') =>
      new ServerError('processing_conflict', 409, message);

    const nowMs = deps.now?.() ?? Date.now();

    function completedPaymentResponse(storedClaim: Claim): ProcessClaimResponse {
      if (!storedClaim.decision || !storedClaim.payment) {
        throw conflict('Claim payment state is inconsistent');
      }
      return {
        claim: storedClaim,
        decision: storedClaim.decision,
        payment: storedClaim.payment,
      };
    }

    function inspectAutoPayState(storedClaim: Claim): ProcessClaimResponse | null {
      if (!storedClaim.decision) throw conflict();
      if (storedClaim.state === 'paid' || storedClaim.state === 'payment_failed') {
        return completedPaymentResponse(storedClaim);
      }
      if (storedClaim.state === 'paying') {
        throw conflict('Payment requires reconciliation before retrying');
      }
      if (storedClaim.decision.outcome !== 'auto_pay') {
        return {
          claim: storedClaim,
          decision: storedClaim.decision,
          payment: null,
        };
      }
      if (storedClaim.state !== 'approved') throw conflict();
      return null;
    }

    async function readCurrentMandate() {
      try {
        const mandate = await deps.mandates.read(context.event.mandateId);
        if (mandate.id.toLowerCase() !== context.event.mandateId.toLowerCase()) {
          throw new Error('Mandate object ID does not match the event');
        }
        return mandate;
      } catch (error) {
        throw new ServerError(
          'mandate_read_failed',
          502,
          'The current Sui mandate could not be read',
          { cause: error },
        );
      }
    }

    /* A payment failure is definite: no USDC left the mandate. A MYR quote is
       short-lived, though, so it must not be reused after expiry. Clear only
       the mutable decision/payment state, then take the claim through the
       normal quote-and-human-approval flow again. */
    if (
      context.claim.state === 'payment_failed' &&
      context.claim.analysis?.currency === 'MYR' &&
      claimPaymentAmount(context.claim, nowMs) === null
    ) {
      let restarted;
      try {
        restarted = await deps.claims.restartExpiredPaymentQuote(context.claim.id);
      } catch (error) {
        throw databaseError(error);
      }
      if (restarted.status !== 'saved') {
        throw conflict('Claim changed while refreshing its expired quote. Reload and try again.');
      }
      context.claim = restarted.claim;
    }

    // A quote is created only after treasurer authorization. It is bound to the
    // claim, event, recipient and mandate before policy evaluation continues.
    if (
      deps.quotes &&
      context.claim.analysis?.currency === 'MYR' &&
      !context.claim.review &&
      ['submitted', 'awaiting_review'].includes(context.claim.state) &&
      claimPaymentAmount(context.claim, nowMs) === null
    ) {
      if (!deps.claims.saveFxQuote) {
        throw new ServerError(
          'fx_unavailable',
          503,
          'Quote storage is unavailable.',
        );
      }
      const quote = await deps.quotes(context);
      const saved = await deps.claims.saveFxQuote({ claim: context.claim, quote });
      if (saved.status !== 'saved') {
        throw conflict('Claim changed while quoting; refresh and evaluate again.');
      }
      context.claim = saved.claim;
    }

    let approvedClaim = context.claim;
    if (context.claim.decision) {
      const response = inspectAutoPayState(context.claim);
      if (response) return response;
    } else {
      if (context.claim.state !== 'submitted') throw conflict();

      const mandate = await readCurrentMandate();
      const decision = evaluatePolicy({
        claim: context.claim,
        event: context.event,
        mandate,
        exactDuplicate: false,
        nowMs,
      });
      const stateByOutcome: Record<PolicyOutcome, ProcessedClaimState> = {
        auto_pay: 'approved',
        review: 'awaiting_review',
        reject: 'rejected',
      };

      let saved;
      try {
        saved = await deps.claims.saveDecision({
          claimId: request.claimId,
          decision,
          state: stateByOutcome[decision.outcome],
          ...(context.claim.fxQuote ? { quoteId: context.claim.fxQuote.id } : {}),
        });
      } catch (error) {
        throw databaseError(error);
      }
      const response = inspectAutoPayState(saved.claim);
      if (response) return response;
      approvedClaim = saved.claim;
    }

    try {
      deps.payments.assertReady();
    } catch (error) {
      throw new ServerError(
        'payment_configuration_failed',
        503,
        'Backend payment configuration is unavailable',
        { cause: error },
      );
    }

    const currentMandate = await readCurrentMandate();
    const currentDecision = evaluatePolicy({
      claim: approvedClaim,
      event: context.event,
      mandate: currentMandate,
      exactDuplicate: false,
      nowMs,
    });
    if (currentDecision.outcome !== 'auto_pay') {
      const payment: PaymentResult = {
        ok: false,
        digest: null,
        checkpoint: null,
        gasUsed: null,
        finalityMs: null,
        abortCode: null,
        abortKey: 'POLICY_CHANGED',
        message: 'The live mandate no longer permits automatic payment.',
        rawError: null,
        budgetBefore: currentMandate.remainingBudget,
        budgetAfter: currentMandate.remainingBudget,
      };
      let failed;
      try {
        failed = await deps.claims.failApprovedPayment({
          claimId: approvedClaim.id,
          payment,
        });
      } catch (error) {
        throw databaseError(error);
      }
      if (failed.claim.state === 'paid' || failed.claim.state === 'payment_failed') {
        return completedPaymentResponse(failed.claim);
      }
      if (failed.claim.state === 'paying') {
        throw conflict('Payment requires reconciliation before retrying');
      }
      throw conflict('Claim payment state is inconsistent');
    }

    let reserved;
    try {
      reserved = await deps.claims.reservePayment(approvedClaim.id);
    } catch (error) {
      throw databaseError(error);
    }
    if (reserved.status === 'lost_race') {
      if (reserved.claim.state === 'paid' || reserved.claim.state === 'payment_failed') {
        return completedPaymentResponse(reserved.claim);
      }
      throw conflict('Payment requires reconciliation before retrying');
    }

    let execution;
    try {
      execution = await deps.payments.execute(
        {
          claimId: approvedClaim.id,
          mandateId: context.event.mandateId,
          recipient: approvedClaim.submitter,
          amount: approvedClaim.amount,
          budgetBefore: currentMandate.remainingBudget,
        },
        async (attempt) => {
          let recorded;
          try {
            recorded = await deps.claims.recordPaymentAttempt({
              claimId: approvedClaim.id,
              budgetBefore: currentMandate.remainingBudget,
              ...attempt,
            });
          } catch (error) {
            throw databaseError(error);
          }
          if (recorded.status !== 'saved') {
            throw conflict('A different payment attempt is already recorded');
          }
        },
      );
    } catch (error) {
      if (isServerError(error)) throw error;
      if (error instanceof PaymentSubmissionUncertainError) {
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          'Payment submission requires reconciliation before retrying',
          { cause: error },
        );
      }
      throw new ServerError(
        'payment_submission_uncertain',
        502,
        'Payment submission requires reconciliation before retrying',
        { cause: error },
      );
    }

    let finished;
    try {
      finished = await deps.claims.finishPayment({
        claimId: approvedClaim.id,
        state: execution.status === 'paid' ? 'paid' : 'payment_failed',
        payment: execution.payment,
      });
    } catch (error) {
      throw databaseError(error);
    }
    if (finished.claim.state === 'paid' || finished.claim.state === 'payment_failed') {
      return completedPaymentResponse(finished.claim);
    }
    throw conflict('Payment requires reconciliation before retrying');
  };
}

const HUMAN_REVIEW_OVERRIDES = new Set<RuleId>([
  'fx_quote_approval',
  'category_allowed',
  'receipt_date_valid',
  'confidence_sufficient',
]);

export function createReviewClaimService(deps: {
  claims: ClaimRepository;
  mandates: MandateReader;
  payments: PaymentExecutor;
  now?: () => number;
}): (input: unknown) => Promise<ReviewClaimResponse> {
  return async (input) => {
    let request: ReturnType<typeof parseReviewClaimInput>;
    try {
      request = parseReviewClaimInput(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ServerError('invalid_request', 400, 'Invalid claim review request', {
          cause: error,
        });
      }
      throw error;
    }

    let context: ClaimProcessContext;
    try {
      context = await deps.claims.getProcessContext(request.claimId);
    } catch (error) {
      throw databaseError(error);
    }

    if (request.reviewer.toLowerCase() !== context.event.treasurer.toLowerCase()) {
      throw new ServerError(
        'reviewer_forbidden',
        403,
        'Only the event treasurer may review claims',
      );
    }

    const conflict = (message = 'Claim is not available for review') =>
      new ServerError('processing_conflict', 409, message);
    const uncertain = () =>
      new ServerError(
        'payment_submission_uncertain',
        502,
        'Payment submission requires reconciliation before retrying',
      );

    function replay(storedClaim: Claim): ReviewClaimResponse {
      if (
        request.action === 'approve' &&
        storedClaim.analysis?.currency === 'MYR' &&
        request.quoteId !== storedClaim.fxQuote?.id
      ) {
        throw conflict('Approval does not match the saved payment quote.');
      }
      const stored = storedClaim.review;
      const requestedReason = request.reason ?? null;
      if (
        !stored ||
        stored.action !== request.action ||
        stored.reviewer.toLowerCase() !== request.reviewer.toLowerCase() ||
        stored.reason !== requestedReason
      ) {
        throw conflict('A different review action has already been recorded');
      }

      /* The same decision, already stored. Reporting it as not recorded is
         what stops the caller believing this request is the one that took
         effect. */
      return { claim: storedClaim, recorded: false };
    }

    if (context.claim.review) return replay(context.claim);
    if (
      context.claim.state !== 'awaiting_review' ||
      context.claim.decision?.outcome !== 'review'
    ) {
      throw conflict();
    }

    const claimReview = {
      action: request.action,
      reviewer: request.reviewer,
      reason: request.reason ?? null,
      reviewedAtMs: deps.now?.() ?? Date.now(),
    } as const;

    if (request.action !== 'approve') {
      let applied;
      try {
        applied = await deps.claims.applyReview({
          claimId: request.claimId,
          review: claimReview,
        });
      } catch (error) {
        throw databaseError(error);
      }
      return applied.status === 'saved'
        ? { claim: applied.claim, recorded: true }
        : replay(applied.claim);
    }

    const paymentAmount = claimPaymentAmount(
      context.claim,
      deps.now?.() ?? Date.now(),
    );
    if (paymentAmount === null) {
      throw conflict(
        'A valid USDC amount or unexpired MYR quote is required. Refresh the quote and review again.',
      );
    }
    if (
      context.claim.analysis?.currency === 'MYR' &&
      (request.quoteId !== context.claim.fxQuote?.id ||
        context.claim.fxQuote?.mandateId !== context.event.mandateId)
    ) {
      throw conflict(
        'The displayed quote changed. Refresh and approve the new quote explicitly.',
      );
    }

    let mandate;
    try {
      mandate = await deps.mandates.read(context.event.mandateId);
      if (mandate.id.toLowerCase() !== context.event.mandateId.toLowerCase()) {
        throw new Error('Mandate object ID does not match the event');
      }
    } catch (error) {
      throw new ServerError(
        'mandate_read_failed',
        502,
        'The current Sui mandate could not be read',
        { cause: error },
      );
    }

    const freshDecision = evaluatePolicy({
      claim: context.claim,
      event: context.event,
      mandate,
      exactDuplicate: false,
      nowMs: deps.now?.() ?? Date.now(),
    });
    const prohibitedFailure = freshDecision.checks.some(
      (check) => !check.passed && (check.onChain || !HUMAN_REVIEW_OVERRIDES.has(check.rule)),
    );
    if (prohibitedFailure) {
      throw conflict('The current policy does not permit human approval');
    }

    let applied;
    try {
      applied = await deps.claims.applyReview({
        claimId: request.claimId,
        review: claimReview,
        ...(context.claim.fxQuote ? { quoteId: context.claim.fxQuote.id } : {}),
      });
    } catch (error) {
      throw databaseError(error);
    }
    if (applied.status === 'lost_race') return replay(applied.claim);

    /* Approving leaves the claim in `approved`, and the transfer is a separate
       request. A signature that fails then reads as a failed payment on an
       approved claim, rather than as a treasurer who changed their mind. */
    return { claim: applied.claim, recorded: true };
  };
}

export function createReconcileClaimService(deps: {
  claims: ClaimRepository;
  payments: PaymentExecutor;
  now?: () => number;
}): (input: unknown) => Promise<ReconcileClaimResponse> {
  return async (input) => {
    const value = input as { claimId?: unknown; reconciler?: unknown };
    let request: { claimId: string; processor: string };
    try {
      request = parseProcessClaimInput({
        claimId: value?.claimId,
        processor: value?.reconciler,
      });
    } catch (error) {
      throw new ServerError('invalid_request', 400, 'Invalid reconciliation request', {
        cause: error,
      });
    }

    let context: ClaimProcessContext;
    try {
      context = await deps.claims.getProcessContext(request.claimId);
    } catch (error) {
      throw databaseError(error);
    }
    if (request.processor.toLowerCase() !== context.event.treasurer.toLowerCase()) {
      throw new ServerError(
        'reviewer_forbidden',
        403,
        'Only the event treasurer may reconcile payments',
      );
    }

    const terminal = (claim: Claim): ReconcileClaimResponse | null => {
      if (
        (claim.state !== 'paid' && claim.state !== 'payment_failed') ||
        !claim.payment ||
        !claim.paymentAttempt
      ) {
        return null;
      }
      return {
        claim,
        status: claim.state,
        digest: claim.paymentAttempt.digest,
        payment: claim.payment,
      };
    };
    const storedTerminal = terminal(context.claim);
    if (storedTerminal) return storedTerminal;
    if (context.claim.state !== 'paying') {
      throw new ServerError(
        'processing_conflict',
        409,
        'Claim is not awaiting payment reconciliation',
      );
    }
    const attempt = context.claim.paymentAttempt;
    if (!attempt || context.paymentAttemptBudgetBefore === null) {
      throw new ServerError(
        'payment_reconciliation_unavailable',
        409,
        'This payment has no durable transaction digest to reconcile',
      );
    }
    const verifiedPaymentAmount = claimPaymentAmount(context.claim);
    const paymentAmount =
      context.claim.analysis?.currency === 'MYR'
        ? verifiedPaymentAmount
        : verifiedPaymentAmount ?? context.claim.amount;
    if (paymentAmount === null) {
      throw new ServerError(
        'payment_reconciliation_unavailable',
        409,
        'This payment has no verified USDC amount to reconcile',
      );
    }

    let result;
    try {
      result = await deps.payments.reconcile({
        claimId: context.claim.id,
        mandateId: context.event.mandateId,
        recipient: context.claim.submitter,
        amount: paymentAmount,
        budgetBefore: context.paymentAttemptBudgetBefore,
        digest: attempt.digest,
        preparedAtMs: attempt.preparedAtMs,
      });
    } catch (error) {
      throw new ServerError(
        'payment_reconciliation_failed',
        502,
        'Sui payment status could not be confirmed',
        { cause: error },
      );
    }

    let checked;
    try {
      checked = await deps.claims.markPaymentAttemptChecked({
        claimId: context.claim.id,
        digest: attempt.digest,
        checkedAtMs: deps.now?.() ?? Date.now(),
      });
    } catch (error) {
      throw databaseError(error);
    }
    const checkedTerminal = terminal(checked.claim);
    if (checkedTerminal) return checkedTerminal;
    if (result.status === 'pending') {
      return {
        claim: checked.claim,
        status: 'pending',
        digest: attempt.digest,
        payment: null,
      };
    }

    let finished;
    try {
      finished = await deps.claims.finishPayment({
        claimId: context.claim.id,
        state: result.status === 'paid' ? 'paid' : 'payment_failed',
        payment: result.payment,
      });
    } catch (error) {
      throw databaseError(error);
    }
    const finishedTerminal = terminal(finished.claim);
    if (finishedTerminal) return finishedTerminal;
    throw new ServerError(
      'processing_conflict',
      409,
      'Payment reconciliation was completed by another request',
    );
  };
}
