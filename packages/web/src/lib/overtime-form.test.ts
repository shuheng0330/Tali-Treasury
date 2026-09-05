import { describe, expect, it } from 'vitest';
import type { OvertimeClaim, OvertimeStatus } from '@tali/shared';

import {
  DEMO_MONTHLY_WAGE,
  blockingIssue,
  byNewest,
  claimedDates,
  defaultOvertimeKind,
  formatWorkedOn,
  hourlyRate,
  isoDay,
  monthHoursClaimed,
  monthOf,
  ordinaryRate,
  overtimeHourlyRate,
  ownClaims,
  parseHours,
  statutoryBases,
  wageOfRecord,
} from './overtime-form';

const EMPLOYEE = '0xemployee';

function claim(overrides: Partial<OvertimeClaim> = {}): OvertimeClaim {
  return {
    id: 'claim-1',
    mandateId: null,
    employee: EMPLOYEE,
    workedOn: '2026-09-07',
    kind: 'normal_day',
    hours: '2',
    reason: 'Closing the month-end books',
    status: 'submitted' as OvertimeStatus,
    monthlyWage: DEMO_MONTHLY_WAGE,
    pay: '432693',
    decisionReason: null,
    decidedAtMs: null,
    runId: null,
    createdAtMs: 1_000,
    ...overrides,
  };
}

describe('defaultOvertimeKind', () => {
  it('reads Sunday as a rest day', () => {
    expect(defaultOvertimeKind('2026-09-06')).toBe('rest_day');
    expect(defaultOvertimeKind('2026-01-04')).toBe('rest_day');
  });

  it('reads every other day as a working day', () => {
    expect(defaultOvertimeKind('2026-09-07')).toBe('normal_day');
    expect(defaultOvertimeKind('2026-09-12')).toBe('normal_day');
  });

  /* A public holiday cannot be derived from a date, so it is never the default:
     guessing one would put a 3x multiplier on screen on the employee's word. */
  it('never guesses a public holiday', () => {
    for (let day = 1; day <= 31; day += 1) {
      const iso = `2026-12-${`${day}`.padStart(2, '0')}`;
      expect(defaultOvertimeKind(iso)).not.toBe('public_holiday');
    }
  });

  it('falls back to a working day when the date is half typed', () => {
    expect(defaultOvertimeKind('')).toBe('normal_day');
    expect(defaultOvertimeKind('2026-09')).toBe('normal_day');
  });
});

