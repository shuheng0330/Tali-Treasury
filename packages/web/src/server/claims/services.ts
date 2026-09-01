import type {
  AnalyzeReceiptResponse,
  Claim,
  CreateClaimResponse,
  ListClaimsResponse,
  PaymentResult,
  PolicyOutcome,
  ProcessClaimResponse,
  ReviewClaimResponse,
  RuleId,
} from '@tali/shared';
import { ZodError } from 'zod';

import { ServerError, isServerError } from '../errors';
import { evaluatePolicy } from '../policy/evaluate';
import type { ReceiptAnalyzer } from '../receipts/gemini';
import { hashReceipt, type ReceiptMimeType } from '../receipts/hash';
import { toReceiptAnalysis } from '../receipts/schema';
import { PaymentSubmissionUncertainError } from '../sui/payment-executor';
import type {
  ClaimRepository,
  ClaimProcessContext,
  MandateReader,
  PaymentExecutor,
  ProcessedClaimState,
  ReceiptStore,
} from './ports';
import {
  eventIdSchema,
  parseCreateClaimRequest,
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

function databaseError(error: unknown): ServerError {
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
        storagePath: duplicate.storagePath,
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

    return { analysis, storagePath, duplicateOf: null };
  };
}

export function createClaimService(deps: {
  claims: ClaimRepository;
}): (input: unknown) => Promise<CreateClaimResponse> {
  return async (input) => {
    let request;
    try {
      request = parseCreateClaimRequest(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ServerError('invalid_request', 400, 'Invalid claim request', {
          cause: error,
        });
      }
      throw error;
    }

    try {
      await deps.claims.assertEventExists(request.eventId);
      await deps.claims.assertActiveMember(request.eventId, request.submitter);
      return { claim: await deps.claims.create(request) };
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
      await deps.claims.assertActiveMember(eventId, viewer);
      storedClaims = await deps.claims.listByEvent(eventId);
    } catch (error) {
      throw databaseError(error);
    }

    try {
      const claims = await Promise.all(
        storedClaims.map(async ({ claim, storagePath }) => ({
          ...claim,
          receiptUrl: await deps.receipts.createSignedUrl(storagePath, 300),
        })),
      );
      return { claims, cursor: null };
    } catch (error) {
      throw new ServerError(
        'storage_failed',
        500,
        'Receipt URL creation failed',
        { cause: error },
      );
    }
  };
}

export function createProcessClaimService(deps: {
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
        nowMs: deps.now?.() ?? Date.now(),
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
      nowMs: deps.now?.() ?? Date.now(),
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
      execution = await deps.payments.execute({
        claimId: approvedClaim.id,
        mandateId: context.event.mandateId,
        recipient: approvedClaim.submitter,
        amount: approvedClaim.amount,
        budgetBefore: currentMandate.remainingBudget,
      });
    } catch (error) {
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

      if (stored.action !== 'approve') {
        return { claim: storedClaim, payment: null };
      }
      if (storedClaim.state === 'paying') throw uncertain();
      if (
        (storedClaim.state === 'paid' || storedClaim.state === 'payment_failed') &&
        storedClaim.payment
      ) {
        return { claim: storedClaim, payment: storedClaim.payment };
      }
      throw conflict('Claim payment state is inconsistent');
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
        ? { claim: applied.claim, payment: null }
        : replay(applied.claim);
    }

    if (context.claim.analysis?.currency !== 'USDC') {
      throw conflict('Only USDC claims can be approved for payment');
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
      });
    } catch (error) {
      throw databaseError(error);
    }
    if (applied.status === 'lost_race') return replay(applied.claim);

    let execution;
    try {
      execution = await deps.payments.execute({
        claimId: context.claim.id,
        mandateId: context.event.mandateId,
        recipient: context.claim.submitter,
        amount: context.claim.amount,
        budgetBefore: mandate.remainingBudget,
      });
    } catch (error) {
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
        claimId: context.claim.id,
        state: execution.status === 'paid' ? 'paid' : 'payment_failed',
        payment: execution.payment,
      });
    } catch (error) {
      throw databaseError(error);
    }
    if (
      (finished.claim.state === 'paid' || finished.claim.state === 'payment_failed') &&
      finished.claim.payment
    ) {
      return { claim: finished.claim, payment: finished.claim.payment };
    }
    throw uncertain();
  };
}
