import { describe, expect, it, vi } from 'vitest';
import type { Claim } from '@tali/shared';

import { createReviewClaimService } from './review';
import type { ClaimRepository } from './ports';

const TREASURER = `0x${'b'.repeat(64)}`;
const MEMBER = `0x${'a'.repeat(64)}`;
const CLAIM_ID = 'claim-1';

const claim = { id: CLAIM_ID, state: 'awaiting_review' } as Claim;

type SaveReviewInput = Parameters<ClaimRepository['saveReview']>[0];

function service(overrides: Partial<ClaimRepository> = {}) {
  const saveReview = vi.fn(async (_input: SaveReviewInput) => ({
    status: 'saved' as const,
    claim,
  }));
  const claims = {
    getProcessContext: vi.fn(async () => ({
      claim,
      event: { treasurer: TREASURER },
    })),
    saveReview,
    ...overrides,
  } as unknown as ClaimRepository;

  return {
    claims,
    saveReview,
    impl: createReviewClaimService({ claims, now: () => 1_700_000_000_000 }),
  };
}

describe('createReviewClaimService', () => {
  it('records an approval without demanding a reason', async () => {
    const { impl, saveReview } = service();

    const result = await impl({ claimId: CLAIM_ID, reviewer: TREASURER, action: 'approve' });

    expect(result.recorded).toBe(true);
    const saved = saveReview.mock.calls[0]![0];
    expect(saved.state).toBe('approved');
    expect(saved.review.reason).toBeUndefined();
    expect(saved.review.reviewedAt).toBe('2023-11-14T22:13:20.000Z');
  });

  it('refuses a rejection with no reason the member could read', async () => {
    const { impl, saveReview } = service();

    await expect(
      impl({ claimId: CLAIM_ID, reviewer: TREASURER, action: 'reject' }),
    ).rejects.toThrow('needs a reason');
    await expect(
      impl({ claimId: CLAIM_ID, reviewer: TREASURER, action: 'reject', reason: '   ' }),
    ).rejects.toThrow('needs a reason');

    expect(saveReview).not.toHaveBeenCalled();
  });

  it('refuses a correction request that does not say what to correct', async () => {
    const { impl } = service();

    await expect(
      impl({ claimId: CLAIM_ID, reviewer: TREASURER, action: 'request_correction' }),
    ).rejects.toThrow('what to correct');
  });

  it('sends each action to the state it belongs in', async () => {
    for (const [action, state] of [
      ['approve', 'approved'],
      ['reject', 'rejected'],
      ['request_correction', 'needs_correction'],
    ] as const) {
      const { impl, saveReview } = service();
      await impl({ claimId: CLAIM_ID, reviewer: TREASURER, action, reason: 'because' });
      expect(saveReview.mock.calls[0]![0].state).toBe(state);
    }
  });

  it('lets nobody but the treasurer decide', async () => {
    const { impl, saveReview } = service();

    await expect(
      impl({ claimId: CLAIM_ID, reviewer: MEMBER, action: 'approve' }),
    ).rejects.toThrow('Only the event treasurer');
    expect(saveReview).not.toHaveBeenCalled();
  });

  it('stores the treasurer from the event, not the address the caller sent', async () => {
    // The two are compared case-insensitively, so echoing the request back
    // would let the casing of an unauthenticated field into the record.
    const { impl, saveReview } = service();

    await impl({ claimId: CLAIM_ID, reviewer: TREASURER.toUpperCase(), action: 'approve' });

    expect(saveReview.mock.calls[0]![0].review.reviewer).toBe(TREASURER);
  });

  it('reports a lost race as not recorded, and returns the decision that stands', async () => {
    const winner = { ...claim, state: 'rejected' } as Claim;
    const { impl } = service({
      saveReview: vi.fn(async () => ({ status: 'lost_race' as const, claim: winner })),
    });

    const result = await impl({ claimId: CLAIM_ID, reviewer: TREASURER, action: 'approve' });

    expect(result.recorded).toBe(false);
    expect(result.claim.state).toBe('rejected');
  });

  it('trims the reason it stores', async () => {
    const { impl, saveReview } = service();

    await impl({
      claimId: CLAIM_ID,
      reviewer: TREASURER,
      action: 'reject',
      reason: '  Receipt is outside the event window.  ',
    });

    expect(saveReview.mock.calls[0]![0].review.reason).toBe(
      'Receipt is outside the event window.',
    );
  });
});
