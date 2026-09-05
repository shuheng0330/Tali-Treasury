import { EXPENSE_CATEGORIES, toBaseUnits, type ExpenseCategory } from '@tali/shared';

const AMOUNT = /^\d+(?:\.\d{1,6})?$/;
const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

/** Below this a mandate cannot cover a single realistic claim. */
const MIN_BUDGET = 1_000_000n;
/** Testnet USDC is faucet money; past this it is a typo. */
const MAX_BUDGET = 1_000_000_000_000n;

export interface TreasuryFormValue {
  name: string;
  organisation: string;
  categories: ExpenseCategory[];
  budgetUsdc: string;
  maxPerClaimUsdc: string;
  expiryDays: string;
  /** One address per line, as typed. */
  recipients: string;
  /** Receives the AgentCap and pays claims within the rules. */
  agent: string;
}

export type TreasuryField =
  | 'name'
  | 'organisation'
  | 'categories'
  | 'budgetUsdc'
  | 'maxPerClaimUsdc'
  | 'expiryDays'
  | 'recipients'
  | 'agent';

export type TreasuryProblems = Partial<Record<TreasuryField, string>>;

function usdc(value: string): bigint | null {
  const cleaned = value.replace(/[,\s]/g, '');
  if (!AMOUNT.test(cleaned)) return null;
  return BigInt(toBaseUnits(cleaned));
}

/** The addresses as typed, one per line, blanks dropped. */
export function recipientList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function treasuryProblems(
  value: TreasuryFormValue,
  nowMs = Date.now(),
): TreasuryProblems {
  const problems: TreasuryProblems = {};

  if (!value.name.trim()) problems.name = 'The event needs a name people will recognise.';
  else if (value.name.trim().length > 80) problems.name = 'Shorter than 80 characters.';

  if (!value.organisation.trim()) {
    problems.organisation = 'Which club, faculty or company this belongs to.';
  }

  if (value.categories.length === 0) {
    problems.categories = 'Pick at least one kind of expense this treasury covers.';
  }

  const budget = usdc(value.budgetUsdc);
  const cap = usdc(value.maxPerClaimUsdc);

  if (budget === null) {
    problems.budgetUsdc = 'An amount in USDC, to at most six decimals.';
  } else if (budget < MIN_BUDGET) {
    problems.budgetUsdc = 'Fund at least 1 USDC, or no claim this mandate supports fits in it.';
  } else if (budget > MAX_BUDGET) {
    problems.budgetUsdc = 'That is a typo, not a Testnet budget.';
  }

  if (cap === null) {
    problems.maxPerClaimUsdc = 'An amount in USDC, to at most six decimals.';
  } else if (cap <= 0n) {
    problems.maxPerClaimUsdc = 'A claim has to be allowed to pay something.';
  } else if (budget !== null && cap > budget) {
    problems.maxPerClaimUsdc = 'One claim cannot be allowed to spend more than the whole budget.';
  }

  const days = Number(value.expiryDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    problems.expiryDays = 'Between 1 and 365 days from now.';
  } else if (expiryMsFromDays(days, nowMs) <= BigInt(nowMs)) {
    problems.expiryDays = 'The mandate would already have expired.';
  }

  const recipients = recipientList(value.recipients);
  if (recipients.length === 0) {
    problems.recipients = 'At least one address this treasury is allowed to pay.';
  } else if (recipients.some((address) => !SUI_ADDRESS.test(address))) {
    problems.recipients = 'Every line must be a Sui address, starting 0x.';
  } else if (new Set(recipients.map((a) => a.toLowerCase())).size !== recipients.length) {
    problems.recipients = 'The same address is listed twice.';
  }

  if (!SUI_ADDRESS.test(value.agent.trim())) {
    problems.agent = 'A Sui address, starting 0x.';
  }

  return problems;
}

export function expiryMsFromDays(days: number, nowMs = Date.now()): bigint {
  return BigInt(nowMs) + BigInt(days) * 86_400_000n;
}

export interface TreasuryAmounts {
  budget: bigint;
  maxPerClaim: bigint;
  expiryMs: bigint;
  approvedRecipients: string[];
}

export interface RegistrationRecoveryValue {
  digest: string;
  name: string;
  organisation: string;
  categories: ExpenseCategory[];
  authenticated: boolean;
  sameAccount: boolean;
}

/**
 * A funded mandate can be registered without rebuilding the funding
 * transaction. Keep this check separate from treasuryProblems: recovery does
 * not need the budget or recipient fields because those values are verified
 * from the transaction on Sui.
 */
export function registrationRecoveryBlocker(
  value: RegistrationRecoveryValue,
): string | null {
  if (!value.authenticated) return 'Sign in with the treasurer wallet first.';
  if (!value.sameAccount) {
    return 'The connected wallet is not the one this session was signed with.';
  }
  if (!value.digest.trim()) return 'Paste the funding transaction digest.';
  if (!value.name.trim()) return 'The event needs a name people will recognise.';
  if (!value.organisation.trim()) {
    return 'Which club, faculty or company this belongs to.';
  }
  if (value.categories.length === 0) {
    return 'Pick at least one kind of expense this treasury covers.';
  }
  return null;
}

/**
 * What the transaction will carry.
 *
 * Denominated in USDC rather than ringgit, unlike payroll: the mandate holds
 * USDC and claims are quoted into it at the moment they are approved, so
 * fixing a ringgit budget here would pin a rate to a mandate that outlives it.
 */
export function treasuryAmounts(
  value: TreasuryFormValue,
  nowMs = Date.now(),
): TreasuryAmounts {
  const budget = usdc(value.budgetUsdc);
  const maxPerClaim = usdc(value.maxPerClaimUsdc);
  if (budget === null || maxPerClaim === null) {
    throw new Error('Treasury amounts were requested for a form that does not validate');
  }

  return {
    budget,
    maxPerClaim,
    expiryMs: expiryMsFromDays(Number(value.expiryDays), nowMs),
    approvedRecipients: recipientList(value.recipients),
  };
}

export const ALL_CATEGORIES = EXPENSE_CATEGORIES;

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: 'Food',
  printing: 'Printing',
  transport: 'Transport',
  venue: 'Venue',
  materials: 'Materials',
  other: 'Other',
};
