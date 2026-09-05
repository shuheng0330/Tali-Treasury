import type { Amount, LeaveRequest } from '@tali/shared';
import { toCentihours } from '@tali/shared';

const DAY_MS = 86_400_000;

/** Matches the server, which refuses a longer span than this in one request. */
export const MAX_LEAVE_SPAN_DAYS = 366;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/* The shape the submit schema accepts, so the screen refuses what the server
   would refuse rather than truncating a third decimal on the way out. */
const DAYS = /^\d{1,3}(?:\.\d{1,2})?$/;

function dayAt(iso: string): Date | null {
  if (!ISO_DAY.test(iso)) return null;
  const at = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Hundredths of a day, or null when the field is not a number yet. */
export function parseDays(days: string): bigint | null {
  const value = days.trim();
  if (!DAYS.test(value)) return null;

  try {
    return toCentihours(value);
  } catch {
    return null;
  }
}

/** Calendar days from start to end, counting both ends. Null on a half-typed date. */
export function spanInDays(startOn: string, endOn: string): number | null {
  const start = dayAt(startOn);
  const end = dayAt(endOn);
  if (!start || !end) return null;
  return (end.getTime() - start.getTime()) / DAY_MS + 1;
}

/**
 * The days in a range that count as leave taken, which is not every day in it.
 *
 * Sunday is the rest day the ordinary rate already assumes: section 60I divides
 * the monthly wage by 26, which is a six-day week over a year. Deducting a
 * Sunday would charge somebody a day of pay for a day they were never owed pay
 * for. A gazetted public holiday inside the range is the same argument, but the
 * list differs by state and changes every year, so this counts it and leaves
 * the employee free to correct the figure — the field stays editable for
 * exactly this reason.
 */
export function workingDaysBetween(startOn: string, endOn: string): string | null {
  const start = dayAt(startOn);
  const end = dayAt(endOn);
  if (!start || !end || end < start) return null;

  let days = 0;
  for (let ms = start.getTime(); ms <= end.getTime(); ms += DAY_MS) {
    if (new Date(ms).getUTCDay() !== 0) days += 1;
  }
  return days.toString();
}

export interface LeaveIssue {
  code: 'ends_before_start' | 'too_long' | 'not_positive' | 'exceeds_span' | 'overlaps';
  message: string;
  /** True when the request cannot be submitted, rather than merely warned about. */
  blocking: boolean;
}

/** A rejected request holds no dates: it neither overlaps nor deducts. */
function live(request: LeaveRequest): boolean {
  return request.status !== 'rejected';
}

function overlaps(a: LeaveRequest, startOn: string, endOn: string): boolean {
  return a.startOn <= endOn && startOn <= a.endOn;
}

/**
 * Every check a rule can make, made by a rule.
 *
 * The same division as the overtime form: arithmetic and set membership have
 * exact answers and belong here, so the screen refuses what the server would
 * refuse instead of sending it and rendering the 400.
 */
export function checkLeaveRequest(input: {
  startOn: string;
  endOn: string;
  days: string;
  /** The employee's requests that are not rejected. */
  existing: readonly LeaveRequest[];
}): LeaveIssue[] {
  const issues: LeaveIssue[] = [];
  const span = spanInDays(input.startOn, input.endOn);
  const days = parseDays(input.days);

  if (span !== null && span < 1) {
    issues.push({
      code: 'ends_before_start',
      message: 'Leave cannot end before it starts.',
      blocking: true,
    });
  }

  if (span !== null && span > MAX_LEAVE_SPAN_DAYS) {
    issues.push({
      code: 'too_long',
      message: 'Ask for one year of leave at a time.',
      blocking: true,
    });
  }

  if (days !== null && days <= 0n) {
    issues.push({
      code: 'not_positive',
      message: 'Enter the days of leave taken.',
      blocking: true,
    });
  }

  if (span !== null && span >= 1 && days !== null && days > BigInt(span) * 100n) {
    issues.push({
      code: 'exceeds_span',
      message: `Those dates cover ${span} days, so ${input.days} cannot be taken in them.`,
      blocking: true,
    });
  }

  if (span !== null && span >= 1) {
    const clash = input.existing
      .filter(live)
      .find((request) => overlaps(request, input.startOn, input.endOn));
    if (clash) {
      issues.push({
        code: 'overlaps',
        message: `This overlaps leave you already asked for, from ${clash.startOn} to ${clash.endOn}.`,
        blocking: true,
      });
    }
  }

  return issues;
}

export function blockingLeaveIssue(issues: readonly LeaveIssue[]): LeaveIssue | null {
  return issues.find((issue) => issue.blocking) ?? null;
}

export function byNewestLeave(requests: readonly LeaveRequest[]): LeaveRequest[] {
  return [...requests].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function ownLeave(
  requests: readonly LeaveRequest[],
  address: string | null,
): LeaveRequest[] {
  if (!address) return [];
  const wallet = address.trim().toLowerCase();
  return requests.filter((request) => request.employee.trim().toLowerCase() === wallet);
}

/**
 * The wage the employer last priced a request of theirs against.
 *
 * A request carries the wage of record it was computed with, so the newest one
 * is the closest this screen can get to that figure without a payroll read.
 */
export function leaveWageOfRecord(requests: readonly LeaveRequest[]): Amount | null {
  const newest = byNewestLeave(requests)[0];
  return newest ? newest.monthlyWage : null;
}

/** A leave range as a person reads it: `Mon 14 Sep — Wed 16 Sep`. */
export function formatLeaveRange(startOn: string, endOn: string): string {
  const start = dayAt(startOn);
  const end = dayAt(endOn);
  if (!start || !end) return `${startOn} — ${endOn}`;

  const format = (at: Date) =>
    at.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return startOn === endOn ? format(start) : `${format(start)} — ${format(end)}`;
}
