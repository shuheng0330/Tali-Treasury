import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Claim } from '@tali/shared';
import { FxQuoteSummary } from '../components/claim/FxQuoteSummary';
import { ReviewActionDialog } from '../components/treasury/ReviewActionDialog';

const now = Date.parse('2026-09-03T09:00:00Z');
const claim: Claim = {
  id: '11111111-1111-4111-8111-111111111111', eventId: '22222222-2222-4222-8222-222222222222',
  submitter: `0x${'a'.repeat(64)}`, submitterName: 'Test member', state: 'awaiting_review', amount: '17250000',
  merchant: 'Test receipt', receiptDate: '2026-09-03', category: 'printing', description: '', receiptUrl: null,
  receiptHash: 'a'.repeat(64), review: null, payment: null, paymentAttempt: null, createdAtMs: now, updatedAtMs: now,
  analysis: { currency: 'MYR', amount: '17250000', merchant: 'Test receipt', receiptDate: '2026-09-03',
    category: 'printing', confidence: 1, uncertainFields: [], warnings: [], receiptHash: 'a'.repeat(64), fuzzyKey: 'test' },
  decision: { outcome: 'review', checks: [], reason: 'Review quote', evaluatedAtMs: now },
  fxQuote: { id: '33333333-3333-4333-8333-333333333333', claimId: '11111111-1111-4111-8111-111111111111',
    eventId: '22222222-2222-4222-8222-222222222222', recipient: `0x${'a'.repeat(64)}`, mandateId: `0x${'1'.repeat(64)}`,
    provider: 'open_exchange_rates', sourceCurrency: 'MYR', targetCurrency: 'USDC', sourceAmount: '17250000',
    targetAmount: '4263786', myrPerUsd: '4.0457', rateTimestampMs: now, fetchedAtMs: now, createdAtMs: now,
    expiresAtMs: now + 900_000, valuation: 'USDC_USD_PARITY', rounding: 'HALF_UP_6DP' },
};

describe('FX display and approval disclosure', () => {
  it('shows original MYR, exact USDC amount, source and parity assumption', () => {
    const html = renderToStaticMarkup(<FxQuoteSummary claim={claim} />);
    for (const value of ['17.25', 'MYR', '4.263786', 'USDC', '4.0457', 'Open Exchange Rates', '1 USDC = 1 USD',
      '2026-09-03T09:00:00.000Z', '2026-09-03T09:15:00.000Z', 'not a currency exchange']) expect(html).toContain(value);
    expect(html).not.toContain('confidence');
  });
  it('does not invent a quote for a native claim', () => {
    expect(renderToStaticMarkup(<FxQuoteSummary claim={{ ...claim, fxQuote: null }} />)).toBe('');
  });
  it('keeps the saved valuation visible after payment', () => {
    expect(renderToStaticMarkup(<FxQuoteSummary claim={{ ...claim, state: 'paid' }} />)).toContain('Paid using the saved quote');
  });
  it('disables payment confirmation for an expired quote', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now + 900_000);
    try {
      const html = renderToStaticMarkup(<ReviewActionDialog claim={claim} action="approve" pending={false}
        serverError={null} onCancel={() => {}} onConfirm={() => {}} />);
      expect(html).toContain('Refresh the quote and review again');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Approve and pay<\/button>/);
    } finally { vi.restoreAllMocks(); }
  });
});
