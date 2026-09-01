import { describe, expect, it } from 'vitest';

import { parseCreateClaimRequest, parseReviewClaimInput } from './validation';

const claimId = '14ab1f35-2e55-4ca1-a917-dfdc5cf555c7';
const reviewer = `0x${'b'.repeat(64)}`;

describe('parseCreateClaimRequest', () => {
  it('accepts USDC as the payable asset symbol', () => {
    const eventId = '11111111-1111-4111-8111-111111111111';
    const receiptHash = 'a'.repeat(64);

    expect(
      parseCreateClaimRequest({
        eventId,
        submitter: `0x${'a'.repeat(64)}`,
        amount: '1000000',
        merchant: 'Shop',
        receiptDate: '2026-08-31',
        category: 'printing',
        description: '',
        storagePath: `${eventId}/${receiptHash}.png`,
        analysis: {
          merchant: 'Shop',
          amount: '1000000',
          currency: 'USDC',
          receiptDate: '2026-08-31',
          category: 'printing',
          confidence: 0.99,
          uncertainFields: [],
          warnings: [],
          receiptHash,
          fuzzyKey: 'shop|2026-08-31|1000000',
        },
      }),
    ).toMatchObject({ analysis: { currency: 'USDC' } });
  });
});

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
