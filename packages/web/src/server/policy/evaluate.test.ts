import type { Claim, ExpenseCategory, MandateView } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import {
  evaluatePolicy,
  type PolicyEvaluationInput,
  type PolicyEventSnapshot,
} from './evaluate';

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
  overrides: Partial<PolicyEvaluationInput> = {},
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

  it.each<
    [string, Partial<PolicyEvaluationInput>, string]
  >([
    [
      'the amount exceeds the per-claim cap',
      { claim: { ...claim, amount: '5000001' } },
      'per_claim_max',
    ],
    [
      'the amount exceeds the remaining budget',
      { mandate: { ...mandate, remainingBudget: '4000000' } },
      'total_budget',
    ],
    [
      'the recipient is not allowlisted',
      { mandate: { ...mandate, approvedRecipients: [] } },
      'recipient_allowlist',
    ],
    [
      'the mandate is revoked',
      { mandate: { ...mandate, revoked: true } },
      'mandate_active',
    ],
    [
      'the mandate is expired',
      { mandate: { ...mandate, expiryMs: NOW_MS } },
      'not_expired',
    ],
    ['the receipt is an exact duplicate', { exactDuplicate: true }, 'not_duplicate'],
  ])('rejects when %s', (_label, overrides, expectedRule) => {
    const decision = evaluate(overrides);

    expect(decision.outcome).toBe('reject');
    expect(
      decision.checks.find(({ rule }) => rule === expectedRule)?.passed,
    ).toBe(false);
    expect(decision.reason).toContain('Automatic payment rejected');
  });

  it.each<
    [string, Partial<PolicyEvaluationInput>, string]
  >([
    [
      'the category is outside event policy',
      { claim: { ...claim, category: 'venue' } },
      'category_allowed',
    ],
    [
      'the receipt date is invalid',
      { claim: { ...claim, receiptDate: 'not-a-date' } },
      'receipt_date_valid',
    ],
    [
      'confidence is below 90%',
      {
        claim: {
          ...claim,
          analysis: { ...claim.analysis!, confidence: 0.89 },
        },
      },
      'confidence_sufficient',
    ],
    [
      'Gemini reports an uncertain field',
      {
        claim: {
          ...claim,
          analysis: {
            ...claim.analysis!,
            uncertainFields: ['category'],
          },
        },
      },
      'confidence_sufficient',
    ],
    [
      'Gemini reports a warning',
      {
        claim: {
          ...claim,
          analysis: {
            ...claim.analysis!,
            warnings: ['Receipt total may include a discount'],
          },
        },
      },
      'confidence_sufficient',
    ],
    [
      'receipt analysis is missing',
      { claim: { ...claim, analysis: null } },
      'confidence_sufficient',
    ],
  ])('routes to review when %s', (_label, overrides, expectedRule) => {
    const decision = evaluate(overrides);

    expect(decision.outcome).toBe('review');
    expect(
      decision.checks.find(({ rule }) => rule === expectedRule)?.passed,
    ).toBe(false);
    expect(decision.reason).toContain('Treasurer review required');
  });

  it('lets a hard failure take precedence while preserving review failures', () => {
    const decision = evaluate({
      claim: {
        ...claim,
        analysis: { ...claim.analysis!, confidence: 0.5 },
      },
      mandate: { ...mandate, revoked: true },
    });

    expect(decision.outcome).toBe('reject');
    expect(
      decision.checks
        .filter(({ passed }) => !passed)
        .map(({ rule }) => rule),
    ).toEqual(['mandate_active', 'confidence_sufficient']);
  });
});
