import type { Claim, PaymentResult } from '@tali/shared';

import { evaluatePolicy } from '../policy/evaluate';
import { ServerError } from '../errors';
import { PaymentSubmissionUncertainError } from '../sui/payment-executor';
import type { ClaimRepository, MandateReader, PaymentExecutor } from './ports';

export interface PayApprovedClaimRequest {
  claimId: string;
  processor: string;
}

export interface PayApprovedClaimResponse {
  claim: Claim;
  payment: PaymentResult;
}

export type PayApprovedClaimService = (
  request: PayApprovedClaimRequest,
) => Promise<PayApprovedClaimResponse>;

/**
 * Pays a claim a treasurer approved.
 *
 * The automatic path runs only when the policy engine says `auto_pay`. This one
 * exists because a human said yes to something the engine sent to review — so
 * re-running the engine and demanding `auto_pay` would refuse the very decision
 * the treasurer made.
 *
 * What is re-checked is the subset the contract itself enforces: the per-claim
 * cap, the recipient allowlist, the remaining budget and the expiry. Those are
 * not the treasurer's to waive, and submitting a payment the contract will
 * abort wastes gas to learn what a read already told us.
 */
export function createPayApprovedClaimService(deps: {
  claims: ClaimRepository;
  mandates: MandateReader;
  payments: PaymentExecutor;
  now?: () => number;
}): PayApprovedClaimService {
  return async (request) => {
    const context = await deps.claims.getProcessContext(request.claimId);

    if (request.processor.toLowerCase() !== context.event.treasurer.toLowerCase()) {
      throw new ServerError(
        'processor_forbidden',
        403,
        'Only the event treasurer may release a payment',
      );
    }
    /* `payment_failed` is retryable on purpose. It is only ever written when
       nothing left the mandate — a policy refusal caught before submission, or
       an abort the chain confirmed — so a transient RPC failure should not
       kill a claim for good. The genuinely unknown case stays in `paying` and
       is reconciled by a human instead. */
    const retrying = context.claim.state === 'payment_failed';
    if (context.claim.state !== 'approved' && !retrying) {
      throw new ServerError(
        'processing_conflict',
        409,
        `This claim is ${context.claim.state.replace(/_/g, ' ')}, so there is nothing to pay`,
      );
    }

    if (context.claim.analysis?.currency !== 'USDC') {
      /* The amount is denominated in something the mandate does not hold, and
         no conversion quote exists anywhere in this codebase. Paying it would
         send that many USDC for a receipt in another currency. */
      throw new ServerError(
        'processing_conflict',
        409,
        'Only a USDC claim can be paid. This one needs an explicit conversion quote first.',
      );
    }

    deps.payments.assertReady();

    let mandate;
    try {
      mandate = await deps.mandates.read(context.event.mandateId);
    } catch (error) {
      throw new ServerError(
        'mandate_read_failed',
        502,
        'The current Sui mandate could not be read',
        { cause: error },
      );
    }

    const decision = evaluatePolicy({
      claim: context.claim,
      event: context.event,
      mandate,
      exactDuplicate: false,
      nowMs: deps.now?.() ?? Date.now(),
    });
    const blocking = decision.checks.filter((check) => check.onChain && !check.passed);

    if (blocking.length > 0) {
      const payment: PaymentResult = {
        ok: false,
        digest: null,
        checkpoint: null,
        gasUsed: null,
        finalityMs: null,
        abortCode: null,
        abortKey: 'POLICY_CHANGED',
        message: `The contract would refuse this payment: ${blocking[0]!.detail}`,
        rawError: null,
        budgetBefore: mandate.remainingBudget,
        budgetAfter: mandate.remainingBudget,
      };
      const failed = await deps.claims.failApprovedPayment({
        claimId: request.claimId,
        payment,
      });
      if (failed.status === 'lost_race') {
        /* Another attempt finished this claim. Returning the refusal built
           here would report a failure against a claim that may well be paid,
           and nothing would have stored it. */
        throw new ServerError(
          'processing_conflict',
          409,
          'This claim was decided by another attempt while it was being checked',
        );
      }
      return { claim: failed.claim, payment };
    }

    const reserved = await deps.claims.reservePayment(
      request.claimId,
      retrying ? 'payment_failed' : 'approved',
    );
    if (reserved.status === 'lost_race') {
      throw new ServerError(
        'processing_conflict',
        409,
        'This claim is already being paid, and needs reconciliation before another attempt',
      );
    }

    let execution;
    try {
      execution = await deps.payments.execute({
        claimId: request.claimId,
        mandateId: context.event.mandateId,
        recipient: context.claim.submitter,
        amount: context.claim.amount,
        budgetBefore: mandate.remainingBudget,
      });
    } catch (error) {
      if (error instanceof PaymentSubmissionUncertainError) {
        /* The claim stays in `paying`. It may have gone through, and a retry
           would pay the member twice. */
        throw new ServerError(
          'payment_submission_uncertain',
          502,
          'The payment was submitted and its outcome is unknown. Check the chain before trying again.',
          { cause: error },
        );
      }
      throw error;
    }

    const finished = await deps.claims.finishPayment({
      claimId: request.claimId,
      state: execution.status === 'paid' ? 'paid' : 'payment_failed',
      payment: execution.payment,
    });
    if (finished.status === 'lost_race') {
      /* The transfer happened, but this row is not the one that recorded it.
         Saying so is the only honest answer: the money moved and the state on
         screen came from somewhere else. */
      throw new ServerError(
        'payment_submission_uncertain',
        502,
        'The payment was submitted but another attempt recorded the outcome. Check the chain before trying again.',
      );
    }

    return { claim: finished.claim, payment: execution.payment };
  };
}
