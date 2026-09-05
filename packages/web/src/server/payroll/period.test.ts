import { describe, expect, it } from 'vitest';
import type { LeaveRequest, OvertimeClaim } from '@tali/shared';

import { EMPTY_PERIOD, assemblePeriod, periodProblem } from './period';

const RM = (value: string): string => {
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
};

const EMPLOYEE = `0x${'b'.repeat(64)}`;
const SOMEBODY_ELSE = `0x${'c'.repeat(64)}`;
const MANDATE = `0x${'3'.repeat(64)}`;
const OTHER_MANDATE = `0x${'7'.repeat(64)}`;
const WAGE = RM('3000.00');

/** RM3,000 / 26 / 8 x 1.5 x 2 hours, rounded up. */
const TWO_HOURS = '43269231';

function claim(overrides: Partial<OvertimeClaim> = {}): OvertimeClaim {
  return {
    id: 'ot-1',
    mandateId: MANDATE,
    employee: EMPLOYEE,
    workedOn: '2026-09-02',
    kind: 'normal_day',
    hours: '2',
    reason: 'release night',
    status: 'approved',
    monthlyWage: WAGE,
    pay: TWO_HOURS,
    decisionReason: null,
    decidedAtMs: 2_000,
    runId: null,
    createdAtMs: 1_000,
    ...overrides,
  };
}

function leave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'lv-1',
    employee: EMPLOYEE,
    startOn: '2026-09-10',
    endOn: '2026-09-10',
    days: '1',
    kind: 'unpaid',
    reason: 'family',
    status: 'approved',
    monthlyWage: WAGE,
    deduction: RM('115.384615'),
    decisionReason: null,
    decidedAtMs: 2_000,
    createdAtMs: 1_000,
    ...overrides,
  };
}

function assemble(claims: OvertimeClaim[], requests: LeaveRequest[] = []) {
  return assemblePeriod({
    mandateId: MANDATE,
    employee: EMPLOYEE,
    claims,
    leave: requests,
  });
}

describe('assemblePeriod', () => {
  it('is empty when there is nothing approved', () => {
    expect(assemble([])).toEqual(EMPTY_PERIOD);
  });

  it('sums the pay and the hours of every approved unpaid claim', () => {
    const period = assemble([
      claim({ id: 'ot-1', hours: '2' }),
      claim({ id: 'ot-2', hours: '1.5', workedOn: '2026-09-03', pay: '32451924' }),
    ]);

    expect(period.overtime).toBe((BigInt(TWO_HOURS) + 32_451_924n).toString());
    expect(period.hours).toBe('3.5');
    expect(period.claimIds).toEqual(['ot-1', 'ot-2']);
  });

  it('leaves out everything the employer has not approved', () => {
    const period = assemble([
      claim({ id: 'ot-1', status: 'submitted' }),
      claim({ id: 'ot-2', status: 'rejected' }),
    ]);

    expect(period).toEqual(EMPTY_PERIOD);
  });

  it('leaves out a claim a previous run already paid', () => {
    const period = assemble([claim({ id: 'ot-1', status: 'paid', runId: 'run-1' })]);

    expect(period.overtime).toBe('0');
    expect(period.claimIds).toEqual([]);
  });

  it('leaves out a claim stamped with a run but still reading as approved', () => {
    // A marking that half-failed. Paying it again is the mistake that costs
    // the treasury the same overtime twice.
    const period = assemble([claim({ id: 'ot-1', status: 'approved', runId: 'run-1' })]);

    expect(period.claimIds).toEqual([]);
  });

  it('leaves out another worker and another mandate', () => {
    const period = assemble([
      claim({ id: 'ot-1', employee: SOMEBODY_ELSE }),
      claim({ id: 'ot-2', mandateId: OTHER_MANDATE }),
    ]);

    expect(period).toEqual(EMPTY_PERIOD);
  });

  it('keeps a claim raised before the payroll was registered', () => {
    const period = assemble([claim({ id: 'ot-1', mandateId: null })]);

    expect(period.claimIds).toEqual(['ot-1']);
    expect(period.overtime).toBe(TWO_HOURS);
  });

  it('matches an address whatever case it was stored in', () => {
    const period = assemble([claim({ employee: EMPLOYEE.toUpperCase().replace('0X', '0x') })]);

    expect(period.claimIds).toEqual(['ot-1']);
  });

  it('deducts approved unpaid leave and nothing else', () => {
    const period = assemble(
      [],
      [
        leave({ id: 'lv-1' }),
        leave({ id: 'lv-2', kind: 'annual', deduction: '0' }),
        leave({ id: 'lv-3', status: 'submitted' }),
        leave({ id: 'lv-4', employee: SOMEBODY_ELSE }),
      ],
    );

    expect(period.unpaidLeave).toBe(RM('115.384615'));
  });
});

describe('periodProblem', () => {
  it('passes a period the wage can carry', () => {
    expect(periodProblem(assemble([claim()], [leave()]), WAGE)).toBeNull();
  });

  it('refuses leave larger than the wage it comes off', () => {
    const period = assemble([], [leave({ deduction: RM('4000.00') })]);

    expect(periodProblem(period, WAGE)).toContain('more than the RM 3,000.00 wage');
  });

  it('refuses a month that unpaid leave takes to nothing', () => {
    const period = assemble([], [leave({ deduction: WAGE })]);

    expect(periodProblem(period, WAGE)).toContain('nothing');
  });

  it('allows a fully unpaid month that overtime still pays for', () => {
    const period = assemble([claim()], [leave({ deduction: WAGE })]);

    expect(periodProblem(period, WAGE)).toBeNull();
  });
});
