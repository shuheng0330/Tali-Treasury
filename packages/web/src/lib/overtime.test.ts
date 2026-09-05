import { describe, expect, it } from 'vitest';

import {
  MAX_OVERTIME_HOURS_PER_MONTH,
  NORMAL_HOURS_PER_DAY,
  ORP_DAYS_PER_MONTH,
  OVERTIME_MULTIPLIER_BPS,
  approvedLeaveDeduction,
  checkOvertimeClaim,
  fromCentihours,
  overtimePay,
  pendingOvertimePay,
  toCentihours,
  unpaidLeaveDeduction,
} from '@tali/shared';
import type {
  LeaveRequest,
  LeaveStatus,
  OvertimeClaim,
  OvertimeIssueCode,
  OvertimeKind,
  OvertimeStatus,
} from '@tali/shared';

const RM = (value: string): string => {
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
};

/** The single divisor overtimePay reduces to: 26 days, 8 hours, bps, centihours. */
const OVERTIME_DIVISOR = ORP_DAYS_PER_MONTH * NORMAL_HOURS_PER_DAY * 10_000n * 100n;

/**
 * RM4,160 a month is RM160 over 26 days and RM20 over 8 hours, so the statutory
 * multiples of it land on whole base units and can be read off the result with
 * no rounding step standing in the way.
 */
const CLEAN_WAGE = RM('4160.00');
const CLEAN_HOURLY = BigInt(CLEAN_WAGE) / (ORP_DAYS_PER_MONTH * NORMAL_HOURS_PER_DAY);

describe('toCentihours', () => {
  it('reads the forms a claim arrives in', () => {
    expect(toCentihours('2')).toBe(200n);
    expect(toCentihours('2.5')).toBe(250n);
    expect(toCentihours('2.50')).toBe(250n);
    expect(toCentihours(' 2.5 ')).toBe(250n);
    expect(toCentihours('0.25')).toBe(25n);
    expect(toCentihours('.5')).toBe(50n);
    expect(toCentihours('0')).toBe(0n);
    expect(toCentihours('104')).toBe(10_400n);
  });

  it('refuses anything that is not a plain count of hours', () => {
    for (const value of ['', '.', '-1', '1e3', '2.5.5', 'abc', '1/2', '2h', 'NaN', '+3']) {
      expect(() => toCentihours(value), value).toThrow('Not a number of hours');
    }
  });

  /* Overtime is claimed in quarter hours at the finest, so a third decimal is
     below the granularity of the claim and is dropped rather than rounded. */
  it('keeps two places and does not look at a third', () => {
    expect(toCentihours('2.567')).toBe(256n);
    expect(toCentihours('2.999')).toBe(299n);
  });

  it('round-trips the canonical forms through fromCentihours', () => {
    for (const value of ['0', '2', '2.5', '0.25', '7.75', '13', '104']) {
      expect(fromCentihours(toCentihours(value)), value).toBe(value);
    }
    expect(fromCentihours(5n)).toBe('0.05');
    expect(fromCentihours(10_401n)).toBe('104.01');
  });
});

