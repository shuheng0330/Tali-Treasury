import type { Claim, PolicyDecision, ReviewQueueItem } from '@tali/shared';

/**
 * What a treasurer still has to look at. New claims land in `submitted`, and
 * the two review states are what the server policy engine can move them to.
 */
/**
 * Everything still waiting on the treasurer, which includes `approved`: the
 * decision is made but the transfer is a separate step, so an approved claim
 * that dropped out of this list would leave the payment with nowhere to be
 * released from.
 */
const REVIEW_STATES: ReadonlySet<Claim['state']> = new Set([
  'submitted',
  'awaiting_review',
  'needs_correction',
  'approved',
  'paying',
]);

/** Nothing tracks committed-but-unsettled claims yet, so the reserve is zero. */

/**
 * An unprocessed claim gets a presentation-only pending decision. It contains
 * no invented checks and cannot be approved until the server stores a result.
 */
const PENDING_DECISION: PolicyDecision = {
  outcome: 'review',
  checks: [],
  reason: 'Awaiting server policy evaluation.',
  evaluatedAtMs: 0,
};

export function toReviewQueue(claims: readonly Claim[]): ReviewQueueItem[] {
  return claims
    .filter((claim) => REVIEW_STATES.has(claim.state))
    .map((claim) => {
      const decision = claim.decision ?? PENDING_DECISION;

      return {
        claim,
        decision,
        agentNote: '',
        reason:
          decision.checks.length === 0 || decision.outcome === 'review'
            ? 'agent_uncertain'
            : 'rule_failed',
      };
    });
}

/** Everything that has finished, however it finished. */
const SETTLED_STATES: ReadonlySet<Claim['state']> = new Set([
  'paid',
  'payment_failed',
  'rejected',
]);

export function settledFrom(claims: readonly Claim[]): Claim[] {
  return claims.filter((claim) => SETTLED_STATES.has(claim.state));
}
