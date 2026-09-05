import type { LeaveRequest, OvertimeClaim } from '@tali/shared';
import { overtimePay, unpaidLeaveDeduction } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import {
  basisAfter,
  commitment,
  composeSplit,
  epfBase,
  grossEffect,
  grossOf,
  overtimeHeadroom,
  projectedSpend,
  queueOrder,
  testFloor,
  wageBasis,
  type MandateBudget,
} from './approval-summary';
import {
  clearsFloor,
  computeStatutory,
  overtimeHeadroom as serverHeadroom,
} from '../server/payroll/statutory';

const EMPLOYEE = `0x${'a'.repeat(64)}`;
const WAGE = '3000000000';
const CLASS = { age: 30, citizenship: 'local' as const };

const EPF_FLOOR = { body: 'epf' as const, minBps: '2300', wageCap: '0' };

const MANDATE: MandateBudget = {
  mandateId: `0x${'b'.repeat(64)}`,
  spendable: '3317095',
  maxPerRun: '5000000',
  floors: [
    EPF_FLOOR,
    { body: 'socso', minBps: '225', wageCap: '6000000000' },
    { body: 'eis', minBps: '40', wageCap: '6000000000' },
  ],
  revoked: false,
  expiryMs: 4_000_000_000_000,
  fetchedAtMs: 1_700_000_000_000,
};