describe('overtimePay', () => {
  it.each([
    ['normal_day', '30.00'],
    ['rest_day', '40.00'],
    ['public_holiday', '60.00'],
  ] as [OvertimeKind, string][])(
    'pays one %s hour at the statutory multiple of the RM20 hourly rate',
    (kind, expected) => {
      const pay = BigInt(overtimePay(CLEAN_WAGE, kind, '1'));
      expect(pay).toBe(BigInt(RM(expected)));
      expect(pay).toBe((CLEAN_HOURLY * BigInt(OVERTIME_MULTIPLIER_BPS[kind])) / 10_000n);
    },
  );

  it('keeps the three multipliers in exact 1.5 : 2 : 3 proportion', () => {
    const normal = BigInt(overtimePay(CLEAN_WAGE, 'normal_day', '1'));
    const rest = BigInt(overtimePay(CLEAN_WAGE, 'rest_day', '1'));
    const holiday = BigInt(overtimePay(CLEAN_WAGE, 'public_holiday', '1'));
    expect(normal * 4n).toBe(rest * 3n);
    expect(rest * 3n).toBe(holiday * 2n);
  });

  /*
   * The worked example in full:
   *   ORP = 3,000 / 26           = 115.384615384... a day
   *   HRP = ORP / 8              =  14.423076923... an hour
   *   pay = HRP x 1.5 x 2 hours  =  43.269230769... ringgit
   * Six decimals of a ringgit stops at 43.269230 and the remainder belongs to
   * the worker, so the answer is 43.269231 — 43269231 base units.
   */
  it('pays RM43.269231 for two hours on a normal day at RM3,000 a month', () => {
    expect(overtimePay(RM('3000.00'), 'normal_day', '2')).toBe('43269231');
    expect(overtimePay(RM('3000.00'), 'normal_day', '2')).toBe(RM('43.269231'));
  });

  it('pays exact quarters, halves and three quarters of an hour', () => {
    expect(overtimePay(CLEAN_WAGE, 'normal_day', '0.25')).toBe(RM('7.50'));
    expect(overtimePay(CLEAN_WAGE, 'normal_day', '1.5')).toBe(RM('45.00'));
    expect(overtimePay(CLEAN_WAGE, 'rest_day', '7.75')).toBe(RM('310.00'));
    expect(overtimePay(CLEAN_WAGE, 'public_holiday', '0.25')).toBe(RM('15.00'));
  });

  /*
   * The remainder is a fraction of one millionth of a ringgit. Which way it
   * goes is still a decision, and it goes the worker's way — but by the one
   * base unit only, never by a rounding to the sen or the ringgit.
   */
  it('rounds up, and by at most one base unit, at every wage and hour tested', () => {
    const wages = ['20.00', '30.00', '1500.00', '3000.00', '3333.33', '4160.00', '7777.77'];
    const hours = ['0.25', '0.5', '1', '1.5', '2', '7.75', '13', '104'];
    for (const wage of wages) {
      for (const hour of hours) {
        for (const kind of Object.keys(OVERTIME_MULTIPLIER_BPS) as OvertimeKind[]) {
          const exact =
            BigInt(RM(wage)) * BigInt(OVERTIME_MULTIPLIER_BPS[kind]) * toCentihours(hour);
          const pay = BigInt(overtimePay(RM(wage), kind, hour));
          const where = wage + ' ' + kind + ' ' + hour;
          expect(pay * OVERTIME_DIVISOR, where).toBeGreaterThanOrEqual(exact);
          expect((pay - 1n) * OVERTIME_DIVISOR, where).toBeLessThan(exact);
          expect(pay - exact / OVERTIME_DIVISOR, where).toBeLessThanOrEqual(1n);
        }
      }
    }
  });

  it('rounds a division that does not come out even up to the next base unit', () => {
    // 3,000 x 15000 x 100 / 208,000,000 = 21.634615384..., so 21.634616.
    expect(overtimePay(RM('3000.00'), 'normal_day', '1')).toBe(RM('21.634616'));
  });

  it('pays nothing for no hours and nothing on no wage', () => {
    expect(overtimePay(RM('3000.00'), 'normal_day', '0')).toBe('0');
    expect(overtimePay(RM('3000.00'), 'rest_day', '0.00')).toBe('0');
    expect(overtimePay('0', 'public_holiday', '8')).toBe('0');
  });

  it('refuses a negative wage and unreadable hours', () => {
    expect(() => overtimePay('-1', 'normal_day', '2')).toThrow('cannot be negative');
    expect(() => overtimePay(RM('3000.00'), 'normal_day', 'four')).toThrow('Not a number of hours');
  });

  it('never returns anything but a decimal integer string', () => {
    for (const hour of ['0.25', '3', '104']) {
      expect(overtimePay(RM('3000.00'), 'normal_day', hour)).toMatch(/^\d+$/);
    }
  });
});

describe('unpaidLeaveDeduction', () => {
  /* 26 is the ordinary rate of pay divisor, so a whole month of unpaid leave
     removes the whole wage and one day of an RM26 wage removes exactly RM1. */
  it('takes one twenty-sixth of the month for a day', () => {
    expect(unpaidLeaveDeduction(RM('26.00'), '1')).toBe(RM('1.00'));
    expect(unpaidLeaveDeduction(RM('3000.00'), '26')).toBe(RM('3000.00'));
  });

  it('rounds down, the opposite direction to overtime and for the same reason', () => {
    const wage = BigInt(RM('3000.00'));
    const deduction = BigInt(unpaidLeaveDeduction(RM('3000.00'), '1'));
    expect(deduction).toBe(115_384_615n);
    expect(deduction * ORP_DAYS_PER_MONTH).toBeLessThanOrEqual(wage);
    expect((deduction + 1n) * ORP_DAYS_PER_MONTH).toBeGreaterThan(wage);
  });

  it('handles a half day and refuses a negative wage', () => {
    expect(unpaidLeaveDeduction(RM('26.00'), '0.5')).toBe(RM('0.50'));
    expect(unpaidLeaveDeduction(RM('26.00'), '0')).toBe('0');
    expect(() => unpaidLeaveDeduction('-1', '1')).toThrow('cannot be negative');
  });
});

type CheckInput = Parameters<typeof checkOvertimeClaim>[0];

const submission = (over: Partial<CheckInput> = {}): CheckInput => ({
  workedOn: '2026-09-04',
  hours: '2',
  todayIso: '2026-09-05',
  monthHoursClaimed: '10',
  claimedDates: ['2026-09-01'],
  leaveDates: ['2026-09-02'],
  ...over,
});

const codesOf = (input: CheckInput): OvertimeIssueCode[] =>
  checkOvertimeClaim(input).map((issue) => issue.code);

const ONE_OF_EACH: [OvertimeIssueCode, Partial<CheckInput>][] = [
  ['not_positive', { hours: '0' }],
  ['exceeds_day', { hours: '16.5' }],
  ['exceeds_month', { monthHoursClaimed: '103' }],
  ['duplicate_day', { claimedDates: ['2026-09-01', '2026-09-04'] }],
  ['on_leave', { leaveDates: ['2026-09-02', '2026-09-04'] }],
  ['future_date', { workedOn: '2026-09-06' }],
];

