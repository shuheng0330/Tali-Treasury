import type { Address, Amount, ObjectId } from './claims.js';

/**
 * Overtime rules here are the Employment Act 1955, which covers Peninsular
 * Malaysia and Labuan. Sabah and Sarawak have their own Labour Ordinances with
 * numbers that differ in places.
 */
export type OvertimeKind = 'normal_day' | 'rest_day' | 'public_holiday';
export type OvertimeStatus = 'submitted' | 'approved' | 'rejected' | 'paid';

export type LeaveKind = 'annual' | 'sick' | 'unpaid';
export type LeaveStatus = 'submitted' | 'approved' | 'rejected';

/**
 * Employment Act 1955 section 60I: a monthly-rated employee's ordinary rate of
 * pay is the monthly wage over 26, whatever length the calendar month happens
 * to be.
 */
export const ORP_DAYS_PER_MONTH = 26n;

/**
 * Normal hours in a working day, past which overtime begins.
 *
 * Section 60A(3)(b) measures overtime per DAY against the hours the contract
 * calls normal, not against a weekly total — an engine that accrues into a
 * 45-hour weekly bucket gets a different, wrong answer. Eight is the statutory
 * ceiling on that contractual figure; a shorter contracted day raises the
 * hourly rate rather than lowering it.
 */
export const NORMAL_HOURS_PER_DAY = 8n;

/** The statutory ceiling on overtime worked in one month. */
export const MAX_OVERTIME_HOURS_PER_MONTH = 104;

/**
 * The statutory multiple of the hourly rate, in basis points.
 *
 * These are the rates for hours worked BEYOND the normal working day, which is
 * what section 60A(3)(b) defines overtime to be and all this module claims:
 * 1.5x on a working day (s.60A(3)(a)), 2x beyond normal hours on a rest day
 * (s.60(3)(c)), 3x beyond normal hours on a paid holiday (s.60D(3)(aa)).
 *
 * Attendance within normal hours on a rest day or holiday is a different
 * entitlement with different arithmetic — 0.5x or 1x of the ordinary rate on a
 * rest day for a monthly-rated employee, and a flat 2x for a holiday, on top of
 * holiday pay that s.60D(2A) already deems paid inside an unabated monthly
 * salary. Tali does not pay that here, and calling it overtime would overpay a
 * holiday by a day. It is a separate claim, not a multiplier.
 *
 * Basis points rather than a decimal because every other rate in this codebase
 * is, and because 1.5 is not representable in binary floating point. Somebody's
 * overtime is not the place to discover that.
 */
export const OVERTIME_MULTIPLIER_BPS: Record<OvertimeKind, number> = {
  normal_day: 15_000,
  rest_day: 20_000,
  public_holiday: 30_000,
};

export const OVERTIME_KIND_LABEL: Record<OvertimeKind, string> = {
  normal_day: 'Working day',
  rest_day: 'Rest day',
  public_holiday: 'Public holiday',
};

export const OVERTIME_KIND_RATE: Record<OvertimeKind, string> = {
  normal_day: '1.5x',
  rest_day: '2x',
  public_holiday: '3x',
};

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  annual: 'Annual leave',
  sick: 'Sick leave',
  unpaid: 'Unpaid leave',
};

const BPS = 10_000n;
const CENTI = 100n;

/**
 * Hours as an integer of hundredths.
 *
 * Overtime is claimed in quarter hours at the finest, so two places hold every
 * real claim exactly and keep the pay arithmetic in integers.
 */
