import type { Claim, PolicyDecision } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { committedFrom, settledFrom, toReviewQueue } from './queue';

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

  it('keeps correction requests out of the treasurer review queue', () => {
    expect(toReviewQueue([claim({ state: 'needs_correction' })])).toEqual([]);
  });

  it('keeps every claim still waiting on the treasurer', () => {
    // `approved` in particular: the decision is made but the transfer is a
    // separate step, so dropping it here would leave the payment with nowhere
    // to be released from.
    for (const state of ['submitted', 'awaiting_review', 'approved', 'paying'] as const) {
      expect(toReviewQueue([claim({ state })]), state).toHaveLength(1);
    }
  });

  it('drops the ones that have finished', () => {
    for (const state of ['paid', 'rejected'] as const) {
      expect(toReviewQueue([claim({ state })]), state).toHaveLength(0);
    }
  });

  it('keeps a failed payment, which is unresolved rather than finished', () => {
    // Nothing left the mandate, so it can be released again — and a claim that
    // dropped out of every actionable tab could never be.
    expect(toReviewQueue([claim({ state: 'payment_failed' })])).toHaveLength(1);
  });
});

describe('settledFrom', () => {
  it('keeps everything that finished, however it finished', () => {
    // A rejected claim used to vanish from every tab, so the record of what
    // happened to it existed nowhere on screen.
    for (const state of ['paid', 'rejected'] as const) {
      expect(settledFrom([claim({ state })]), state).toHaveLength(1);
    }
  });

  it('does not call a failed payment settled', () => {
    expect(settledFrom([claim({ state: 'payment_failed' })])).toHaveLength(0);
  });

  it('leaves anything still in flight to the review queue', () => {
    for (const state of [
      'submitted',
      'awaiting_review',
      'approved',
      'paying',
      'payment_failed',
    ] as const) {
      expect(settledFrom([claim({ state })]), state).toHaveLength(0);
    }
  });
});

describe('committedFrom', () => {
  it('counts what a decision has spoken for but the chain has not moved', () => {
    const total = committedFrom([
      claim({ id: 'a', state: 'approved', amount: '4000000' }),
      claim({ id: 'b', state: 'paying', amount: '2500000' }),
    ]);

    expect(total).toBe('6500000');
  });

  it('counts nothing that is still undecided or already settled', () => {
    // Settled money left the mandate, so the chain figure already reflects it;
    // counting it again here would subtract the same payment twice.
    for (const state of [
      'submitted',
      'awaiting_review',
      'needs_correction',
      'paid',
      'payment_failed',
      'rejected',
    ] as const) {
      expect(committedFrom([claim({ state })]), state).toBe('0');
    }
  });

  it('is zero when there is nothing at all', () => {
    expect(committedFrom([])).toBe('0');
  });
});
