import type { Claim, PolicyDecision } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import {
  approvalBlockReason,
  reviewDialogCopy,
  reviewRequestForClaim,
  validateReviewReason,
} from './review-actions';

const decision: PolicyDecision = {
  outcome: 'review',
  checks: [
    {
      rule: 'category_allowed',
      passed: false,
      label: 'Category allowed',
      detail: 'Review required',
      onChain: false,
    },
  ],
  reason: 'Treasurer review required.',
  evaluatedAtMs: 1,
};

const claim = {
  analysis: { currency: 'USDC' },
} as Claim;

describe('treasurer review UI rules', () => {
  it('submits the exact displayed quote ID when approving a MYR claim', () => {
    const quoted = {
      ...claim,
      analysis: { ...claim.analysis!, currency: 'MYR' },
      fxQuote: {
        id: '33333333-3333-4333-8333-333333333333',
      } as Claim['fxQuote'],
    };

    expect(reviewRequestForClaim(quoted, 'approve')).toEqual({
      action: 'approve',
      quoteId: '33333333-3333-4333-8333-333333333333',
    });
  });
  it('blocks approval for non-USDC claims', () => {
    expect(
      approvalBlockReason({
        ...claim,
        analysis: { ...claim.analysis!, currency: 'MYR' },
      }, decision),
    ).toContain('USDC');
  });

  it('blocks approval for failed on-chain checks', () => {
    const unsafe = {
      ...decision,
      checks: [
        {
          rule: 'mandate_active' as const,
          passed: false,
          label: 'Mandate active',
          detail: 'Revoked',
          onChain: true,
        },
      ],
    };
    /* The rule that failed, not the category it belongs to. "Fails an on-chain
       check" is true of five rules and actionable for none of them. */
    const reason = approvalBlockReason(claim, unsafe);
    expect(reason).toContain('Revoked');
    expect(reason).toContain('cannot be approved');
  });

  /* The case that cost an afternoon: a treasury reached its expiry mid-demo and
     every claim against it became unapprovable, with no hint that expiry was
     the reason. */
  it('says so when the mandate has expired rather than naming the category', () => {
    const expired = {
      ...decision,
      checks: [
        {
          rule: 'not_expired' as const,
          passed: false,
          label: 'Mandate not expired',
          detail: 'Mandate has expired or has an invalid expiry',
          onChain: true,
        },
      ],
    };
    expect(approvalBlockReason(claim, expired)).toContain('expired');
  });

  it('allows approval when only overridable checks failed', () => {
    expect(approvalBlockReason(claim, decision)).toBeNull();
  });

  it.each(['reject', 'request_correction'] as const)(
    'requires a trimmed 1–500 character reason for %s',
    (action) => {
      expect(validateReviewReason(action, '')).toBeTruthy();
      expect(validateReviewReason(action, ' padded ')).toBeTruthy();
      expect(validateReviewReason(action, 'x'.repeat(501))).toBeTruthy();
      expect(validateReviewReason(action, 'Clear reason')).toBeNull();
    },
  );

  it('says approving pays nothing, because it does not', () => {
    // The transfer is a separate button. Promising a payment in this dialog
    // would describe a step the confirm does not take.
    const copy = reviewDialogCopy('approve');

    expect(copy.consequence).toContain('Nothing is paid yet');
    expect(copy.consequence).toContain('separate step');
    expect(copy.confirmLabel).not.toMatch(/pay/i);
  });
});
