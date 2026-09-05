import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FxQuoteSummary } from '../components/claim/FxQuoteSummary';
import { ClaimStatusSummary } from '../components/claim/ClaimStatusSummary';
import { DataNotice } from '../components/DataNotice';
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

describe('production-ready application copy', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('uses compact FX evidence and separate cards in employee claim history', () => {
    const claimHome = source('../components/claim/ClaimHome.tsx');

    expect(claimHome).toContain('<FxQuoteSummary claim={claim} variant="compact" />');
    expect(claimHome).toContain('data-employee-claim-card="true"');
    expect(claimHome).toContain('<ul className="flex flex-col gap-4">');
    expect(claimHome).not.toContain('divide-y divide-rule overflow-hidden');
  });

  it('uses a quiet, accurate network footer without development navigation', () => {
    const layout = source('../app/(app)/layout.tsx');
    expect(layout).toContain('Network · Sui Testnet');
    expect(layout).not.toContain('no real funds');
    expect(layout).not.toContain('Design system');
  });

  it('removes the single-wallet notices from claim and treasury journeys', () => {
    const claim = source('../components/claim/ClaimFlow.tsx');
    const treasury = source('../components/treasury/TreasuryDashboard.tsx');
    expect(claim).not.toContain('Single-wallet Testnet demo');
    expect(claim).not.toContain('Payments use test tokens, not real money.');
    expect(treasury).not.toContain('Demo Mode');
    expect(treasury).not.toContain('One Testnet wallet submits and reviews claims.');
  });

  it('presents the legacy treasury name as a product label', () => {
    const header = source('../components/treasury/MandateHeader.tsx');
    expect(header).toContain("eventName.toLowerCase() === 'single-wallet reimbursement demo'");
    expect(header).toContain("? 'Expense treasury'");
    expect(header).toContain('{displayName}</h1>');
  });

  it('uses operational payroll and role labels', () => {
    const setup = source('../components/payroll/PayrollSetup.tsx');
    const stream = source('../components/payroll/SalaryStreamSetup.tsx');
    const roles = source('../components/RoleChooser.tsx');
    const breakdown = source('../components/payroll/Breakdown.tsx');
    const overtime = source('../components/overtime/OvertimePreview.tsx');

    expect(setup).toContain('Monthly gross wage');
    expect(setup).not.toContain('Demo wage');
    expect(stream).toContain('Salary stream');
    expect(stream).toContain('Vesting period');
    expect(stream).not.toContain('salary-stream demo');
    expect(stream).not.toContain('demo period');
    expect(roles).toContain('No role is assigned to this wallet.');
    expect(roles).not.toContain('demo configuration');
    expect(breakdown).not.toContain('Testnet demo');
    expect(overtime).not.toContain('demo mandate');
  });

  it('labels local fallback content as an unavailable preview', () => {
    const html = renderToStaticMarkup(
      <DataNotice
        source="mock"
        reason="the service is unavailable"
        live="Payroll data"
        simulated="Actions requiring live data are unavailable."
      />,
    );
    expect(html).toContain('Preview data.');
    expect(html).toContain('Live data is temporarily unavailable.');
    expect(html).toContain('Actions requiring live data are unavailable.');
    expect(html).not.toContain('Sample data.');
    expect(html).not.toContain('fell back because');
  });

  it('uses preview language for local safety evidence', () => {
    const safety = source('../components/safety/SafetyTest.tsx');
    expect(safety).toContain('Local preview · no transaction submitted');
    expect(safety).toContain('Skip application checks');
    expect(safety).toContain('Application checks stopped this request.');
    expect(safety).not.toContain('mock safety dataset');
    expect(safety).not.toContain('this simulation');
    expect(safety).not.toContain('simulated attempt');
  });

  it('keeps product proof while removing competition and rollout copy', () => {
    const landing = source('../app/page.tsx');
    const evidence = source('../components/landing/Evidence.tsx');
    const wire = source('../components/landing/Wire.tsx');
    expect(landing).toContain('Package on SuiVision');
    expect(landing).toContain('This illustrative payroll');
    expect(landing).not.toContain('MUBA Blockchain Hackathon');
    expect(landing).not.toContain('demo identity');
    expect(landing).not.toContain('No mainnet, no real funds');
    expect(landing).not.toContain('Testnet faucet grant');
    expect(landing).not.toContain('Design system');
    expect(evidence).not.toContain('single-wallet demo mandate');
    expect(wire).not.toContain('Pause the demonstration');
    expect(wire).not.toContain('Play the demonstration');
  });

  it('keeps development terminology out of errors that reach customers', () => {
    for (const path of [
      '../lib/api/mandate.ts',
      '../lib/api/payroll.ts',
      '../lib/api/resubmit.ts',
      '../lib/api/safety.ts',
      '../server/demo-auth.ts',
      '../server/payroll/setup-verification.ts',
      '../lib/payroll-wage.ts',
      '../lib/evidence.ts',
    ]) {
      const contents = source(path);
      expect(contents).not.toContain('demo identity API');
      expect(contents).not.toContain('demo employee');
      expect(contents).not.toContain('demo mandate');
      expect(contents).not.toContain('scaled demo wage');
      expect(contents).not.toContain('single-wallet demo mandate');
    }
  });
});