describe('isoDay', () => {
  it('reads the local calendar day, not the UTC one', () => {
    expect(isoDay(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05');
    expect(isoDay(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('parseHours', () => {
  it('reads the quarter hours overtime is claimed in', () => {
    expect(parseHours('2')).toBe(200n);
    expect(parseHours('2.25')).toBe(225n);
    expect(parseHours('0.5')).toBe(50n);
  });

  it('answers null rather than throwing mid-keystroke', () => {
    for (const value of ['', '.', 'abc', '-2', '2..5']) {
      expect(parseHours(value), value).toBeNull();
    }
  });

  /* The submit schema takes two decimals and two digits. Reading a third here
     would send hours the server refuses, under a preview that had priced them. */
  it('refuses what the server would refuse', () => {
    expect(parseHours('2.755')).toBeNull();
    expect(parseHours('120')).toBeNull();
    expect(parseHours('.5')).toBeNull();
  });
});

describe('monthHoursClaimed', () => {
  const claims = [
    claim({ id: 'a', workedOn: '2026-09-07', hours: '2' }),
    claim({ id: 'b', workedOn: '2026-09-08', hours: '1.5', status: 'approved' }),
    claim({ id: 'c', workedOn: '2026-09-09', hours: '3', status: 'rejected' }),
    claim({ id: 'd', workedOn: '2026-08-31', hours: '4', status: 'paid' }),
  ];

  it('totals the hours the statutory limit counts', () => {
    expect(monthHoursClaimed(claims, '2026-09')).toBe('3.5');
  });

  it('leaves a rejected claim out of the month', () => {
    expect(monthHoursClaimed([claim({ status: 'rejected', hours: '5' })], '2026-09')).toBe('0');
  });

  it('counts only the month asked for', () => {
    expect(monthHoursClaimed(claims, '2026-08')).toBe('4');
  });
});

describe('claimedDates', () => {
  it('holds the days that already carry a live claim', () => {
    const claims = [
      claim({ id: 'a', workedOn: '2026-09-07' }),
      claim({ id: 'b', workedOn: '2026-09-08', status: 'rejected' }),
      claim({ id: 'c', workedOn: '2026-08-07' }),
    ];
    expect(claimedDates(claims, '2026-09')).toEqual(['2026-09-07']);
  });
});

describe('the rates a payslip states', () => {
  it('divides the monthly wage by the statutory 26', () => {
    expect(ordinaryRate(DEMO_MONTHLY_WAGE)).toBe('1153846');
  });

  it('divides the ordinary rate by the eight normal hours', () => {
    expect(hourlyRate(DEMO_MONTHLY_WAGE)).toBe('144230');
  });

  it('multiplies the hourly rate by the statutory multiple', () => {
    expect(overtimeHourlyRate(DEMO_MONTHLY_WAGE, 'normal_day')).toBe('216347');
    expect(overtimeHourlyRate(DEMO_MONTHLY_WAGE, 'rest_day')).toBe('288462');
    expect(overtimeHourlyRate(DEMO_MONTHLY_WAGE, 'public_holiday')).toBe('432693');
  });
});

describe('statutoryBases', () => {
  it('leaves overtime out of the EPF base and inside the other two', () => {
    const bases = statutoryBases(DEMO_MONTHLY_WAGE, '649039');
    expect(bases.epf).toBe('30000000');
    expect(bases.socso).toBe('30649039');
    expect(bases.eis).toBe('30649039');
    expect(bases.deemed).toBe(false);
  });

  it('moves nothing when no overtime has been entered', () => {
    const bases = statutoryBases(DEMO_MONTHLY_WAGE, '0');
    expect(bases.epf).toBe(bases.socso);
    expect(bases.socso).toBe(bases.eis);
  });

  /* The RM6,000 figure is a deeming provision, so overtime counts toward
     reaching it. Capping the contribution afterwards would give the same answer
     here and the wrong one for a wage already above the ceiling. */
  it('deems the SOCSO and EIS wage at the ceiling once overtime carries it there', () => {
    const bases = statutoryBases('5900000000', '200000000');
    expect(bases.epf).toBe('5900000000');
    expect(bases.socso).toBe('6000000000');
    expect(bases.deemed).toBe(true);
  });
});

describe('ownClaims', () => {
  it('keeps the signed-in wallet its own claims, whatever the case', () => {
    const claims = [claim({ id: 'a' }), claim({ id: 'b', employee: '0xsomebody' })];
    expect(ownClaims(claims, '0xEMPLOYEE').map((entry) => entry.id)).toEqual(['a']);
  });

  it('shows nobody anything before a wallet is signed in', () => {
    expect(ownClaims([claim()], null)).toEqual([]);
  });
});

describe('byNewest', () => {
  it('puts the most recent claim first without mutating the argument', () => {
    const claims = [
      claim({ id: 'old', createdAtMs: 1 }),
      claim({ id: 'new', createdAtMs: 9 }),
    ];
    expect(byNewest(claims).map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(claims.map((entry) => entry.id)).toEqual(['old', 'new']);
  });
});

describe('wageOfRecord', () => {
  it('takes the wage the newest claim was priced against', () => {
    const claims = [
      claim({ id: 'old', createdAtMs: 1, monthlyWage: '20000000' }),
      claim({ id: 'new', createdAtMs: 9, monthlyWage: '35000000' }),
    ];
    expect(wageOfRecord(claims)).toBe('35000000');
  });

  it('answers null when no claim has been priced yet', () => {
    expect(wageOfRecord([])).toBeNull();
  });
});

describe('blockingIssue', () => {
  it('finds the issue that stops a submission', () => {
    const issues = [
      { code: 'on_leave' as const, message: 'Approved leave.', blocking: false },
      { code: 'duplicate_day' as const, message: 'Already claimed.', blocking: true },
    ];
    expect(blockingIssue(issues)?.code).toBe('duplicate_day');
  });

  it('answers null when every issue is only a warning', () => {
    expect(
      blockingIssue([{ code: 'on_leave', message: 'Approved leave.', blocking: false }]),
    ).toBeNull();
  });
});

describe('monthOf and formatWorkedOn', () => {
  it('reads the month a day belongs to', () => {
    expect(monthOf('2026-09-07')).toBe('2026-09');
  });

  it('names the weekday, which is what decides the multiplier', () => {
    expect(formatWorkedOn('2026-09-12')).toMatch(/^Sat 12 Sep/);
    expect(formatWorkedOn('2026-09-06')).toMatch(/^Sun 6 Sep/);
  });

  it('shows a half-typed date back rather than Invalid Date', () => {
    expect(formatWorkedOn('2026-09')).toBe('2026-09');
  });
});
