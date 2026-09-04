import { convertMyrToUsdc, STATUTORY_BODIES, toBaseUnits, type StatutoryBody } from '@tali/shared';
import type { StatutoryFloor } from '@tali/treasury-sui';
import { CONFIGURED_FLOOR_BPS } from '../server/payroll/floors';

/**
 * The share of gross the worker must keep, in basis points.
 *
 * The contract accepts anything from 1 to 10,000, so this is a policy choice
 * rather than a derived figure. The heaviest supported deduction is a local
 * worker under 60 at 11% EPF, 0.5% SOCSO and 0.2% EIS, which leaves 88.3%; a
 * 70% floor clears every supported class while still refusing a run that
 * quietly moves most of a salary somewhere else.
 */
export const NET_MIN_BPS = 7000n;

/**
 * The wage each floor is measured against, in ringgit.
 *
 * SOCSO and EIS stop counting above RM6,000 of wages, so their floors are
 * measured against a capped basis. EPF has no ceiling, and the contract reads
 * zero as "no cap" rather than as a cap of nothing.
 */
const WAGE_CAP_MYR: Record<StatutoryBody, string> = {
  epf: '0',
  socso: '6000',
  eis: '6000',
};

const AMOUNT = /^\d+(?:\.\d{1,6})?$/;
const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

/** RM20 is the narrowest EPF wage band, and the bound the request schema uses. */
const MIN_FUNDING_MYR = 20_000_000n;
const MAX_FUNDING_MYR = 200_000_000_000n;

/**
 * Chooses the employee shown when payroll setup opens.
 *
 * The configured demo employee must win over the connected wallet: that wallet
 * is the employer funding the mandate, not the person receiving wages. Falling
 * back to the connected address keeps an unconfigured local checkout usable.
 */
export function initialPayrollEmployee(
  configuredEmployee: string,
  connectedWallet: string | null | undefined,
): string {
  return configuredEmployee.trim() || connectedWallet?.trim() || '';
}

export interface SetupFormValue {
  employee: string;
  /** Receives the PayrollCap, and can therefore run and revoke this payroll. */
  capRecipient: string;
  fundingMyr: string;
  maxPerRunMyr: string;
  expiryDays: string;
  recipients: Record<StatutoryBody, string>;
}

export type SetupField =
  | 'employee'
  | 'capRecipient'
  | 'fundingMyr'
  | 'maxPerRunMyr'
  | 'expiryDays'
  | StatutoryBody;

export type SetupProblems = Partial<Record<SetupField, string>>;

function ringgit(value: string): bigint | null {
  const cleaned = value.replace(/[,\s]/g, '');
  if (!AMOUNT.test(cleaned)) return null;
  return BigInt(toBaseUnits(cleaned));
}

/**
 * Every reason this form cannot be submitted, by field.
 *
 * The transaction builder throws on most of these too, but a thrown builder
 * error arrives after the employer has already committed to signing and reads
 * as a fault in the app. Saying it next to the field is the same check moved
 * to where it can still be acted on.
 */
