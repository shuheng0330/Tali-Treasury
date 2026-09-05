import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FxQuoteSummary } from '../components/claim/FxQuoteSummary';
import { ClaimStatusSummary } from '../components/claim/ClaimStatusSummary';
import { reviewQueue } from './mock/api';
import type { Claim } from '@tali/shared';

const now = Date.parse('2026-09-05T08:00:00Z');
const quoteClaim: Claim = {
  ...reviewQueue()[0]!.claim,
  state: 'paid',
  createdAtMs: now,
  updatedAtMs: now,
  fxQuote: {
    id: '33333333-3333-4333-8333-333333333333',
    claimId: '11111111-1111-4111-8111-111111111111',
    eventId: '22222222-2222-4222-8222-222222222222',
    recipient: `0x${'a'.repeat(64)}`,
    mandateId: `0x${'1'.repeat(64)}`,
    provider: 'open_exchange_rates',
    sourceCurrency: 'MYR',
    targetCurrency: 'USDC',
    sourceAmount: '6700000',
    targetAmount: '1656284',
    myrPerUsd: '4.0452',
    rateTimestampMs: now,
    fetchedAtMs: now,
    createdAtMs: now,
    expiresAtMs: now - 1,
    valuation: 'USDC_USD_PARITY',
    rounding: 'HALF_UP_6DP',
  },
};

describe('mobile payroll proof polish', () => {
  it('uses concise safety-test copy and removes the old challenge prose', () => {
    const source = readFileSync(
      new URL('../app/(app)/safety/payroll/page.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('Payroll Safety Test');
    expect(source).toContain('Can payroll skip EPF?');
    expect(source).toContain('Set EPF below the required amount. Sui should block the entire payroll.');
    expect(source).not.toContain('An employer who wants to keep the EPF money');
  });

  it('renders the underpayment as the default semantic scenario and summarizes zero movement', () => {
    const source = readFileSync(
      new URL('../components/payroll/EnforcementProof.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('<fieldset');
    expect(source).toContain('type="radio"');
    expect(source).toContain("useState<'valid' | 'underpay'>('underpay')");
    expect(source).toContain('Blocked. No one gets paid.');
    expect(source).toContain('0.000001 USDC');
    expect(source).toContain('0 USDC moved');
    expect(source).toContain('View Full Payroll Calculation');
    expect(source).toContain("scenario === 'underpay'");
    expect(source).toContain('href="/payroll"');
    expect(source).not.toContain("underpay: scenario === 'underpay'");
  });
});

describe('treasury polish', () => {
  it('keeps treasury safeguards behind a disclosure without the module metric', () => {
    const source = readFileSync(
      new URL('../components/treasury/MandateHeader.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('View Treasury Rules');
    expect(source).toContain('Protected on Sui');
    expect(source).not.toContain('label="Enforced by"');
    expect(source).not.toContain('note={`module treasury`}');
  });

  it('renders compact FX evidence with readable dates and an expired label', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const html = renderToStaticMarkup(<FxQuoteSummary claim={quoteClaim} variant="compact" />);
      expect(html).toContain('Payout:');
      expect(html).toContain('Rate Details');
      expect(html).toContain('Provider');
      expect(html).toContain('USDC valued at USD parity');
      expect(html).toContain('Rounded to 6 decimals');
      expect(html).toContain('Expired');
      expect(html).not.toContain('2026-09-05T08:00:00.000Z');
      expect(html).not.toContain('Payment uses existing Testnet USDC');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('renders review claims as independent cards and orders failed checks first', () => {
    const source = readFileSync(
      new URL('../components/treasury/ClaimRow.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('data-claim-card="true"');
    expect(source).toContain('View Checks');
    expect(source).toContain('sortPolicyChecks');
    expect(source).toContain("'Approve'");
    expect(source).toContain("'Request correction'");
    expect(source).toContain("'Reject'");
    for (const action of [
      'Check payment status',
      'Try the payment again',
      'Release the payment',
      'Evaluate claim',
    ]) expect(source).toContain(action);

    const dashboard = readFileSync(
      new URL('../components/treasury/TreasuryDashboard.tsx', import.meta.url),
      'utf8',
    );
    expect(dashboard).toContain('<ul className="grid gap-4">');
    expect(dashboard).toContain('Nothing needs you');
    expect(dashboard).toContain('No payments yet.');
  });

  it('wraps long claim content instead of clipping evidence', () => {
    const row = readFileSync(
      new URL('../components/treasury/ClaimRow.tsx', import.meta.url),
      'utf8',
    );
    const status = readFileSync(
      new URL('../components/claim/ClaimStatusSummary.tsx', import.meta.url),
      'utf8',
    );
    expect(row).toContain('break-words');
    expect(status).toContain('whitespace-pre-wrap break-words');
  });

  it('formats claim outcomes as labelled evidence', () => {
    const html = renderToStaticMarkup(
      <ClaimStatusSummary
        claim={{
          ...quoteClaim,
          state: 'rejected',
          review: {
            action: 'reject',
            reviewer: quoteClaim.submitter,
            reason: 'Personal expense.',
            reviewedAtMs: now,
          },
        }}
        structured
      />,
    );
    expect(html).toContain('<dt');
    expect(html).toContain('Decision');
    expect(html).toContain('Personal expense.');
  });
});
