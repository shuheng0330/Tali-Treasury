import type {
  Amount,
  Claim,
  DraftClaim,
  MandateView,
  PaymentResult,
  PolicyDecision,
  ReviewQueueItem,
  ReceiptAnalysis,
  RuleCheck,
  SafetyPreviewInput,
} from '@tali/shared';
import { compare, isAllowedRecipient, subtract, toBaseUnits, toDisplay } from '@tali/shared';
import { treasuryErrorFromCode } from '@tali/treasury-sui';
import { COMMITTED, MEMBER, event, mandate, queuedClaims, seededClaims } from './data';

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
    amount: toBaseUnits('3.00'),
    currency: 'MYR',
    receiptDate: '2026-08-29',
    category: 'food',
    confidence: 0.94,
    uncertainFields: ['category'],
    warnings: [],
    receiptHash: hex(64),
    fuzzyKey: 'restoran-nasi-kandar-line-clear|3.00|2026-08-29',
  };
}

export function evaluate(
  draft: DraftClaim,
  against: MandateView = mandate,
  committed: Amount = COMMITTED,
): PolicyDecision {
  const available = subtract(against.remainingBudget, committed);
  const recipient = draft.recipient ?? MEMBER;
  const exactDuplicate = seededClaims.some(
    (claim) =>
      claim.merchant.toLowerCase() === draft.merchant.toLowerCase() &&
      claim.amount === draft.amount &&
      claim.receiptDate === draft.receiptDate,
  );
  const receiptTime = Date.parse(`${draft.receiptDate}T00:00:00Z`);
  const dateValid = Number.isFinite(receiptTime) && receiptTime <= Date.now();

  const checks: RuleCheck[] = [
    {
      rule: 'category_allowed',
      label: 'Category allowed',
      passed: event.allowedCategories.includes(draft.category),
      detail: event.allowedCategories.includes(draft.category)
        ? `${draft.category} is on the event policy`
        : `${draft.category} is not allowed`,
      onChain: false,
    },
    {
      rule: 'not_duplicate',
      label: 'Not a duplicate',
      passed: !exactDuplicate,
      detail: exactDuplicate ? 'Merchant, amount and date match an existing claim' : 'No exact match found',
      onChain: false,
    },
    {
      rule: 'receipt_date_valid',
      label: 'Receipt date valid',
      passed: dateValid,
      detail: dateValid ? draft.receiptDate : 'Date is invalid or in the future',
      onChain: false,
    },
    {
      rule: 'confidence_sufficient',
      label: 'Receipt ready for routing',
      passed: draft.confidence >= 0.9,
      detail: draft.confidence >= 0.9 ? 'Extraction meets the routing threshold' : 'Needs human review',
      onChain: false,
    },
    {
      rule: 'per_claim_max',
      label: 'Per-claim cap',
      passed: compare(draft.amount, against.maxPerClaim) <= 0,
      detail: `${toDisplay(draft.amount)} vs ${toDisplay(against.maxPerClaim)} cap`,
      onChain: true,
    },
    {
      rule: 'total_budget',
      label: 'Budget remaining',
      passed: compare(draft.amount, against.remainingBudget) <= 0,
      detail: `${toDisplay(against.remainingBudget)} in the mandate, ${toDisplay(available)} uncommitted`,
      onChain: true,
    },
    {
      rule: 'recipient_allowlist',
      label: 'Recipient approved',
      passed: isAllowedRecipient(against, recipient),
      detail: isAllowedRecipient(against, recipient)
        ? 'On the mandate allowlist'
        : `${recipient.slice(0, 6)}…${recipient.slice(-4)} is not on the allowlist`,
      onChain: true,
    },
    {
      rule: 'mandate_active',
      label: 'Mandate active',
      passed: !against.revoked,
      detail: 'Not revoked',
      onChain: true,
    },
    {
      rule: 'not_expired',
      label: 'Not expired',
      passed: Date.now() < against.expiryMs,
      detail: `Expires ${new Date(against.expiryMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
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
    digest: null,
    checkpoint: null,
    gasUsed: null,
    finalityMs: null,
    abortCode: null,
    abortKey: null,
    message: 'Simulation predicts that this claim can be paid.',
    rawError: null,
    budgetBefore: available,
    budgetAfter: subtract(available, amount),
  };
}

export const recentClaims = seededClaims;

const QUEUE_NOTES: Record<string, string> = {
  'q-0148': 'Amount is well over the per-claim cap. The chain will refuse this if I try.',
  'q-0147': 'New recipient, never paid from this mandate before.',
  'q-0146': 'Every rule passes. The receipt photo is too dark to read the total.',
};

export function reviewQueue(): ReviewQueueItem[] {
  return queuedClaims.map((claim) => {
    const decision = evaluate({
      merchant: claim.merchant,
      amount: claim.amount,
      receiptDate: claim.receiptDate,
      category: claim.category,
      recipient: claim.submitter,
      description: claim.description,
      confidence: claim.id === 'q-0146' ? 0.72 : 0.99,
      receiptHash: claim.receiptHash,
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

/** The preview adds one scenario the shared type has no reason to carry. */
export interface AttackInput extends SafetyPreviewInput {
  /** Optional so the shared preview input still satisfies this type. */
  drainFirst?: boolean;
}

/** What the mandate holds once the treasurer has already spent most of it. It
 *  has to sit below the per-claim cap, because otherwise the cap always catches
 *  a large claim first and the budget rule can never be the one that fails. */
export const DRAINED_BUDGET = toBaseUnits('3.00');

/** The contract compares against the mandate's own balance. Claims we have
 *  committed but not settled are an app-side reserve it knows nothing about. */
export function attackBudget(input: Pick<AttackInput, 'drainFirst'>): Amount {
  return input.drainFirst ? DRAINED_BUDGET : mandate.remainingBudget;
}

function attackChecks(input: AttackInput): RuleCheck[] {
  const budget = attackBudget(input);
  const approved = isAllowedRecipient(mandate, input.recipient);

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
      passed: compare(input.amount, budget) <= 0,
      detail: `${toDisplay(input.amount)} vs ${toDisplay(budget)} in the mandate`,
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
  const budget = attackBudget(input);

  const payment: PaymentResult = {
    ok: code === null,
    digest: null,
    checkpoint: null,
    gasUsed: null,
    finalityMs: null,
    abortCode: code,
    abortKey: error?.key ?? null,
    message: error?.message ?? 'Paid from the mandate.',
    rawError:
      code === null
        ? null
        : `Simulated treasury::spend abort ${code}: "${error?.message ?? ''}"`,
    budgetBefore: budget,
    budgetAfter: code === null ? subtract(budget, input.amount) : budget,
  };

  return { payment, checks };
}
