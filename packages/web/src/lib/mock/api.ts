import type {
  Amount,
  ExpenseCategory,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
  RuleCheck,
} from '@tali/shared';
import { compare, subtract, toBaseUnits, toDisplay } from '@tali/shared';
import { COMMITTED, MEMBER, mandate, seededClaims } from './data';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hex(length: number) {
  const digits = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

export async function analyzeReceipt(): Promise<ReceiptAnalysis> {
  await wait(2400);

  return {
    merchant: 'Restoran Nasi Kandar Line Clear',
    amount: toBaseUnits('84.00'),
    currency: 'MYR',
    receiptDate: '2026-08-29',
    category: 'food',
    confidence: 0.94,
    uncertainFields: ['category'],
    warnings: [],
    receiptHash: hex(64),
    fuzzyKey: 'restoran-nasi-kandar-line-clear|84.00|2026-08-29',
  };
}

export interface DraftClaim {
  merchant: string;
  amount: Amount;
  receiptDate: string;
  category: ExpenseCategory;
}

export function evaluate(draft: DraftClaim): PolicyDecision {
  const available = subtract(mandate.remainingBudget, COMMITTED);

  const checks: RuleCheck[] = [
    {
      rule: 'category_allowed',
      label: 'Category allowed',
      passed: true,
      detail: `${draft.category} is on the event policy`,
      onChain: false,
    },
    {
      rule: 'not_duplicate',
      label: 'Not a duplicate',
      passed: true,
      detail: 'No matching merchant, amount and date',
      onChain: false,
    },
    {
      rule: 'per_claim_max',
      label: 'Per-claim cap',
      passed: compare(draft.amount, mandate.maxPerClaim) <= 0,
      detail: `${toDisplay(draft.amount)} vs ${toDisplay(mandate.maxPerClaim)} cap`,
      onChain: true,
    },
    {
      rule: 'total_budget',
      label: 'Budget remaining',
      passed: compare(draft.amount, available) <= 0,
      detail: `${toDisplay(available)} available`,
      onChain: true,
    },
    {
      rule: 'recipient_allowlist',
      label: 'Recipient approved',
      passed: mandate.approvedRecipients.includes(MEMBER),
      detail: 'On the mandate allowlist',
      onChain: true,
    },
    {
      rule: 'mandate_active',
      label: 'Mandate active',
      passed: !mandate.revoked,
      detail: 'Not revoked',
      onChain: true,
    },
    {
      rule: 'not_expired',
      label: 'Not expired',
      passed: Date.now() < mandate.expiryMs,
      detail: `Expires ${new Date(mandate.expiryMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      onChain: true,
    },
  ];

  const failed = checks.filter((check) => !check.passed);

  return {
    outcome: failed.length === 0 ? 'auto_pay' : 'review',
    checks,
    reason:
      failed[0] === undefined
        ? 'Every rule passed. Paying from the mandate.'
        : `${failed[0].label} failed — this needs the treasurer.`,
    evaluatedAtMs: Date.now(),
  };
}

export async function pay(amount: Amount): Promise<PaymentResult> {
  await wait(420);
  const available = subtract(mandate.remainingBudget, COMMITTED);

  return {
    ok: true,
    digest: hex(6) + 'qR9nK2wLpX7vB4m' + hex(6),
    checkpoint: '84,201,776',
    gasUsed: toBaseUnits('0.00121'),
    finalityMs: 410,
    abortCode: null,
    abortKey: null,
    message: 'Paid from the mandate.',
    rawError: null,
    budgetBefore: available,
    budgetAfter: subtract(available, amount),
  };
}

export const recentClaims = seededClaims;