function claim(overrides: Partial<OvertimeClaim> = {}): OvertimeClaim {
  const hours = overrides.hours ?? '4';
  const kind = overrides.kind ?? 'normal_day';
  return {
    id: 'ot-1',
    mandateId: null,
    employee: EMPLOYEE,
    workedOn: '2026-09-02',
    kind,
    hours,
    reason: 'Month-end close',
    status: 'submitted',
    monthlyWage: WAGE,
    pay: overtimePay(WAGE, kind, hours),
    decisionReason: null,
    decidedAtMs: null,
    runId: null,
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

function leave(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  const days = overrides.days ?? '2';
  const kind = overrides.kind ?? 'unpaid';
  return {
    id: 'lv-1',
    employee: EMPLOYEE,
    startOn: '2026-09-10',
    endOn: '2026-09-11',
    days,
    kind,
    reason: 'Family matter',
    status: 'submitted',
    monthlyWage: WAGE,
    deduction: kind === 'unpaid' ? unpaidLeaveDeduction(WAGE, days) : '0',
    decisionReason: null,
    decidedAtMs: null,
    createdAtMs: 1_700_000_000_000,
    ...overrides,
  };
}

/** The two previews the browser composes, as the server would answer them. */
function sides(paid: string, overtime: string) {
  return {
    epfSide: computeStatutory({ gross: paid, ...CLASS }),
    wageSide: computeStatutory({
      gross: (BigInt(paid) + BigInt(overtime)).toString(),
      ...CLASS,
    }),
  };
}

function composed(paid: string, overtime: string) {
  const { epfSide, wageSide } = sides(paid, overtime);
  const split = composeSplit(epfSide, wageSide);
  if (!split) throw new Error('the two sides did not compose');
  return split;
}

describe('composeSplit', () => {
  it('reproduces an overtime-aware calculation from two overtime-blind previews', () => {
    for (const hours of ['1', '4', '12.5', '104']) {
      const pay = overtimePay(WAGE, 'normal_day', hours);
      const expected = computeStatutory({ gross: WAGE, overtime: pay, ...CLASS });
      const actual = composed(WAGE, pay);

      expect(actual.gross, hours).toBe(expected.gross);
      expect(actual.net, hours).toBe(expected.net);
      expect(actual.employerCost, hours).toBe(expected.employerCost);
      expect(actual.bodies, hours).toEqual(expected.bodies);
    }
  });

  it('reproduces it with unpaid leave taken off every base first', () => {
    const deduction = unpaidLeaveDeduction(WAGE, '3');
    const pay = overtimePay(WAGE, 'rest_day', '6');
    const paid = (BigInt(WAGE) - BigInt(deduction)).toString();

    const expected = computeStatutory({
      gross: WAGE,
      overtime: pay,
      unpaidLeave: deduction,
      ...CLASS,
    });
    const actual = composed(paid, pay);

    expect(actual.gross).toBe(expected.gross);
    expect(actual.net).toBe(expected.net);
    expect(actual.bodies).toEqual(expected.bodies);
  });

  it('keeps EPF off the overtime and SOCSO and EIS on it', () => {
    const pay = overtimePay(WAGE, 'public_holiday', '8');
    const plain = composed(WAGE, '0');
    const withOvertime = composed(WAGE, pay);

    const epf = (split: { bodies: { body: string; total: string }[] }) =>
      split.bodies.find((body) => body.body === 'epf')!.total;
    const socso = (split: { bodies: { body: string; total: string }[] }) =>
      split.bodies.find((body) => body.body === 'socso')!.total;

    expect(epf(withOvertime)).toBe(epf(plain));
    expect(BigInt(socso(withOvertime))).toBeGreaterThan(BigInt(socso(plain)));
  });

  it('refuses a pair handed to it the wrong way round', () => {
    const { epfSide, wageSide } = sides(WAGE, '1000000');
    expect(composeSplit(wageSide, epfSide)).toBeNull();
  });
});

describe('testFloor', () => {
  it('agrees with the server on whether a split clears the mandate floor', () => {
    for (const hours of ['0', '2', '6', '9', '20', '104']) {
      const pay = overtimePay(WAGE, 'normal_day', hours);
      const split = composed(WAGE, pay);
      const expected = clearsFloor(
        computeStatutory({ gross: WAGE, overtime: pay, ...CLASS }),
        'epf',
        2300n,
      );

      expect(testFloor(split, EPF_FLOOR)?.clears, hours).toBe(expected);
    }
  });

  it('is the whole point: enough overtime drops EPF under a floor it cleared', () => {
    const small = composed(WAGE, overtimePay(WAGE, 'normal_day', '2'));
    const large = composed(WAGE, overtimePay(WAGE, 'normal_day', '20'));

    expect(testFloor(small, EPF_FLOOR)?.clears).toBe(true);
    expect(testFloor(large, EPF_FLOOR)?.clears).toBe(false);
  });

  it('names the total the floor would need at that gross', () => {
    const split = composed(WAGE, overtimePay(WAGE, 'normal_day', '20'));
    const test = testFloor(split, EPF_FLOOR)!;

    expect(BigInt(test.required)).toBe((BigInt(split.gross) * 2300n + 9_999n) / 10_000n);
    expect(BigInt(test.total)).toBeLessThan(BigInt(test.required));
    expect(test.actualBps).toBeLessThan(2300);
  });
});

describe('overtimeHeadroom', () => {
  it('agrees with the server on the most overtime the floor allows', () => {
    const split = composed(WAGE, overtimePay(WAGE, 'normal_day', '4'));

    expect(overtimeHeadroom(split, EPF_FLOOR)).toBe(
      serverHeadroom({ gross: WAGE, ...CLASS }, 'epf', 2300n),
    );
  });

  it('is the overtime a claim has to stay under', () => {
    const ceiling = overtimeHeadroom(composed(WAGE, '0'), EPF_FLOOR)!;
    const under = composed(WAGE, (BigInt(ceiling) - 1n).toString());
    const over = composed(WAGE, (BigInt(ceiling) + 1n).toString());

    expect(testFloor(under, EPF_FLOOR)?.clears).toBe(true);
    expect(testFloor(over, EPF_FLOOR)?.clears).toBe(false);
  });
});

describe('wageBasis', () => {
  it('counts approved overtime and approved unpaid leave, and nothing else', () => {
    const basis = wageBasis(
      EMPLOYEE,
      [
        claim({ id: 'a', status: 'approved', hours: '4' }),
        claim({ id: 'b', status: 'submitted', hours: '4' }),
        claim({ id: 'c', status: 'rejected', hours: '4' }),
        claim({ id: 'd', status: 'paid', hours: '4' }),
      ],
      [
        leave({ id: 'e', status: 'approved', days: '2' }),
        leave({ id: 'f', status: 'submitted', days: '2' }),
        leave({ id: 'g', status: 'approved', kind: 'annual', days: '2' }),
      ],
    );

    expect(basis.overtime).toBe(overtimePay(WAGE, 'normal_day', '4'));
    expect(basis.unpaidLeave).toBe(unpaidLeaveDeduction(WAGE, '2'));
    expect(basis.monthlyWage).toBe(WAGE);
  });

  it('ignores another employee’s records', () => {
    const other = `0x${'c'.repeat(64)}`;
    const basis = wageBasis(
      EMPLOYEE,
      [claim({ id: 'a', status: 'approved', employee: other })],
      [leave({ id: 'b', status: 'approved', employee: other })],
    );

    expect(basis).toEqual({ monthlyWage: '0', unpaidLeave: '0', overtime: '0' });
  });

  it('takes the wage of record from the newest record', () => {
    const basis = wageBasis(
      EMPLOYEE,
      [
        claim({ id: 'old', monthlyWage: '2500000000', createdAtMs: 1 }),
        claim({ id: 'new', monthlyWage: '3200000000', createdAtMs: 2 }),
      ],
      [],
    );

    expect(basis.monthlyWage).toBe('3200000000');
  });
});

describe('basisAfter', () => {
  it('adds overtime to gross without touching the EPF base', () => {
    const basis = wageBasis(EMPLOYEE, [claim({ status: 'approved' })], []);
    const pending = claim({ id: 'ot-2', hours: '6' });
    const after = basisAfter(basis, { kind: 'overtime', claim: pending });

    expect(epfBase(after)).toBe(epfBase(basis));
    expect(BigInt(grossOf(after)) - BigInt(grossOf(basis))).toBe(BigInt(pending.pay));
  });

  it('takes unpaid leave off the EPF base as well as off gross', () => {
    const basis = wageBasis(EMPLOYEE, [], []);
    const request = leave({ days: '2' });
    const after = basisAfter({ ...basis, monthlyWage: WAGE }, { kind: 'leave', request });

    expect(BigInt(epfBase(after))).toBeLessThan(BigInt(WAGE));
    expect(grossOf(after)).toBe(epfBase(after));
  });

  it('leaves paid leave alone', () => {
    const basis = { monthlyWage: WAGE, unpaidLeave: '0', overtime: '0' };
    const request = leave({ kind: 'annual', days: '3' });

    expect(basisAfter(basis, { kind: 'leave', request })).toEqual(basis);
    expect(grossEffect({ kind: 'leave', request })).toBe('0');
  });

  it('signs the effect the way the reader reads it', () => {
    const pending = claim({ hours: '3' });
    const unpaid = leave({ days: '1' });

    expect(grossEffect({ kind: 'overtime', claim: pending })).toBe(pending.pay);
    expect(grossEffect({ kind: 'leave', request: unpaid })).toBe(`-${unpaid.deduction}`);
  });
});

describe('queueOrder', () => {
  it('puts the longest wait first', () => {
    const ordered = queueOrder([
      { kind: 'overtime', claim: claim({ id: 'later', createdAtMs: 30 }) },
      { kind: 'leave', request: leave({ id: 'earlier', createdAtMs: 10 }) },
      { kind: 'overtime', claim: claim({ id: 'middle', createdAtMs: 20 }) },
    ]);

    expect(ordered.map((item) => (item.kind === 'overtime' ? item.claim.id : item.request.id))).toEqual([
      'earlier',
      'middle',
      'later',
    ]);
  });
});

describe('projectedSpend', () => {
  it('measures the employer cost against a budget that cannot be topped up', () => {
    const split = composed('60000000', '0');
    const spend = projectedSpend(split, MANDATE, '4.20')!;

    expect(BigInt(spend.cost)).toBeGreaterThan(0n);
    expect(spend.withinBudget).toBe(BigInt(spend.cost) <= BigInt(MANDATE.spendable));
    expect(spend.remaining).toBe(
      spend.withinBudget
        ? (BigInt(MANDATE.spendable) - BigInt(spend.cost)).toString()
        : null,
    );
  });

  it('says no when the run costs more than the mandate holds', () => {
    const spend = projectedSpend(composed(WAGE, '0'), MANDATE, '4.20')!;

    expect(spend.withinBudget).toBe(false);
    expect(spend.remaining).toBeNull();
  });

  it('returns nothing rather than an invented figure on an unusable rate', () => {
    expect(projectedSpend(composed(WAGE, '0'), MANDATE, 'not-a-rate')).toBeNull();
  });
});

describe('commitment', () => {
  it('reports the floor before and after, and what is still spare', () => {
    const pay = overtimePay(WAGE, 'normal_day', '20');
    const result = commitment({
      before: composed(WAGE, '0'),
      after: composed(WAGE, pay),
      mandate: MANDATE,
      myrPerUsd: '4.20',
    });

    expect(result.grossChange).toBe(pay);
    expect(result.epfBefore?.clears).toBe(true);
    expect(result.epfAfter?.clears).toBe(false);
    expect(result.epfSpare).toBe('0');
    expect(BigInt(result.epfCeiling!)).toBeLessThan(BigInt(pay));
  });

  it('signs a deduction and leaves the floor cleared', () => {
    const deduction = unpaidLeaveDeduction(WAGE, '2');
    const paid = (BigInt(WAGE) - BigInt(deduction)).toString();
    const result = commitment({
      before: composed(WAGE, '0'),
      after: composed(paid, '0'),
      mandate: MANDATE,
      myrPerUsd: '4.20',
    });

    expect(BigInt(result.grossChange)).toBeLessThan(0n);
    expect(result.epfAfter?.clears).toBe(true);
  });

  it('leaves the USDC figures out rather than guessing at a rate', () => {
    const result = commitment({
      before: composed(WAGE, '0'),
      after: composed(WAGE, '1000000'),
      mandate: MANDATE,
      myrPerUsd: null,
    });

    expect(result.spendBefore).toBeNull();
    expect(result.spendAfter).toBeNull();
    expect(result.epfAfter).not.toBeNull();
  });
});
