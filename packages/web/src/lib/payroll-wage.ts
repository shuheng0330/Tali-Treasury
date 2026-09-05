import { COIN_DECIMALS, toDisplay } from '@tali/shared';

/** What the calculator needs to know about one month of one person's wages. */
export interface WageClassValue {
  /** Ringgit as typed, not base units: this is what is in the input. */
  gross: string;
  age: number;
  citizenship: 'local' | 'foreign';
  /** Whole days of unpaid leave taken in the month. */
  unpaidLeaveDays: number;
}

/**
 * Days a monthly wage is divided by to get one day of it.
 *
 * Twenty-six is the ordinary rate of pay under the Employment Act, and it is
 * the divisor a Malaysian payroll clerk expects. It is a convention rather than
 * a universal rule — another contract may prorate on calendar days — so the
 * screen names it instead of presenting the result as though it were law.
 */
export const ORDINARY_RATE_DAYS = 26n;

export const MAX_UNPAID_LEAVE_DAYS = 26;

/* The same bounds the request schema enforces, so the screen refuses what the
   server would refuse and says the same thing about it. */
const MIN_GROSS = 20_000_000n;
const MAX_GROSS = 200_000_000_000n;

const AMOUNT = /^\d+(?:\.\d{1,6})?$/;

export function grossToBaseUnits(gross: string): bigint | null {
  const value = gross.replace(/[,\s]/g, '');
  if (!AMOUNT.test(value)) return null;

  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(COIN_DECIMALS) + BigInt(fraction.padEnd(COIN_DECIMALS, '0'));
}

/**
 * The wage actually payable after unpaid leave, in base units.
 *
 * Deducting before the statutory split rather than scaling the split afterwards
 * is the whole point: EPF follows the Third Schedule, which states a ringgit
 * figure per band rather than a percentage, so a reduced wage can land in a
 * lower band. Scaling a computed split by the same fraction would silently
 * invent a figure the Schedule does not contain.
 *
 * Returns null for a gross that could not be read, so callers keep one
 * "cannot compute" path rather than two.
 */
export function grossAfterUnpaidLeave(value: WageClassValue): bigint | null {
  const base = grossToBaseUnits(value.gross);
  if (base === null) return null;

  const days = BigInt(Math.max(0, Math.trunc(value.unpaidLeaveDays)));
  if (days === 0n) return base;
  if (days >= ORDINARY_RATE_DAYS) return 0n;

  /* One day is computed then multiplied, matching how a payslip states a daily
     rate. Deducting a single combined fraction would differ by a few sen from
     the figure an employee can check against their own payslip. */
  const daily = base / ORDINARY_RATE_DAYS;
  const deduction = daily * days;
  return deduction >= base ? 0n : base - deduction;
}

/** The reason unpaid leave cannot be applied, or null when it can. */
export function unpaidLeaveProblem(value: WageClassValue): string | null {
  const days = value.unpaidLeaveDays;
  if (!Number.isInteger(days) || days < 0) return 'Unpaid leave is a whole number of days.';
  if (days > MAX_UNPAID_LEAVE_DAYS) {
    return `A month has ${MAX_UNPAID_LEAVE_DAYS} working days at the ordinary rate.`;
  }

  const after = grossAfterUnpaidLeave(value);
  if (after === null) return null;
  if (after === 0n) return 'That is the whole month unpaid, so there is no wage to run.';
  if (after < MIN_GROSS) {
    return `After ${days} unpaid days the wage falls below the ${toDisplay(
      MIN_GROSS.toString(),
    )} MYR supported by the registered mandate.`;
  }
  return null;
}

/** The reason this wage cannot be run, or null when it can. */
export function grossProblem(gross: string): string | null {
  const base = grossToBaseUnits(gross);
  if (base === null) return 'Enter a monthly wage in ringgit, to at most six decimals.';
  if (base < MIN_GROSS) {
    return `The monthly wage must be at least ${toDisplay(MIN_GROSS.toString())} MYR.`;
  }
  if (base > MAX_GROSS) return 'That is a typo, not a monthly salary.';
  return null;
}
