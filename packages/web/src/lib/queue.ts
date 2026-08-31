import type { Claim, PolicyDecision, ReviewQueueItem } from '@tali/shared';

/**
 * What a treasurer still has to look at. New claims land in `submitted`, and
 * the two review states are what the server policy engine can move them to.
 */
const REVIEW_STATES: ReadonlySet<Claim['state']> = new Set([
  'submitted',
  'awaiting_review',
  'needs_correction',
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

export function settledFrom(claims: readonly Claim[]): Claim[] {
  return claims.filter((claim) => claim.state === 'paid');
}
