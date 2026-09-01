import type { Claim, PolicyDecision } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { settledFrom, toReviewQueue } from './queue';

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

  it('keeps every claim still waiting on the treasurer', () => {
    // `approved` in particular: the decision is made but the transfer is a
    // separate step, so dropping it here would leave the payment with nowhere
    // to be released from.
    for (const state of ['submitted', 'awaiting_review', 'needs_correction', 'approved', 'paying'] as const) {
      expect(toReviewQueue([claim({ state })]), state).toHaveLength(1);
    }
  });

  it('drops the ones that have finished', () => {
    for (const state of ['paid', 'payment_failed', 'rejected'] as const) {
      expect(toReviewQueue([claim({ state })]), state).toHaveLength(0);
    }
  });
});

describe('settledFrom', () => {
  it('keeps everything that finished, however it finished', () => {
    // A rejected or failed claim used to vanish from every tab, so the record
    // of what happened to it existed nowhere on screen.
    for (const state of ['paid', 'payment_failed', 'rejected'] as const) {
      expect(settledFrom([claim({ state })]), state).toHaveLength(1);
    }
  });

  it('leaves anything still in flight to the review queue', () => {
    for (const state of ['submitted', 'awaiting_review', 'approved', 'paying'] as const) {
      expect(settledFrom([claim({ state })]), state).toHaveLength(0);
    }
  });
});
