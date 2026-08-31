import type {
  Claim,
  ExpenseCategory,
  MandateView,
  PolicyDecision,
  PolicyOutcome,
  RuleCheck,
  RuleId,
} from '@tali/shared';
import {
  isAllowedRecipient,
  ON_CHAIN_RULES,
  toDisplay,
} from '@tali/shared';

export interface PolicyEventSnapshot {
  allowedCategories: readonly ExpenseCategory[];
  startsAtMs: number;
  expiresAtMs: number;
}

export interface PolicyEvaluationInput {
  claim: Pick<
    Claim,
    'submitter' | 'amount' | 'receiptDate' | 'category' | 'analysis'
  >;
  event: PolicyEventSnapshot;
  mandate: MandateView;
  exactDuplicate: boolean;
  nowMs?: number;
}

const HARD_FAILURES = new Set<RuleId>([
  'per_claim_max',
  'total_budget',
  'recipient_allowlist',
  'mandate_active',
  'not_expired',
  'not_duplicate',
]);

function parseUnsignedInteger(value: string): bigint | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function displayAmount(value: string): string {
  try {
    return `${toDisplay(value)} USDC`;
  } catch {
    return 'an invalid amount';
  }
}

function parseUtcDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function utcDay(timestamp: number): number | null {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

function check(
  rule: RuleId,
  passed: boolean,
  label: string,
  detail: string,
): RuleCheck {
  return {
    rule,
    passed,
    label,
    detail,
    onChain: Object.prototype.hasOwnProperty.call(ON_CHAIN_RULES, rule),
  };
}

function decisionOutcome(checks: readonly RuleCheck[]): PolicyOutcome {
  const failed = checks.filter(({ passed }) => !passed);
  if (failed.some(({ rule }) => HARD_FAILURES.has(rule))) return 'reject';
  if (failed.length > 0) return 'review';
  return 'auto_pay';
}

export function evaluatePolicy(input: PolicyEvaluationInput): PolicyDecision {
  const nowMs = input.nowMs ?? Date.now();
  const amount = parseUnsignedInteger(input.claim.amount);
  const maxPerClaim = parseUnsignedInteger(input.mandate.maxPerClaim);
  const remainingBudget = parseUnsignedInteger(input.mandate.remainingBudget);
  const positiveAmount = amount !== null && amount > 0n ? amount : null;
  const amountWithinCap =
    positiveAmount !== null &&
    maxPerClaim !== null &&
    positiveAmount <= maxPerClaim;
  const amountWithinBudget =
    positiveAmount !== null &&
    remainingBudget !== null &&
    positiveAmount <= remainingBudget;

  const receiptDay = parseUtcDate(input.claim.receiptDate);
  const eventStartDay = utcDay(input.event.startsAtMs);
  const eventExpiryDay = utcDay(input.event.expiresAtMs);
  const currentDay = utcDay(nowMs);
  const receiptDateValid =
    receiptDay !== null &&
    eventStartDay !== null &&
    eventExpiryDay !== null &&
    currentDay !== null &&
    receiptDay >= eventStartDay &&
    receiptDay <= eventExpiryDay &&
    receiptDay <= currentDay;

  const analysis = input.claim.analysis;
  const confidenceSufficient =
    analysis !== null &&
    Number.isFinite(analysis.confidence) &&
    analysis.confidence >= 0.9 &&
    analysis.uncertainFields.length === 0 &&
    analysis.warnings.length === 0;
  const recipientAllowed = isAllowedRecipient(
    input.mandate,
    input.claim.submitter,
  );
  const mandateActive = !input.mandate.revoked;
  const notExpired =
    Number.isFinite(nowMs) &&
    Number.isFinite(input.mandate.expiryMs) &&
    nowMs < input.mandate.expiryMs;
  const categoryAllowed = input.event.allowedCategories.includes(
    input.claim.category,
  );

  const checks: RuleCheck[] = [
    check(
      'per_claim_max',
      amountWithinCap,
      'Per-claim cap',
      `${displayAmount(input.claim.amount)} against a ${displayAmount(input.mandate.maxPerClaim)} cap`,
    ),
    check(
      'total_budget',
      amountWithinBudget,
      'Budget remaining',
      `${displayAmount(input.mandate.remainingBudget)} remains in the mandate`,
    ),
    check(
      'recipient_allowlist',
      recipientAllowed,
      'Recipient approved',
      recipientAllowed
        ? 'Recipient is on the mandate allowlist'
        : 'Recipient is not on the mandate allowlist',
    ),
    check(
      'mandate_active',
      mandateActive,
      'Mandate active',
      mandateActive ? 'Mandate has not been revoked' : 'Mandate has been revoked',
    ),
    check(
      'not_expired',
      notExpired,
      'Mandate not expired',
      notExpired
        ? 'Mandate is within its payment window'
        : 'Mandate has expired or has an invalid expiry',
    ),
    check(
      'not_duplicate',
      !input.exactDuplicate,
      'Receipt not duplicated',
      input.exactDuplicate
        ? 'This receipt file hash already exists for the event'
        : 'No matching receipt file hash exists for the event',
    ),
    check(
      'category_allowed',
      categoryAllowed,
      'Category allowed',
      categoryAllowed
        ? 'Expense category is allowed by the event policy'
        : 'Expense category requires treasurer review',
    ),
    check(
      'receipt_date_valid',
      receiptDateValid,
      'Receipt date valid',
      receiptDateValid
        ? 'Receipt date is inside the event and evaluation window'
        : 'Receipt date is invalid, outside the event, or in the future',
    ),
    check(
      'confidence_sufficient',
      confidenceSufficient,
      'Receipt extraction certain',
      confidenceSufficient
        ? 'Receipt extraction meets the 90% certainty threshold'
        : 'Receipt extraction is missing, uncertain, warned, or below 90%',
    ),
  ];

  const outcome = decisionOutcome(checks);
  const failedLabels = checks
    .filter(({ passed }) => !passed)
    .map(({ label }) => label.toLowerCase())
    .join(', ');
  const reason =
    outcome === 'auto_pay'
      ? 'Every policy rule passed. The claim is eligible for automatic payment.'
      : outcome === 'reject'
        ? `Automatic payment rejected: ${failedLabels}.`
        : `Treasurer review required: ${failedLabels}.`;

  return { outcome, checks, reason, evaluatedAtMs: nowMs };
}
