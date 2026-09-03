import type { Claim, PaymentResult, ReconcileClaimResponse } from '@tali/shared';

import { ServerError } from '../errors';
import type { ClaimRepository } from './ports';

export interface ReconcileClaimRequest {
  claimId: string;
  processor: string;
  /** What the treasurer found on the chain. */
  outcome: 'paid' | 'not_paid';
  /** Required when the transfer did happen: the transaction that made it. */
  digest?: string;
}

export type ReconcileClaimService = (
  request: ReconcileClaimRequest,
) => Promise<ReconcileClaimResponse>;

const DIGEST = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

/**
 * Records what actually happened to a payment whose outcome the server never
 * learned.
 *
 * A claim reaches `paying` and stays there when the submission itself threw:
 * the transaction may or may not have reached the chain, and retrying could
 * pay the member twice. Nothing automated can settle that safely, so this is
 * the one transition a human makes on the chain's behalf — after reading it —
 * and it demands the digest as evidence when they say the money moved.
 */
export function createReconcileClaimService(deps: {
  claims: ClaimRepository;
  now?: () => number;
}): ReconcileClaimService {
  return async (request) => {
    const context = await deps.claims.getProcessContext(request.claimId);

    if (request.processor.toLowerCase() !== context.event.treasurer.toLowerCase()) {
      throw new ServerError(
        'processor_forbidden',
        403,
        'Only the event treasurer may reconcile a payment',
      );
    }
    if (context.claim.state !== 'paying') {
      throw new ServerError(
        'processing_conflict',
        409,
        `This claim is ${context.claim.state.replace(/_/g, ' ')}, so its payment is not in doubt`,
      );
    }

    const digest = request.digest?.trim();
    if (request.outcome === 'paid' && (!digest || !DIGEST.test(digest))) {
      /* Without it there is nothing anybody can check this claim against, and
         "paid" would rest on one person's word. */
      throw new ServerError(
        'invalid_request',
        400,
        'Marking a claim paid needs the digest of the transaction that paid it',
      );
    }

    const paid = request.outcome === 'paid';
    const payment: PaymentResult = {
      ok: paid,
      digest: paid ? digest! : null,
      checkpoint: null,
      gasUsed: null,
      finalityMs: null,
      abortCode: null,
      abortKey: paid ? null : 'RECONCILED_NOT_PAID',
      message: paid
        ? 'Confirmed on chain by the treasurer after the submission result was lost.'
        : 'The treasurer checked the chain and found no payment. The claim can be released again.',
      rawError: null,
      budgetBefore: context.claim.payment?.budgetBefore ?? '0',
      budgetAfter: context.claim.payment?.budgetBefore ?? '0',
    };

    const finished = await deps.claims.finishPayment({
      claimId: request.claimId,
      state: paid ? 'paid' : 'payment_failed',
      payment,
    });

    return { claim: finished.claim, recorded: finished.status === 'saved' };
  };
}
