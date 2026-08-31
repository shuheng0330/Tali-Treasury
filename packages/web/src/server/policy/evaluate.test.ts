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
    currency: 'USDC',
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

  it('routes a non-USDC receipt to review until it has an explicit conversion quote', () => {
    const decision = evaluate({
      claim: {
        ...claim,
        amount: '88000000',
        analysis: { ...claim.analysis!, currency: 'MYR' },
      },
    });

    expect(decision.outcome).toBe('review');
    expect(
      decision.checks.find(({ rule }) => rule === 'confidence_sufficient'),
    ).toMatchObject({
      passed: false,
      detail: 'MYR receipt requires an explicit USDC conversion quote',
    });
    expect(
      decision.checks
        .filter(({ rule }) => ['per_claim_max', 'total_budget'].includes(rule))
        .every(({ passed }) => passed),
    ).toBe(true);
  });

  it('fails closed when persisted analysis arrays are malformed', () => {
    const malformed = {
      ...claim.analysis!,
      uncertainFields: null,
      warnings: null,
    } as unknown as NonNullable<Claim['analysis']>;
    const decision = evaluate({ claim: { ...claim, analysis: malformed } });

    expect(decision.outcome).toBe('review');
    expect(
      decision.checks.find(({ rule }) => rule === 'confidence_sufficient')?.passed,
    ).toBe(false);
  });

  it('does not put a confidence percentage in user-visible rule details', () => {
    const decision = evaluate();

    expect(decision.checks.map(({ detail }) => detail).join(' ')).not.toMatch(/\d+%/);
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

  it('accepts exact monetary and confidence boundaries', () => {
    const decision = evaluate({
      claim: {
        ...claim,
        amount: '5000000',
        analysis: { ...claim.analysis!, confidence: 0.9 },
      },
      mandate: {
        ...mandate,
        maxPerClaim: '5000000',
        remainingBudget: '5000000',
      },
    });

    expect(decision.outcome).toBe('auto_pay');
    expect(
      decision.checks
        .filter(({ rule }) =>
          ['per_claim_max', 'total_budget', 'confidence_sufficient'].includes(
            rule,
          ),
        )
        .every(({ passed }) => passed),
    ).toBe(true);
  });

  it.each(['0', '-1', '1.5', '', '01'])(
    'fails closed for malformed or non-positive claim amount %j',
    (amount) => {
      const decision = evaluate({ claim: { ...claim, amount } });

      expect(decision.outcome).toBe('reject');
      expect(
        decision.checks
          .filter(({ rule }) =>
            ['per_claim_max', 'total_budget'].includes(rule),
          )
          .every(({ passed }) => !passed),
      ).toBe(true);
    },
  );

  it('labels malformed monetary snapshots without rendering a misleading value', () => {
    const decision = evaluate({ claim: { ...claim, amount: '' } });

    expect(
      decision.checks.find(({ rule }) => rule === 'per_claim_max')?.detail,
    ).toContain('invalid amount');
  });

  it.each([
    ['maxPerClaim', { maxPerClaim: 'not-an-integer' }, 'per_claim_max'],
    ['remainingBudget', { remainingBudget: '-1' }, 'total_budget'],
  ] as const)(
    'fails closed for a malformed mandate %s',
    (_label, mandateOverrides, expectedRule) => {
      const decision = evaluate({
        mandate: { ...mandate, ...mandateOverrides },
      });

      expect(decision.outcome).toBe('reject');
      expect(
        decision.checks.find(({ rule }) => rule === expectedRule)?.passed,
      ).toBe(false);
    },
  );

  it.each([
    ['the event start date', '2026-08-29'],
    ['the current UTC date', '2026-08-31'],
  ])('accepts a receipt on %s', (_label, receiptDate) => {
    const decision = evaluate({ claim: { ...claim, receiptDate } });

    expect(decision.outcome).toBe('auto_pay');
  });

  it('accepts a receipt on the event expiry date when it is not in the future', () => {
    const expiryDayNow = Date.UTC(2026, 8, 5, 12);
    const decision = evaluate({
      claim: { ...claim, receiptDate: '2026-09-05' },
      mandate: {
        ...mandate,
        expiryMs: Date.UTC(2026, 8, 6),
      },
      nowMs: expiryDayNow,
    });

    expect(decision.outcome).toBe('auto_pay');
  });

  it.each([
    ['before the event', '2026-08-28'],
    ['in the future', '2026-09-01'],
    ['an impossible calendar date', '2026-02-30'],
    ['a noncanonical date', '2026-8-30'],
  ])('reviews a receipt date %s', (_label, receiptDate) => {
    const decision = evaluate({ claim: { ...claim, receiptDate } });

    expect(decision.outcome).toBe('review');
    expect(
      decision.checks.find(({ rule }) => rule === 'receipt_date_valid')
        ?.passed,
    ).toBe(false);
  });

  it('reviews a receipt after the event even when it is no longer in the future', () => {
    const decision = evaluate({
      claim: { ...claim, receiptDate: '2026-09-06' },
      mandate: { ...mandate, expiryMs: Date.UTC(2026, 8, 7) },
      nowMs: Date.UTC(2026, 8, 6, 12),
    });

    expect(decision.outcome).toBe('review');
    expect(
      decision.checks.find(({ rule }) => rule === 'receipt_date_valid')
        ?.passed,
    ).toBe(false);
  });

  it('treats the mandate expiry timestamp as an exclusive boundary', () => {
    const immediatelyBefore = evaluate({
      nowMs: mandate.expiryMs - 1,
      claim: { ...claim, receiptDate: '2026-09-05' },
    });
    const exactlyAtExpiry = evaluate({ nowMs: mandate.expiryMs });

    expect(immediatelyBefore.outcome).toBe('auto_pay');
    expect(
      immediatelyBefore.checks.find(({ rule }) => rule === 'not_expired')
        ?.passed,
    ).toBe(true);
    expect(exactlyAtExpiry.outcome).toBe('reject');
    expect(
      exactlyAtExpiry.checks.find(({ rule }) => rule === 'not_expired')
        ?.passed,
    ).toBe(false);
  });
});
