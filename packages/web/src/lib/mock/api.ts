import type {
  Amount,
  Claim,
  ExpenseCategory,
  PaymentResult,
  PolicyDecision,
  ReceiptAnalysis,
  RuleCheck,
} from '@tali/shared';
import { compare, subtract, toBaseUnits, toDisplay } from '@tali/shared';
import type { SafetyAttackId } from '@tali/shared';
import { treasuryErrorFromCode } from '@tali/treasury-sui';
import { COMMITTED, MEMBER, mandate, queuedClaims, seededClaims } from './data';

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
  recipient?: string;
}

export function evaluate(draft: DraftClaim): PolicyDecision {
  const available = subtract(mandate.remainingBudget, COMMITTED);
  const recipient = draft.recipient ?? MEMBER;

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
      passed: mandate.approvedRecipients.includes(recipient),
      detail: mandate.approvedRecipients.includes(recipient)
        ? 'On the mandate allowlist'
        : `${recipient.slice(0, 6)}…${recipient.slice(-4)} is not on the allowlist`,
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

export interface QueueItem {
  claim: Claim;
  decision: PolicyDecision;
  agentNote: string;
  /** A failed rule and an uncertain agent are different reviewer tasks. */
  reason: 'rule_failed' | 'agent_uncertain';
}

const QUEUE_NOTES: Record<string, string> = {
  'q-0148': 'Amount is 70% over the per-claim cap. The chain will refuse this if I try.',
  'q-0147': 'New recipient, never paid from this mandate before.',
  'q-0146': 'Every rule passes. The receipt photo is too dark to read the total.',
};

export function reviewQueue(): QueueItem[] {
  return queuedClaims.map((claim) => {
    const decision = evaluate({
      merchant: claim.merchant,
      amount: claim.amount,
      receiptDate: claim.receiptDate,
      category: claim.category,
      recipient: claim.submitter,
    });

    return {
      claim,
      decision,
      agentNote: QUEUE_NOTES[claim.id] ?? '',
      reason: decision.outcome === 'auto_pay' ? 'agent_uncertain' : 'rule_failed',
    };
  });
}

export function settledClaims(): Claim[] {
  return seededClaims.filter((claim) => claim.state === 'paid');
}

export interface AttackInput {
  attack: SafetyAttackId;
  amount: Amount;
  recipient: string;
  revokedFirst: boolean;
}

function attackChecks(input: AttackInput): RuleCheck[] {
  const available = subtract(mandate.remainingBudget, COMMITTED);
  const approved = mandate.approvedRecipients.includes(input.recipient);

  return [
    {
      rule: 'per_claim_max',
      label: 'Per-claim cap',
      passed: compare(input.amount, mandate.maxPerClaim) <= 0,
      detail: `${toDisplay(input.amount)} vs ${toDisplay(mandate.maxPerClaim)}`,
      onChain: true,
    },
    {
      rule: 'total_budget',
      label: 'Budget remaining',
      passed: compare(input.amount, available) <= 0,
      detail: `${toDisplay(input.amount)} vs ${toDisplay(available)} available`,
      onChain: true,
    },
    {
      rule: 'recipient_allowlist',
      label: 'Recipient approved',
      passed: approved,
      detail: approved ? 'on the allowlist' : `${input.recipient.slice(0, 6)}…${input.recipient.slice(-4)} unknown`,
      onChain: true,
    },
    {
      rule: 'mandate_active',
      label: 'Mandate active',
      passed: !input.revokedFirst,
      detail: input.revokedFirst ? 'revoked by the treasurer' : 'not revoked',
      onChain: true,
    },
    {
      rule: 'not_expired',
      label: 'Not expired',
      passed: Date.now() < mandate.expiryMs,
      detail: `expires ${new Date(mandate.expiryMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      onChain: true,
    },
  ];
}

/** Abort the Move contract raises first, following the assert order in treasury.move. */
function firstAbort(checks: RuleCheck[]): number | null {
  const order: { rule: string; code: number }[] = [
    { rule: 'mandate_active', code: 9 },
    { rule: 'per_claim_max', code: 5 },
    { rule: 'total_budget', code: 6 },
    { rule: 'recipient_allowlist', code: 7 },
    { rule: 'not_expired', code: 8 },
  ];

  for (const entry of order) {
    const check = checks.find((item) => item.rule === entry.rule);
    if (check && !check.passed) return entry.code;
  }

  return null;
}

export async function simulateAttack(input: AttackInput) {
  const started = performance.now();
  await wait(300);

  const code = firstAbort(attackChecks(input));
  const error = code === null ? null : treasuryErrorFromCode(code);

  return {
    willFail: code !== null,
    predictedAbortCode: code,
    predictedAbortKey: error?.key ?? null,
    predictedMessage: error?.message ?? 'Every rule passes. The contract will allow this.',
    simulatedInMs: Math.round(performance.now() - started),
  };
}

export async function fireAttack(input: AttackInput) {
  await wait(1200);

  const checks = attackChecks(input);
  const code = firstAbort(checks);
  const error = code === null ? null : treasuryErrorFromCode(code);
  const available = subtract(mandate.remainingBudget, COMMITTED);
  const digest = hex(8) + 'qR9nK2wLpX7vB4m' + hex(8);

  const payment: PaymentResult = {
    ok: code === null,
    digest,
    checkpoint: '84,201,776',
    gasUsed: toBaseUnits('0.00121'),
    finalityMs: 410,
    abortCode: code,
    abortKey: error?.key ?? null,
    message: error?.message ?? 'Paid from the mandate.',
    rawError:
      code === null
        ? null
        : `Error from '${mandate.id.slice(0, 10)}…::treasury::spend', abort ${code}: "${error?.message ?? ''}"`,
    budgetBefore: available,
    budgetAfter: code === null ? subtract(available, input.amount) : available,
  };

  return { payment, checks };
}
