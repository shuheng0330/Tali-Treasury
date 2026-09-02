import type { Claim, PolicyDecision } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { toReviewQueue } from './queue';

const decision: PolicyDecision = {
  outcome: 'review',
  checks: [],
  reason: 'Stored server decision',
  evaluatedAtMs: 1,
};

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-id',
    eventId: 'event-id',
    submitter: `0x${'a'.repeat(64)}`,
    submitterName: 'Member',
    state: 'awaiting_review',
    amount: '1000000',
    merchant: 'Merchant',
    receiptDate: '2026-08-31',
    category: 'food',
    description: '',
    receiptUrl: null,
    receiptHash: 'a'.repeat(64),
    analysis: null,
    decision,
    review: null,
    paymentAttempt: null,
    payment: null,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

describe('toReviewQueue', () => {
  it('uses the stored server decision for a processed live claim', () => {
    expect(toReviewQueue([claim()])[0]?.decision).toBe(decision);
  });

  it('does not invent a policy result for an unprocessed claim', () => {
    const item = toReviewQueue([
      claim({ state: 'submitted', decision: null }),
    ])[0];

    expect(item?.decision.checks).toEqual([]);
    expect(item?.decision.reason).toBe('Awaiting server policy evaluation.');
  });

  it('keeps correction requests out of the treasurer review queue', () => {
    expect(toReviewQueue([claim({ state: 'needs_correction' })])).toEqual([]);
  });
});
