import type { Claim, MandateView, ReviewQueueItem } from '@tali/shared';
import { evaluate } from '@/lib/mock/api';

/**
 * What a treasurer still has to look at. New claims land in `submitted`, and
 * the two review states are what the policy engine will move them to once it
 * exists — until then the queue is whatever has not been settled or refused.
 */
const REVIEW_STATES: ReadonlySet<Claim['state']> = new Set([
  'submitted',
  'awaiting_review',
  'needs_correction',
]);

/** Nothing tracks committed-but-unsettled claims yet, so the reserve is zero. */

/**
 * Builds the review queue out of real claims. The claims are the database's;
 * the decision attached to each one is still evaluated locally, because no
 * policy endpoint exists yet — `/api/claims/:id/process` is declared in the
 * shared contract and has no route handler behind it.
 */
export function toReviewQueue(
  claims: readonly Claim[],
  against: MandateView,
): ReviewQueueItem[] {
  return claims
    .filter((claim) => REVIEW_STATES.has(claim.state))
    .map((claim) => {
      const decision = evaluate({
        merchant: claim.merchant,
        amount: claim.amount,
        receiptDate: claim.receiptDate,
        category: claim.category,
        recipient: claim.submitter,
        description: claim.description,
        confidence: claim.analysis?.confidence ?? 0,
        receiptHash: claim.receiptHash,
      }, against, '0');

      return {
        claim,
        decision,
        agentNote: '',
        reason: decision.outcome === 'auto_pay' ? 'agent_uncertain' : 'rule_failed',
      };
    });
}

export function settledFrom(claims: readonly Claim[]): Claim[] {
  return claims.filter((claim) => claim.state === 'paid');
}
