import type { Claim, ExpenseCategory, MandateView } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { evaluatePolicy, type PolicyEventSnapshot } from './evaluate';

const NOW_MS = Date.UTC(2026, 7, 31, 7, 0, 0);
const MEMBER = `0x${'a'.repeat(64)}`;

const claim: Pick<
  Claim,
  'submitter' | 'amount' | 'receiptDate' | 'category' | 'analysis'
> = {
  submitter: MEMBER,
  amount: '4500000',
  receiptDate: '2026-08-30',
  category: 'printing',
  analysis: {
    merchant: 'Campus Print Shop',
    amount: '4500000',
    currency: 'MYR',
    receiptDate: '2026-08-30',
    category: 'printing',
    confidence: 0.96,
    uncertainFields: [],
    warnings: [],
    receiptHash: 'a'.repeat(64),
    fuzzyKey: 'campus print shop|2026-08-30|4500000',
  },
};

const event: PolicyEventSnapshot = {
  allowedCategories: [
    'food',
    'printing',
    'transport',
  ] satisfies ExpenseCategory[],
  startsAtMs: Date.UTC(2026, 7, 29),
  expiresAtMs: Date.UTC(2026, 8, 5, 23, 59, 59),
};

const mandate: MandateView = {
  id: `0x${'1'.repeat(64)}`,
  coinType: '0x2::usdc::USDC',
  initialBudget: '100000000',
  remainingBudget: '80000000',
  amountSpent: '20000000',
  maxPerClaim: '5000000',
  expiryMs: Date.UTC(2026, 8, 5, 23, 59, 59),
  revoked: false,
  approvedRecipients: [MEMBER],
  fetchedAtMs: NOW_MS,
};

const expectedRules = [
  'per_claim_max',
  'total_budget',
  'recipient_allowlist',
  'mandate_active',
  'not_expired',
  'not_duplicate',
  'category_allowed',
  'receipt_date_valid',
  'confidence_sufficient',
];

function evaluate(
  overrides: Partial<Parameters<typeof evaluatePolicy>[0]> = {},
) {
  return evaluatePolicy({
    claim,
    event,
    mandate,
    exactDuplicate: false,
    nowMs: NOW_MS,
    ...overrides,
  });
}

describe('evaluatePolicy', () => {
  it('returns an explainable auto-pay decision when every rule passes', () => {
    const decision = evaluate();

    expect(decision.outcome).toBe('auto_pay');
    expect(decision.evaluatedAtMs).toBe(NOW_MS);
    expect(decision.checks.map(({ rule }) => rule)).toEqual(expectedRules);
    expect(decision.checks.every(({ passed }) => passed)).toBe(true);
    expect(
      decision.checks
        .filter(({ onChain }) => onChain)
        .map(({ rule }) => rule),
    ).toEqual([
      'per_claim_max',
      'total_budget',
      'recipient_allowlist',
      'mandate_active',
      'not_expired',
    ]);
    expect(decision.reason).toContain('eligible for automatic payment');
  });
});
