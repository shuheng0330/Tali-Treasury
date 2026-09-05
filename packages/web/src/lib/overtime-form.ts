import type { Amount, OvertimeClaim, OvertimeIssue, OvertimeKind } from '@tali/shared';
import {
  NORMAL_HOURS_PER_DAY,
  ORP_DAYS_PER_MONTH,
  OVERTIME_MULTIPLIER_BPS,
  fromCentihours,
  toCentihours,
} from '@tali/shared';

const RINGGIT = 1_000_000n;
const BPS = 10_000n;

/**
 * SOCSO and EIS stop counting wages here, since 1 October 2024.
 *
 * Act 4 s.5(2) deems wages above it to be this figure rather than capping the
 * contribution afterwards, which is why overtime counts toward reaching it
 * instead of being ignored once it is passed.
 */
export const INSURED_WAGE_CAP = 6_000n * RINGGIT;

/**
 * RM30 a month: the wage of record the server prices a submitted claim against,
 * and the wage the demo mandate is registered for.
 *
 * It has to be this figure and not a realistic salary. The preview would
 * otherwise promise a number the employer's screen never shows, and the mandate
 * holds a few USDC of budget with no way to top it up, so the whole demo runs
 * at that scale.
 */
export const DEMO_MONTHLY_WAGE: Amount = (30n * RINGGIT).toString();

export function isoDay(at: Date): string {
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const day = `${at.getDate()}`.padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/* A half-typed date is not a date. `Date` reads "2026-09" as the first of the
   month, which would put a weekday on screen the employee never entered. */
function dayAt(iso: string): Date | null {
  if (!ISO_DAY.test(iso)) return null;
  const at = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The day type a date implies, before the employee corrects it.
 *
 * Sunday is the only rest day derivable without a company calendar, and a
 * public holiday is not derivable at all — the gazetted list differs by state
 * and changes every year. So this defaults and says it defaulted; every payroll
 * product researched picks the multiplier for the employee rather than asking
 * them to know the Employment Act.
 */
export function defaultOvertimeKind(workedOn: string): OvertimeKind {
  const at = dayAt(workedOn);
  return at?.getUTCDay() === 0 ? 'rest_day' : 'normal_day';
}

/* The shape the submit schema accepts, so the screen refuses what the server
   would refuse rather than truncating a third decimal on the way out. */
const HOURS = /^\d{1,2}(?:\.\d{1,2})?$/;

/** Hundredths of an hour, or null when the field is not a number yet. */
export function parseHours(hours: string): bigint | null {
  const value = hours.trim();
  if (!HOURS.test(value)) return null;

  try {
    return toCentihours(value);
  } catch {
    return null;
  }
}

/** A rejected claim is not a spent hour: it neither fills the month nor holds the day. */
function counted(claim: OvertimeClaim, month: string): boolean {
  return claim.status !== 'rejected' && monthOf(claim.workedOn) === month;
}

export function monthHoursClaimed(claims: readonly OvertimeClaim[], month: string): string {
  const total = claims
    .filter((claim) => counted(claim, month))
    .reduce((sum, claim) => sum + (parseHours(claim.hours) ?? 0n), 0n);
  return fromCentihours(total);
}

export function claimedDates(claims: readonly OvertimeClaim[], month: string): string[] {
  return claims.filter((claim) => counted(claim, month)).map((claim) => claim.workedOn);
}

/**
 * The three rates the payslip states, for reading.
 *
 * `overtimePay` divides once at the end, so a row here multiplied by the next
 * one can land a fraction of a sen off the pay below it. Showing the rounded
 * rates is what a payslip does; computing the pay from them is what a payslip
 * must not do.
 */
export function ordinaryRate(monthlyWage: Amount): Amount {
  return (BigInt(monthlyWage) / ORP_DAYS_PER_MONTH).toString();
}

export function hourlyRate(monthlyWage: Amount): Amount {
  return (BigInt(monthlyWage) / (ORP_DAYS_PER_MONTH * NORMAL_HOURS_PER_DAY)).toString();
}

export function overtimeHourlyRate(monthlyWage: Amount, kind: OvertimeKind): Amount {
  const numerator = BigInt(monthlyWage) * BigInt(OVERTIME_MULTIPLIER_BPS[kind]);
  const denominator = ORP_DAYS_PER_MONTH * NORMAL_HOURS_PER_DAY * BPS;
  return ((numerator + denominator - 1n) / denominator).toString();
}

export interface StatutoryBases {
  epf: Amount;
  socso: Amount;
  eis: Amount;
  /** True when SOCSO and EIS are counting the deemed ceiling, not the wage. */
  deemed: boolean;
}

/**
 * The wage each body counts for the month, which is the point of this screen.
 *
 * EPF Act 1991 s.2(b) excludes overtime payment from wages. SOCSO (Act 4
 * s.2(24)) and EIS (Act 800 s.3) both define wages to include payment for
 * overtime. One wage base is therefore wrong for at least one body on any month
 * containing overtime.
 *
 * Bases rather than contributions: the rates turn on age and citizenship, which
 * are the employer's record and not this screen's to guess at.
 */
export function statutoryBases(monthlyWage: Amount, overtime: Amount): StatutoryBases {
  const wage = BigInt(monthlyWage);
  const insurable = wage + BigInt(overtime);
  const deemed = insurable > INSURED_WAGE_CAP;
  const insured = deemed ? INSURED_WAGE_CAP : insurable;

  return {
    epf: wage.toString(),
    socso: insured.toString(),
    eis: insured.toString(),
    deemed,
  };
}

export function ownClaims(
  claims: readonly OvertimeClaim[],
  address: string | null,
): OvertimeClaim[] {
  if (!address) return [];
  const wallet = address.trim().toLowerCase();
  return claims.filter((claim) => claim.employee.trim().toLowerCase() === wallet);
}

export function byNewest(claims: readonly OvertimeClaim[]): OvertimeClaim[] {
  return [...claims].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/**
 * The wage the employer last priced a claim of theirs against.
 *
 * A claim carries the wage of record it was computed with, so the newest one is
 * the closest this screen can get to that figure without a payroll read.
 */
export function wageOfRecord(claims: readonly OvertimeClaim[]): Amount | null {
  const newest = byNewest(claims)[0];
  return newest ? newest.monthlyWage : null;
}

export function blockingIssue(issues: readonly OvertimeIssue[]): OvertimeIssue | null {
  return issues.find((issue) => issue.blocking) ?? null;
}

/** A worked day as a person reads it: `Sat 12 Sep`. */
export function formatWorkedOn(iso: string): string {
  const at = dayAt(iso);
  if (!at) return iso;
  return at.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