describe('checkOvertimeClaim', () => {
  it('finds nothing wrong with an ordinary claim', () => {
    expect(checkOvertimeClaim(submission())).toEqual([]);
  });

  it.each(ONE_OF_EACH)('raises %s on that input and on nothing else', (code, change) => {
    expect(codesOf(submission(change))).toEqual([code]);
  });

  /* A day on approved leave is the one thing here the employee may still have
     a good answer for, so it warns and lets the claim through. */
  it('blocks every issue except the one that is only a word of warning', () => {
    const blocking: Record<OvertimeIssueCode, boolean> = {
      not_positive: true,
      exceeds_day: true,
      exceeds_month: true,
      duplicate_day: true,
      on_leave: false,
      future_date: true,
    };
    for (const [code, change] of ONE_OF_EACH) {
      const issue = checkOvertimeClaim(submission(change))[0];
      expect(issue?.code, code).toBe(code);
      expect(issue?.blocking, code).toBe(blocking[code]);
      expect(issue?.message, code).toBeTruthy();
    }
  });

  /* The month ceiling counts what is already claimed plus what is claimed now,
     so the boundary is walked with the day's own hours held inside the sixteen
     a single day allows. */
  it.each([
    ['95.99', []],
    ['96', []],
    ['96.01', ['exceeds_month']],
  ] as [string, OvertimeIssueCode[]][])(
    'weighs %s hours already claimed plus 8 more against the 104 hour limit',
    (claimed, expected) => {
      expect(codesOf(submission({ monthHoursClaimed: claimed, hours: '8' }))).toEqual(expected);
    },
  );

  it('names the running total and the statutory limit in the message', () => {
    const issue = checkOvertimeClaim(submission({ monthHoursClaimed: '100', hours: '8' }))[0];
    expect(issue?.message).toContain('108');
    expect(issue?.message).toContain(String(MAX_OVERTIME_HOURS_PER_MONTH));
  });

  it('allows sixteen hours in a day and refuses a minute more', () => {
    expect(codesOf(submission({ hours: '16' }))).toEqual([]);
    expect(codesOf(submission({ hours: '16.01' }))).toEqual(['exceeds_day']);
  });

  it('allows a claim for today and refuses one for tomorrow', () => {
    expect(codesOf(submission({ workedOn: '2026-09-05' }))).toEqual([]);
    expect(codesOf(submission({ workedOn: '2026-09-06' }))).toEqual(['future_date']);
  });

  it('reports every issue a claim has rather than the first', () => {
    expect(
      codesOf(
        submission({
          hours: '0',
          claimedDates: ['2026-09-04'],
          leaveDates: ['2026-09-04'],
        }),
      ),
    ).toEqual(['not_positive', 'duplicate_day', 'on_leave']);
  });
});

const claim = (status: OvertimeStatus, pay: string): OvertimeClaim => ({
  id: 'ot-' + status + '-' + pay,
  mandateId: '0xa04894a0d3852092d08df2476bb36e47992ec13ad78ba2a6e38cb891f77f1100',
  employee: '0xemployee',
  workedOn: '2026-09-04',
  kind: 'normal_day',
  hours: '2',
  reason: 'Month end close',
  status,
  monthlyWage: RM('3000.00'),
  pay,
  decisionReason: null,
  decidedAtMs: null,
  runId: null,
  createdAtMs: 1_757_000_000_000,
});

const leave = (status: LeaveStatus): LeaveRequest => ({
  id: 'lv-' + status,
  employee: '0xemployee',
  startOn: '2026-09-10',
  endOn: '2026-09-10',
  days: '1',
  kind: 'unpaid',
  reason: 'Family matter',
  status,
  monthlyWage: RM('3000.00'),
  deduction: unpaidLeaveDeduction(RM('3000.00'), '1'),
  decisionReason: null,
  decidedAtMs: null,
  createdAtMs: 1_757_000_000_000,
});

describe('pendingOvertimePay', () => {
  it('counts what is approved and nothing else', () => {
    expect(
      pendingOvertimePay([
        claim('submitted', RM('10.00')),
        claim('approved', RM('43.269231')),
        claim('approved', RM('21.634616')),
        claim('rejected', RM('99.00')),
        claim('paid', RM('500.00')),
      ]),
    ).toBe(RM('64.903847'));
  });

  it('is zero for an empty list and for one with nothing approved', () => {
    expect(pendingOvertimePay([])).toBe('0');
    expect(pendingOvertimePay([claim('submitted', RM('10.00')), claim('paid', RM('10.00'))])).toBe(
      '0',
    );
  });
});

describe('approvedLeaveDeduction', () => {
  it('counts what is approved and nothing else', () => {
    expect(approvedLeaveDeduction([leave('submitted'), leave('approved'), leave('rejected')])).toBe(
      RM('115.384615'),
    );
  });

  it('is zero when nothing has been approved', () => {
    expect(approvedLeaveDeduction([])).toBe('0');
    expect(approvedLeaveDeduction([leave('submitted')])).toBe('0');
  });
});
