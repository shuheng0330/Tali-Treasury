import type { Amount, Claim, PolicyDecision, ReviewQueueItem } from '@tali/shared';
import { add } from '@tali/shared';

/**
 * What a treasurer still has to look at. New claims land in `submitted`, and
 * the two review states are what the server policy engine can move them to.
 */
/**
 * Everything still waiting on the treasurer, which includes `approved`: the
 * decision is made but the transfer is a separate step, so an approved claim
 * that dropped out of this list would leave the payment with nowhere to be
 * released from. `needs_correction` is not here — that claim is with the
 * member, and nothing the treasurer does moves it.
 */
const REVIEW_STATES: ReadonlySet<Claim['state']> = new Set([
  'submitted',
  'awaiting_review',
  'approved',
  'paying',
  'payment_failed',
]);

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
/* `payment_failed` is deliberately not here. Nothing was paid and the claim
   can be released again, so it is unresolved rather than settled. */
const SETTLED_STATES: ReadonlySet<Claim['state']> = new Set(['paid', 'rejected']);

export function settledFrom(claims: readonly Claim[]): Claim[] {
  return claims.filter((claim) => SETTLED_STATES.has(claim.state));
}

/**
 * Money a decision has already spoken for but the chain has not moved yet: an
 * approved claim waiting for its transfer, and one whose transfer is in flight.
 * The mandate's remaining budget still counts it as available, so a treasurer
 * reading only that figure would approve past what is really left.
 */
const COMMITTED_STATES: ReadonlySet<Claim['state']> = new Set(['approved', 'paying']);

export function committedFrom(claims: readonly Claim[]): Amount {
  return claims
    .filter((claim) => COMMITTED_STATES.has(claim.state))
    .reduce<Amount>((total, claim) => add(total, claim.amount), '0');
}
