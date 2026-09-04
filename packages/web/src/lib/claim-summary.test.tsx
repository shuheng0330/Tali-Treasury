import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Claim } from '@tali/shared';
import { paidLabel, claimExplanation } from './claim-summary';
import { recentClaims } from './mock/api';
import { ClaimStatusSummary } from '../components/claim/ClaimStatusSummary';
import { ClaimHome } from '../components/claim/ClaimHome';

const base: Claim = { ...recentClaims[0], state: 'paid', review: null, decision: null };
const review = { action: 'approve' as const, reviewer: base.submitter, reason: null, reviewedAtMs: 1 };

describe('claim outcome presentation', () => {
  it('uses approval history even if the final policy evaluation passed automatically', () => {
    expect(paidLabel({ ...base, review, decision: { outcome: 'auto_pay', checks: [], reason: '', evaluatedAtMs: 1 } }))
      .toBe('Paid after review');
  });
  it('only calls payments automatic when the recorded decision supports it', () => {
    expect(paidLabel({ ...base, decision: { outcome: 'auto_pay', checks: [], reason: '', evaluatedAtMs: 1 } })).toBe('Auto-paid');
    expect(paidLabel(base)).toBe('Paid');
  });
  it('shows the correction reason in both the shared treasury summary and My Claims', () => {
    const claim: Claim = { ...base, state: 'needs_correction', review: { ...review, action: 'request_correction', reason: 'Please upload a readable receipt.' } };
    const summary = renderToStaticMarkup(<ClaimStatusSummary claim={claim} />);
    const home = renderToStaticMarkup(<ClaimHome eventName="Demo" available="10000000" budget="10000000" claims={[claim]} onCapture={() => {}} onCorrect={() => {}} />);
    for (const html of [summary, home]) {
      expect(html).toContain('Please upload a readable receipt.');
      expect(html).toContain('Needs correction');
    }
  });
  it('prioritizes the reviewer rejection over an earlier evaluation', () => {
    const claim: Claim = { ...base, state: 'rejected', review: { ...review, action: 'reject', reason: 'Personal expense.' },
      decision: { outcome: 'review', checks: [], reason: 'Earlier decision', evaluatedAtMs: 0 } };
    expect(claimExplanation(claim)).toBe('Personal expense.');
  });
  it('explains policy rejection and never reuses correction feedback for a failed payment', () => {
    const decision: Claim['decision'] = { outcome: 'reject', evaluatedAtMs: 1, reason: 'Rejected',
      checks: [{ rule: 'per_claim_max', passed: false, label: 'Cap', detail: 'Amount exceeds the 5 USDC limit.', onChain: true }] };
    expect(claimExplanation({ ...base, state: 'rejected', decision })).toBe('Amount exceeds the 5 USDC limit.');
    expect(claimExplanation({ ...base, state: 'payment_failed', payment: null,
      review: { ...review, action: 'request_correction', reason: 'Old correction' } })).toContain('Payment failed');
  });
  it('keeps rejection reasons escaped as text', () => {
    const html = renderToStaticMarkup(<ClaimStatusSummary claim={{ ...base, state: 'rejected',
      review: { ...review, action: 'reject', reason: '<script>alert(1)</script>' } }} />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