export function toCentihours(hours: string): bigint {
  const cleaned = hours.replace(/[,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '.' || !/^\d*(\.\d*)?$/.test(cleaned)) {
    throw new Error('Not a number of hours: ' + hours);
  }
  const [whole = '0', frac = ''] = cleaned.split('.');
  const padded = (frac + '00').slice(0, 2);
  return BigInt(whole || '0') * CENTI + BigInt(padded || '0');
}

export function fromCentihours(centihours: bigint): string {
  const whole = centihours / CENTI;
  const frac = centihours % CENTI;
  if (frac === 0n) return whole.toString();
  return whole.toString() + '.' + frac.toString().padStart(2, '0').replace(/0$/, '');
}

/**
 * What an overtime claim adds to the month's wage, in MYR base units.
 *
 * One division at the end rather than three in sequence. Computing the ordinary
 * rate, then the hourly rate, then the multiple would round three times, and
 * every rounding is money.
 *
 * Rounds up. The remainder is a fraction of a sen either way, and this product
 * exists to stop workers being quietly short-changed, so where the arithmetic
 * cannot be exact it resolves in the worker's favour — the same direction
 * `toWholeRinggit` already takes for contributions.
 */
export function overtimePay(monthlyWage: Amount, kind: OvertimeKind, hours: string): Amount {
  const wage = BigInt(monthlyWage);
  if (wage < 0n) throw new Error('monthly wage cannot be negative');

  const centihours = toCentihours(hours);
  const multiplier = BigInt(OVERTIME_MULTIPLIER_BPS[kind]);
  const numerator = wage * multiplier * centihours;
  const denominator = ORP_DAYS_PER_MONTH * NORMAL_HOURS_PER_DAY * BPS * CENTI;

  return ((numerator + denominator - 1n) / denominator).toString();
}

/**
 * What a day of unpaid leave takes off the month's wage.
 *
 * Rounds down, for the reason overtime rounds up: the direction that cannot be
 * accused of shaving the worker.
 */
export function unpaidLeaveDeduction(monthlyWage: Amount, days: string): Amount {
  const wage = BigInt(monthlyWage);
  if (wage < 0n) throw new Error('monthly wage cannot be negative');

  const centidays = toCentihours(days);
  return ((wage * centidays) / (ORP_DAYS_PER_MONTH * CENTI)).toString();
}

export interface OvertimeClaim {
  id: string;
  /** Null for a claim raised before any payroll mandate was registered. */
  mandateId: ObjectId | null;
  employee: Address;
  /** The day worked, as YYYY-MM-DD. */
  workedOn: string;
  kind: OvertimeKind;
  hours: string;
  reason: string;
  status: OvertimeStatus;
  /** The wage of record the pay was computed against, in MYR base units. */
  monthlyWage: Amount;
  /** What this claim adds to gross, in MYR base units. */
  pay: Amount;
  /** Required on rejection, optional on approval. */
  decisionReason: string | null;
  decidedAtMs: number | null;
  /** The payroll run that paid it, once one has. */
  runId: string | null;
  createdAtMs: number;
}

export interface LeaveRequest {
  id: string;
  employee: Address;
  /** Inclusive range, as YYYY-MM-DD. */
  startOn: string;
  endOn: string;
  days: string;
  kind: LeaveKind;
  reason: string;
  status: LeaveStatus;
  monthlyWage: Amount;
  /** What approving this takes off gross. Zero for paid leave. */
  deduction: Amount;
  decisionReason: string | null;
  decidedAtMs: number | null;
  createdAtMs: number;
}

export type OvertimeIssueCode =
  | 'not_positive'
  | 'exceeds_day'
  | 'exceeds_month'
  | 'duplicate_day'
  | 'on_leave'
  | 'future_date';

export interface OvertimeIssue {
  code: OvertimeIssueCode;
  message: string;
  /** True when the claim cannot be submitted, rather than merely warned about. */
  blocking: boolean;
}

/** Hours in a day less the normal working day. Nobody works more than this. */
const MAX_OVERTIME_HOURS_PER_DAY = 16n;

/**
 * Every check a rule can make, made by a rule.
 *
 * These are the questions with exact answers — arithmetic and set membership —
 * and a model that agreed with them ninety-nine times in a hundred would be
 * strictly worse than the arithmetic. Reading a photographed timesheet is the
 * part with no exact answer, and that is the part the model is for.
 */
export function checkOvertimeClaim(input: {
  workedOn: string;
  hours: string;
  todayIso: string;
  /** Hours already claimed in the same month, this claim excluded. */
  monthHoursClaimed: string;
  /** Dates in the same month that already carry a claim. */
  claimedDates: readonly string[];
  /** Dates the employee has approved leave for. */
  leaveDates: readonly string[];
}): OvertimeIssue[] {
  const issues: OvertimeIssue[] = [];
  const hours = toCentihours(input.hours);

  if (hours <= 0n) {
    issues.push({
      code: 'not_positive',
      message: 'Enter the hours worked beyond the normal working day.',
      blocking: true,
    });
  }

  if (hours > MAX_OVERTIME_HOURS_PER_DAY * CENTI) {
    issues.push({
      code: 'exceeds_day',
      message: 'A day cannot hold more than ' + MAX_OVERTIME_HOURS_PER_DAY + ' hours of overtime.',
      blocking: true,
    });
  }

  const monthTotal = toCentihours(input.monthHoursClaimed) + hours;
  if (monthTotal > BigInt(MAX_OVERTIME_HOURS_PER_MONTH) * CENTI) {
    issues.push({
      code: 'exceeds_month',
      message:
        'This takes the month to ' +
        fromCentihours(monthTotal) +
        ' hours. The statutory limit is ' +
        MAX_OVERTIME_HOURS_PER_MONTH +
        '.',
      blocking: true,
    });
  }

  if (input.claimedDates.includes(input.workedOn)) {
    issues.push({
      code: 'duplicate_day',
      message: 'There is already a claim for this day.',
      blocking: true,
    });
  }

  if (input.leaveDates.includes(input.workedOn)) {
    issues.push({
      code: 'on_leave',
      message: 'This day is approved leave. Overtime on it needs a word with the employer.',
      blocking: false,
    });
  }

  if (input.workedOn > input.todayIso) {
    issues.push({
      code: 'future_date',
      message: 'Overtime is claimed after it is worked, not before.',
      blocking: true,
    });
  }

  return issues;
}

/** The pay of every claim approved and not yet paid. */
export function pendingOvertimePay(claims: readonly OvertimeClaim[]): Amount {
  return claims
    .filter((claim) => claim.status === 'approved')
    .reduce((total, claim) => total + BigInt(claim.pay), 0n)
    .toString();
}

/** The deduction of every approved leave request that is unpaid. */
export function approvedLeaveDeduction(requests: readonly LeaveRequest[]): Amount {
  return requests
    .filter((request) => request.status === 'approved')
    .reduce((total, request) => total + BigInt(request.deduction), 0n)
    .toString();
}
