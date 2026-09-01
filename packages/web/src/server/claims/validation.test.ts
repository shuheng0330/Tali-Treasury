import { describe, expect, it } from 'vitest';

import { parseReviewClaimInput } from './validation';

const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const reviewer = `0x${'b'.repeat(64)}`;

describe('parseReviewClaimInput', () => {
  it('accepts approval without a reason', () => {
    expect(parseReviewClaimInput({ claimId, action: 'approve', reviewer })).toEqual({
      claimId,
      action: 'approve',
      reviewer,
    });
  });

  it.each(['reject', 'request_correction'] as const)(
    'requires a trimmed reason for %s',
    (action) => {
      expect(() => parseReviewClaimInput({ claimId, action, reviewer })).toThrow();
      expect(() =>
        parseReviewClaimInput({ claimId, action, reviewer, reason: ' fix this ' }),
      ).toThrow();
      expect(
        parseReviewClaimInput({ claimId, action, reviewer, reason: 'Upload a clear receipt' }),
      ).toEqual({ claimId, action, reviewer, reason: 'Upload a clear receipt' });
    },
  );

  it('rejects reasons longer than 500 characters', () => {
    expect(() =>
      parseReviewClaimInput({
        claimId,
        action: 'reject',
        reviewer,
        reason: 'x'.repeat(501),
      }),
    ).toThrow();
  });
});