export function setupProblems(value: SetupFormValue, nowMs = Date.now()): SetupProblems {
  const problems: SetupProblems = {};

  if (!SUI_ADDRESS.test(value.employee.trim())) {
    problems.employee = 'A Sui address, starting 0x.';
  }
  if (!SUI_ADDRESS.test(value.capRecipient.trim())) {
    problems.capRecipient = 'A Sui address, starting 0x.';
  }

  const funding = ringgit(value.fundingMyr);
  const maxPerRun = ringgit(value.maxPerRunMyr);

  if (funding === null) {
    problems.fundingMyr = 'An amount in ringgit, to at most six decimals.';
  } else if (funding < MIN_FUNDING_MYR) {
    problems.fundingMyr = 'Fund at least RM20, or no wage this mandate supports fits in it.';
  } else if (funding > MAX_FUNDING_MYR) {
    problems.fundingMyr = 'That is a typo, not a payroll budget.';
  }

  if (maxPerRun === null) {
    problems.maxPerRunMyr = 'An amount in ringgit, to at most six decimals.';
  } else if (maxPerRun <= 0n) {
    problems.maxPerRunMyr = 'A run has to be allowed to pay something.';
  } else if (funding !== null && maxPerRun > funding) {
    problems.maxPerRunMyr = 'One run cannot be allowed to spend more than the whole budget.';
  }

  const days = Number(value.expiryDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    problems.expiryDays = 'Between 1 and 365 days from now.';
  } else if (expiryMsFromDays(days, nowMs) <= BigInt(nowMs)) {
    problems.expiryDays = 'The mandate would already have expired.';
  }

  const seen = new Set<string>();
  for (const body of STATUTORY_BODIES) {
    const address = value.recipients[body].trim();
    if (!SUI_ADDRESS.test(address)) {
      problems[body] = 'A Sui address, starting 0x.';
      continue;
    }
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) {
      /* The contract pairs recipients with amounts by index. Two bodies at one
         address still passes every assert, and the money would be
         indistinguishable afterwards. */
      problems[body] = 'Each body needs its own address.';
    }
    seen.add(normalized);
  }

  return problems;
}

export function expiryMsFromDays(days: number, nowMs = Date.now()): bigint {
  return BigInt(nowMs) + BigInt(days) * 86_400_000n;
}

export interface MandateAmounts {
  budget: bigint;
  maxPerRun: bigint;
  floors: StatutoryFloor[];
  netMinBps: bigint;
  expiryMs: bigint;
}

/**
 * The exact micro-USDC the transaction will carry.
 *
 * One rate converts the budget, the cap and every wage ceiling, so the employer
 * approves a single quote rather than a set of figures that were each correct
 * at a different moment.
 */
export function mandateAmounts(
  value: SetupFormValue,
  myrPerUsd: string,
  nowMs = Date.now(),
): MandateAmounts {
  const funding = ringgit(value.fundingMyr);
  const maxPerRun = ringgit(value.maxPerRunMyr);
  if (funding === null || maxPerRun === null) {
    throw new Error('Mandate amounts were requested for a form that does not validate');
  }

  return {
    budget: BigInt(convertMyrToUsdc(funding.toString(), myrPerUsd)),
    maxPerRun: BigInt(convertMyrToUsdc(maxPerRun.toString(), myrPerUsd)),
    floors: STATUTORY_BODIES.map((body) => {
      const cap = ringgit(WAGE_CAP_MYR[body]) ?? 0n;
      return {
        recipient: value.recipients[body].trim(),
        minBps: CONFIGURED_FLOOR_BPS[body],
        /* Zero is the contract's "no ceiling", and convertMyrToUsdc refuses a
           zero amount, so it stays zero rather than going through the rate. */
        wageCap: cap === 0n ? 0n : BigInt(convertMyrToUsdc(cap.toString(), myrPerUsd)),
      };
    }),
    netMinBps: NET_MIN_BPS,
    expiryMs: expiryMsFromDays(Number(value.expiryDays), nowMs),
  };
}

/**
 * Whether the budget can actually pay a run, given both figures in the same
 * currency and base units.
 *
 * A mandate funded below one employer cost is created and funded successfully
 * and then refuses every run, which is the most expensive way to discover a
 * typo.
 */
export function coverageProblem(budget: bigint, employerCost: bigint): string | null {
  if (employerCost <= 0n) return null;
  if (budget < employerCost) {
    return 'The budget is smaller than one month of this wage, so the first run would be refused.';
  }
  return null;
}

export function capProblem(maxPerRun: bigint, employerCost: bigint): string | null {
  if (employerCost <= 0n) return null;
  if (maxPerRun < employerCost) {
    return 'The per-run cap is below this wage, so the first run would be refused.';
  }
  return null;
}
