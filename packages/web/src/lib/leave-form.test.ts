import { describe, expect, it } from 'vitest';
import type { LeaveRequest, LeaveStatus } from '@tali/shared';

import {
  blockingLeaveIssue,
  checkLeaveRequest,
  formatLeaveRange,
  leaveWageOfRecord,
  ownLeave,
  parseDays,
  spanInDays,
  workingDaysBetween,
} from './leave-form';

function request(over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'leave-1',
    employee: '0xabc',
    startOn: '2026-09-14',
    endOn: '2026-09-16',
    days: '3',
    kind: 'annual',
    reason: 'Family',
    status: 'submitted' as LeaveStatus,
    monthlyWage: '30000000',
    deduction: '0',
    decisionReason: null,
    decidedAtMs: null,
    createdAtMs: 1,
    ...over,
  };
}

describe('parseDays', () => {
  it('reads whole and fractional days', () => {
    expect(parseDays('3')).toBe(300n);
    expect(parseDays('0.5')).toBe(50n);
    expect(parseDays('12.25')).toBe(1225n);
  });

  /* The submit schema takes at most two decimals and three whole digits, so
     the screen refuses what the server would refuse. */
  it('refuses what the server would refuse', () => {
    expect(parseDays('')).toBeNull();
    expect(parseDays('3.456')).toBeNull();
    expect(parseDays('1000')).toBeNull();
    expect(parseDays('half')).toBeNull();
    expect(parseDays('-2')).toBeNull();
  });
});

describe('spanInDays', () => {
  it('counts both ends', () => {
    expect(spanInDays('2026-09-14', '2026-09-14')).toBe(1);
    expect(spanInDays('2026-09-14', '2026-09-16')).toBe(3);
  });

  it('crosses a month boundary', () => {
    expect(spanInDays('2026-09-30', '2026-10-02')).toBe(3);
  });

  it('goes negative when the end is before the start', () => {
    expect(spanInDays('2026-09-16', '2026-09-14')).toBe(-1);
  });

  it('is null on a half-typed date', () => {
    expect(spanInDays('2026-09', '2026-09-16')).toBeNull();
    expect(spanInDays('', '')).toBeNull();
  });
});

describe('workingDaysBetween', () => {
  /* Section 60I divides the monthly wage by 26, which is a six-day week.
     Deducting a Sunday would charge a day of pay never owed for that day. */
  it('skips Sundays, because the ordinary rate already does', () => {
    // 2026-09-14 is a Monday; the 20th is the Sunday.
    expect(workingDaysBetween('2026-09-14', '2026-09-20')).toBe('6');
    expect(workingDaysBetween('2026-09-20', '2026-09-20')).toBe('0');
    expect(workingDaysBetween('2026-09-14', '2026-09-16')).toBe('3');
  });

  it('counts a fortnight as twelve', () => {
    expect(workingDaysBetween('2026-09-14', '2026-09-27')).toBe('12');
  });

  it('is null when the end is before the start, or a date is half typed', () => {
    expect(workingDaysBetween('2026-09-16', '2026-09-14')).toBeNull();
    expect(workingDaysBetween('2026-09', '2026-09-16')).toBeNull();
  });
});

describe('checkLeaveRequest', () => {
  const base = { startOn: '2026-09-14', endOn: '2026-09-16', days: '3', existing: [] };

  it('passes a clean request', () => {
    expect(checkLeaveRequest(base)).toEqual([]);
  });

  it('refuses an end before the start', () => {
    const issues = checkLeaveRequest({ ...base, startOn: '2026-09-16', endOn: '2026-09-14' });
    expect(issues.map((issue) => issue.code)).toContain('ends_before_start');
    expect(blockingLeaveIssue(issues)).not.toBeNull();
  });

  it('refuses more than a year in one request', () => {
    const issues = checkLeaveRequest({ ...base, endOn: '2027-09-16', days: '20' });
    expect(issues.map((issue) => issue.code)).toContain('too_long');
  });

  it('refuses nothing at all', () => {
    const issues = checkLeaveRequest({ ...base, days: '0' });
    expect(issues.map((issue) => issue.code)).toContain('not_positive');
  });

  /* The server rejects this with a 400, so the screen says it first. */
  it('refuses more days than the dates can hold', () => {
    const issues = checkLeaveRequest({ ...base, days: '5' });
    expect(issues.map((issue) => issue.code)).toContain('exceeds_span');
    expect(issues[0]!.message).toContain('3 days');
  });

  it('allows fewer days than the dates hold, for a half day or a holiday', () => {
    expect(checkLeaveRequest({ ...base, days: '2.5' })).toEqual([]);
  });

  it('refuses leave that overlaps leave already asked for', () => {
    const issues = checkLeaveRequest({
      ...base,
      existing: [request({ startOn: '2026-09-15', endOn: '2026-09-18' })],
    });
    expect(issues.map((issue) => issue.code)).toContain('overlaps');
  });

  it('counts an overlap that only touches at one end', () => {
    const issues = checkLeaveRequest({
      ...base,
      existing: [request({ startOn: '2026-09-16', endOn: '2026-09-20' })],
    });
    expect(issues.map((issue) => issue.code)).toContain('overlaps');
  });

  /* A rejected request holds no dates: it neither overlaps nor deducts. */
  it('ignores a rejected request when checking overlap', () => {
    expect(
      checkLeaveRequest({
        ...base,
        existing: [request({ startOn: '2026-09-15', endOn: '2026-09-18', status: 'rejected' })],
      }),
    ).toEqual([]);
  });

  it('leaves a request that ends the day before another alone', () => {
    expect(
      checkLeaveRequest({
        ...base,
        existing: [request({ startOn: '2026-09-17', endOn: '2026-09-20' })],
      }),
    ).toEqual([]);
  });
});

describe('ownLeave', () => {
  it('matches the wallet whatever case it is written in', () => {
    const mine = request({ employee: '0xABC' });
    expect(ownLeave([mine], '0xabc')).toEqual([mine]);
    expect(ownLeave([mine], '0xdef')).toEqual([]);
  });

  it('holds nothing for nobody', () => {
    expect(ownLeave([request()], null)).toEqual([]);
  });
});

describe('leaveWageOfRecord', () => {
  it('takes the wage from the newest request', () => {
    expect(
      leaveWageOfRecord([
        request({ id: 'a', createdAtMs: 1, monthlyWage: '30000000' }),
        request({ id: 'b', createdAtMs: 9, monthlyWage: '45000000' }),
      ]),
    ).toBe('45000000');
  });

  it('is null before any request exists', () => {
    expect(leaveWageOfRecord([])).toBeNull();
  });
});

describe('formatLeaveRange', () => {
  it('reads a single day as one date', () => {
    expect(formatLeaveRange('2026-09-14', '2026-09-14')).toBe('Mon 14 Sept');
  });

  it('reads a range as two', () => {
    expect(formatLeaveRange('2026-09-14', '2026-09-16')).toBe('Mon 14 Sept — Wed 16 Sept');
  });

  it('falls back to the raw dates it cannot read', () => {
    expect(formatLeaveRange('2026-09', 'x')).toBe('2026-09 — x');
  });
});
