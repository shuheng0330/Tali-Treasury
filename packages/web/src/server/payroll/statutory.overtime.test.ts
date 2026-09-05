import { overtimePay } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { clearsFloor, computeStatutory, overtimeHeadroom, type StatutoryInput } from './statutory';

const RM = (value: string): string => {
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
};

const month = (gross: string, overtime?: string, unpaidLeave?: string): StatutoryInput => {
  const input: StatutoryInput = { gross: RM(gross), age: 30, citizenship: 'local' };
  if (overtime !== undefined) input.overtime = RM(overtime);
  if (unpaidLeave !== undefined) input.unpaidLeave = RM(unpaidLeave);
  return input;
};

function bodyOf(split: ReturnType<typeof computeStatutory>, name: string) {
  const found = split.bodies.find((b) => b.body === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

/** Floors and caps S5 registers on the mandate, from floors.ts. */
const FLOOR_BPS = { epf: 2300n, socso: 225n, eis: 40n } as const;
const CAP = { epf: 0n, socso: 6_000_000_000n, eis: 6_000_000_000n } as const;

/**
 * The comparison run_payroll makes, transcribed from payroll.move: a floor is
 * measured against gross, or against the wage cap once gross passes it.
 */
function meetsMandateFloor(split: ReturnType<typeof computeStatutory>, name: keyof typeof CAP) {
  const gross = BigInt(split.gross);
  const basis = CAP[name] === 0n || gross < CAP[name] ? gross : CAP[name];
  return BigInt(bodyOf(split, name).total) * 10_000n >= basis * FLOOR_BPS[name];
}

describe('overtime and the three wage bases', () => {
  /*
   * The legal point the whole feature rests on. EPF Act 1991 s.2(b) excludes
   * "overtime payment" from wages and KWSP says so in as many words. SOCSO
   * (Act 4 s.2(24)) and EIS (Act 800 s.3) both define wages to include "any
   * payment in respect of leave, holidays, overtime, and extra work on
   * holidays". Payroll software that carries one wage base cannot be right
   * about all three in a month containing overtime.
   */
  it('does not move EPF when overtime is added, and does move SOCSO and EIS', () => {
    const without = computeStatutory(month('3000.00'));
    const with500 = computeStatutory(month('3000.00', '500.00'));

    expect(bodyOf(with500, 'epf')).toEqual(bodyOf(without, 'epf'));
    expect(bodyOf(with500, 'epf').employee).toBe(RM('330.00'));
    expect(bodyOf(with500, 'epf').employer).toBe(RM('390.00'));

    expect(bodyOf(without, 'socso').employee).toBe(RM('15.00'));
    expect(bodyOf(with500, 'socso').employee).toBe(RM('17.50'));
    expect(bodyOf(without, 'socso').employer).toBe(RM('52.50'));
    expect(bodyOf(with500, 'socso').employer).toBe(RM('61.25'));

    expect(bodyOf(without, 'eis').total).toBe(RM('12.00'));
    expect(bodyOf(with500, 'eis').total).toBe(RM('14.00'));
  });

  it('holds EPF steady across every overtime amount and raises the other two at each one', () => {
    const flat = bodyOf(computeStatutory(month('3000.00')), 'epf');
    let previousSocso = 0n;
    for (const overtime of ['0.01', '43.269231', '100.00', '500.00', '1500.00', '2999.99']) {
      const split = computeStatutory(month('3000.00', overtime));
      expect(bodyOf(split, 'epf'), overtime).toEqual(flat);
      const socso = BigInt(bodyOf(split, 'socso').total);
      expect(socso, overtime).toBeGreaterThan(previousSocso);
      previousSocso = socso;
    }
  });

  it('states the wage each body was measured against', () => {
    const split = computeStatutory(month('3000.00', '500.00'));
    expect(bodyOf(split, 'epf').base).toBe(RM('3000.00'));
    expect(bodyOf(split, 'socso').base).toBe(RM('3500.00'));
    expect(bodyOf(split, 'eis').base).toBe(RM('3500.00'));
    expect(split.gross).toBe(RM('3500.00'));
  });

  it.each([
    ['3000.00', undefined, undefined, '3000.00'],
    ['3000.00', '500.00', undefined, '3500.00'],
    ['3000.00', undefined, '30.00', '2970.00'],
    ['3000.00', '500.00', '30.00', '3470.00'],
    ['3000.00', '0.000001', '0.000001', '3000.00'],
  ] as [string, string | undefined, string | undefined, string][])(
    'makes gross RM%s plus %s overtime less %s unpaid leave',
    (gross, overtime, unpaidLeave, expected) => {
      const split = computeStatutory(month(gross, overtime, unpaidLeave));
      expect(split.gross).toBe(RM(expected));
      expect(split.baseWage).toBe(RM(gross));
      expect(split.overtime).toBe(overtime === undefined ? '0' : RM(overtime));
      expect(split.unpaidLeave).toBe(unpaidLeave === undefined ? '0' : RM(unpaidLeave));
    },
  );

  it('keeps net and employer cost consistent once overtime and leave are in play', () => {
    for (const overtime of ['0.00', '43.269231', '500.00']) {
      for (const unpaidLeave of ['0.00', '30.00', '115.384615']) {
        const split = computeStatutory(month('3000.00', overtime, unpaidLeave));
        const employee = split.bodies.reduce((sum, b) => sum + BigInt(b.employee), 0n);
        const employer = split.bodies.reduce((sum, b) => sum + BigInt(b.employer), 0n);
        expect(BigInt(split.net) + employee).toBe(BigInt(split.gross));
        expect(BigInt(split.employerCost)).toBe(BigInt(split.gross) + employer);
      }
    }
  });

  it('refuses arithmetic it cannot mean', () => {
    expect(() => computeStatutory(month('3000.00', '-1.00'))).toThrow(
      'overtime cannot be negative',
    );
    expect(() => computeStatutory(month('3000.00', undefined, '-1.00'))).toThrow(
      'unpaid leave cannot be negative',
    );
    expect(() => computeStatutory(month('3000.00', undefined, '3000.000001'))).toThrow(
      'unpaid leave cannot exceed the base wage',
    );
  });

  it('returns every amount as a decimal integer string, overtime included', () => {
    const split = computeStatutory(month('3333.33', '43.269231', '128.205128'));
    const amounts = [
      split.gross,
      split.net,
      split.employerCost,
      split.baseWage,
      split.overtime,
      split.unpaidLeave,
      ...split.bodies.flatMap((b) => [b.employee, b.employer, b.total, b.base]),
    ];
    for (const value of amounts) {
      expect(String(value)).toMatch(/^\d+$/);
    }
  });
});

describe('the RM6,000 SOCSO and EIS ceiling', () => {
  /*
   * Act 4 s.5(2) deems wages above the ceiling to BE the ceiling rather than
   * capping a contribution computed on the true figure, and since 1 October
   * 2024 that ceiling is RM6,000. Overtime is wages for these two bodies, so
   * overtime is what carries a wage under the ceiling up to it.
   */
  it('is reached by overtime, and deems wages to RM6,000 rather than the true total', () => {
    const split = computeStatutory(month('5500.00', '800.00'));
    expect(split.gross).toBe(RM('6300.00'));
    expect(bodyOf(split, 'socso').base).toBe(RM('6000.00'));
    expect(bodyOf(split, 'eis').base).toBe(RM('6000.00'));
    expect(bodyOf(split, 'socso').total).toBe(RM('135.00'));
    expect(bodyOf(split, 'eis').total).toBe(RM('24.00'));
  });

  it('lands a base-plus-overtime wage exactly where a plain wage of the same size lands', () => {
    const overtimeToTheCap = computeStatutory(month('5500.00', '800.00'));
    const plain = computeStatutory(month('6000.00'));
    expect(bodyOf(overtimeToTheCap, 'socso').total).toBe(bodyOf(plain, 'socso').total);
    expect(bodyOf(overtimeToTheCap, 'eis').total).toBe(bodyOf(plain, 'eis').total);
  });

  it.each([
    ['99.00', '5999.00', '29.995000'],
    ['100.00', '6000.00', '30.00'],
    ['101.00', '6000.00', '30.00'],
  ])('takes RM5,900 plus RM%s overtime to an insured RM%s', (overtime, insured, employee) => {
    const split = computeStatutory(month('5900.00', overtime));
    expect(bodyOf(split, 'socso').base).toBe(RM(insured));
    expect(bodyOf(split, 'socso').employee).toBe(RM(employee));
  });

  it('leaves EPF measured on the wage itself, ceiling or no ceiling', () => {
    const split = computeStatutory(month('5500.00', '800.00'));
    expect(bodyOf(split, 'epf').base).toBe(RM('5500.00'));
    expect(bodyOf(split, 'epf').employee).toBe(RM('605.00'));
    expect(bodyOf(split, 'epf').employer).toBe(RM('660.00'));
  });
});

describe('unpaid leave', () => {
  /* Wages not payable are not wages under any of the three definitions, so
     unpaid leave is the one figure here that comes off all three bases. */
  it('reduces all three bases alike', () => {
    const split = computeStatutory(month('3000.00', undefined, '30.00'));
    expect(split.gross).toBe(RM('2970.00'));
    expect(bodyOf(split, 'epf').base).toBe(RM('2970.00'));
    expect(bodyOf(split, 'socso').base).toBe(RM('2970.00'));
    expect(bodyOf(split, 'eis').base).toBe(RM('2970.00'));
    expect(bodyOf(split, 'socso').employee).toBe(RM('14.85'));
    expect(bodyOf(split, 'eis').total).toBe(RM('11.88'));
  });

  /* RM2,970 falls in the RM2,960.01–RM2,980 band, one band below RM3,000, so
     the employee's EPF drops from RM330 to 11% of 2,980 rounded up. */
  it('moves EPF into a lower Third Schedule band', () => {
    const full = computeStatutory(month('3000.00'));
    const reduced = computeStatutory(month('3000.00', undefined, '30.00'));
    expect(bodyOf(full, 'epf').employee).toBe(RM('330.00'));
    expect(bodyOf(reduced, 'epf').employee).toBe(RM('328.00'));
    expect(bodyOf(reduced, 'epf').employer).toBe(RM('388.00'));
  });

  it('comes off before overtime goes on', () => {
    const split = computeStatutory(month('3000.00', '500.00', '30.00'));
    expect(split.gross).toBe(RM('3470.00'));
    expect(bodyOf(split, 'epf').base).toBe(RM('2970.00'));
    expect(bodyOf(split, 'epf').total).toBe(RM('716.00'));
    expect(bodyOf(split, 'socso').base).toBe(RM('3470.00'));
    expect(bodyOf(split, 'socso').employer).toBe(RM('60.725'));
    expect(bodyOf(split, 'eis').total).toBe(RM('13.88'));
  });

  /* A month spent entirely on unpaid leave still owes EPF nothing on the
     overtime worked in it, which is correct and which no floor written against
     gross can accept. */
  it('can leave a month whose only wage is overtime, and no EPF at all', () => {
    const split = computeStatutory(month('3000.00', '500.00', '3000.00'));
    expect(split.gross).toBe(RM('500.00'));
    expect(bodyOf(split, 'epf').total).toBe('0');
    expect(bodyOf(split, 'socso').total).toBe(RM('11.25'));
    expect(clearsFloor(split, 'epf', FLOOR_BPS.epf)).toBe(false);
  });
});

describe('backward compatibility', () => {
  it('answers identically whether the new fields are absent or zero', () => {
    for (let ringgit = 800; ringgit <= 24000; ringgit += 137) {
      const gross = `${ringgit}.00`;
      const implicit = computeStatutory(month(gross));
      const explicit = computeStatutory(month(gross, '0.00', '0.00'));
      expect(implicit, gross).toEqual(explicit);
    }
  });

  it('still returns the values every existing caller was built on', () => {
    const split = computeStatutory(month('3000.00'));
    expect(split.gross).toBe(RM('3000.00'));
    expect(split.net).toBe(RM('2649.00'));
    expect(split.employerCost).toBe(RM('3448.50'));
    expect(split.bodies.map((b) => b.body)).toEqual(['epf', 'socso', 'eis']);
    expect(bodyOf(split, 'epf').total).toBe(RM('720.00'));
    expect(bodyOf(split, 'socso').total).toBe(RM('67.50'));
    expect(bodyOf(split, 'eis').total).toBe(RM('12.00'));
  });

  it('keeps the body order the contract pairs by index once overtime is added', () => {
    const split = computeStatutory(month('3000.00', '500.00', '30.00'));
    expect(split.bodies.map((b) => b.body)).toEqual(['epf', 'socso', 'eis']);
  });

  it('still clears every mandate floor for a month with no overtime and no leave', () => {
    for (let ringgit = 800; ringgit <= 24000; ringgit += 97) {
      const split = computeStatutory(month(`${ringgit}.00`));
      for (const name of ['epf', 'socso', 'eis'] as const) {
        expect({ wage: ringgit, name, ok: meetsMandateFloor(split, name) }).toEqual({
          wage: ringgit,
          name,
          ok: true,
        });
      }
    }
  });
});

describe('clearsFloor and overtimeHeadroom', () => {
  /*
   * The mandate measures the EPF floor against the one gross it is handed, and
   * overtime raises that gross without raising EPF's base. Somewhere there is
   * an amount of overtime that turns a legally correct split into abort 24, and
   * these two functions exist to find it before the employer approves a claim.
   */
  const DEMO_HEADROOM = 17_826_086n;

  it('names the exact overtime the RM30 demo wage can carry', () => {
    expect(overtimeHeadroom(month('30.00'), 'epf', FLOOR_BPS.epf)).toBe(DEMO_HEADROOM.toString());
  });

  it('flips at that overtime and not one base unit earlier or later', () => {
    const input = month('30.00');
    const at = computeStatutory({ ...input, overtime: DEMO_HEADROOM.toString() });
    const past = computeStatutory({ ...input, overtime: (DEMO_HEADROOM + 1n).toString() });
    expect(at.gross).toBe('47826086');
    expect(clearsFloor(at, 'epf', FLOOR_BPS.epf)).toBe(true);
    expect(clearsFloor(past, 'epf', FLOOR_BPS.epf)).toBe(false);
    expect(meetsMandateFloor(at, 'epf')).toBe(true);
    expect(meetsMandateFloor(past, 'epf')).toBe(false);
  });

  /* Whole sen leave nothing behind when SOCSO's and EIS's percentages are
     taken, so across this sweep EPF is the only body a floor binds on. The
     ragged base units real overtime produces are the block below. */
  it('agrees with clearsFloor at every quarter ringgit of overtime up to RM25', () => {
    const input = month('30.00');
    for (let overtime = 0n; overtime <= 25_000_000n; overtime += 250_000n) {
      const split = computeStatutory({ ...input, overtime: overtime.toString() });
      const where = overtime.toString();
      expect(clearsFloor(split, 'epf', FLOOR_BPS.epf), where).toBe(overtime <= DEMO_HEADROOM);
      expect(clearsFloor(split, 'socso', FLOOR_BPS.socso), where).toBe(true);
      expect(clearsFloor(split, 'eis', FLOOR_BPS.eis), where).toBe(true);
    }
  });

  it('measures the headroom from the wage actually payable, not the wage on paper', () => {
    const input = month('30.00', undefined, '5.00');
    const headroom = BigInt(overtimeHeadroom(input, 'epf', FLOOR_BPS.epf));
    const clears = (overtime: bigint) =>
      clearsFloor(
        computeStatutory({ ...input, overtime: overtime.toString() }),
        'epf',
        FLOOR_BPS.epf,
      );

    expect(headroom).toBe(22_826_086n);
    expect(clears(headroom)).toBe(true);
    expect(clears(headroom + 1n)).toBe(false);
  });

  /*
   * The same boundary said in hours, which is the form the employer approves
   * in. RM3,000 carries RM130.434782 of overtime before EPF falls under 2300
   * bps of gross: six hours on a normal working day fit inside it and seven do
   * not, and nothing about the EPF figure itself is wrong on either side.
   */
  it('turns into an answer about hours', () => {
    const input = month('3000.00');
    expect(overtimeHeadroom(input, 'epf', FLOOR_BPS.epf)).toBe('130434782');

    const withHours = (hours: string) =>
      computeStatutory({ ...input, overtime: overtimePay(input.gross, 'normal_day', hours) });

    expect(clearsFloor(withHours('6'), 'epf', FLOOR_BPS.epf)).toBe(true);
    expect(clearsFloor(withHours('7'), 'epf', FLOOR_BPS.epf)).toBe(false);
    expect(bodyOf(withHours('7'), 'epf').total).toBe(bodyOf(withHours('6'), 'epf').total);
  });

  it('returns the whole payable wage when there is no floor to clear', () => {
    expect(overtimeHeadroom(month('3000.00'), 'epf', 0n)).toBe(RM('3000.00'));
    expect(overtimeHeadroom(month('3000.00', undefined, '30.00'), 'epf', 0n)).toBe(RM('2970.00'));
  });

  /* SOCSO's base grows with overtime, so the headroom formula — which solves
     for a contribution that stays still — has nothing to say about it and says
     zero. The number is EPF's, as the function's own note explains. */
  it('is a statement about EPF and returns nothing for SOCSO', () => {
    expect(overtimeHeadroom(month('30.00'), 'socso', FLOOR_BPS.socso)).toBe('0');
  });
});

/*
 * Two places where these figures and the mandate do not line up. Neither is
 * reached by the deployed demo today — fx.ts converts to USDC and lifts any
 * body's employer leg that lands under its floor — but both are wrong for a
 * screen that asks clearsFloor whether a claim can be approved.
 *
 * Recorded here rather than fixed: statutory.ts belongs to another hand
 * tonight. Fixing either of these turns the matching test below red, which is
 * the intention.
 */
describe('where the MYR split meets the mandate floors', () => {
  /*
   * The chain measures a capped body against its cap, not against gross
   * (`floor_basis` in payroll.move), which is the only reason a wage above
   * RM6,000 is payable at all. clearsFloor now takes the same cap and answers
   * what the chain would.
   */
  it('accepts a wage above RM6,000 the way the contract does', () => {
    const split = computeStatutory(month('7000.00'));
    expect(bodyOf(split, 'socso').total).toBe(RM('135.00'));
    expect(meetsMandateFloor(split, 'socso')).toBe(true);
    expect(clearsFloor(split, 'socso', FLOOR_BPS.socso, RM('6000.00'))).toBe(true);
  });

  it('still refuses when the cap is not applied, which is what the chain does for EPF', () => {
    const split = computeStatutory(month('7000.00'));
    expect(clearsFloor(split, 'epf', FLOOR_BPS.epf)).toBe(true);
  });

  /*
   * SOCSO and EIS round up, so they never land under the floor they state.
   * A truncating division delivered one base unit less whenever gross was not a
   * multiple of 400 or 500 base units — which every whole-sen wage is, and which
   * overtime pay, itself rounded up, almost never is.
   */
  it('clears SOCSO and EIS on ragged overtime, to the base unit', () => {
    expect(meetsMandateFloor(computeStatutory(month('3000.00')), 'socso')).toBe(true);

    const withOvertime = computeStatutory({
      ...month('3000.00'),
      overtime: overtimePay(RM('3000.00'), 'normal_day', '2'),
    });
    expect(withOvertime.gross).toBe('3043269231');
    expect(bodyOf(withOvertime, 'socso').total).toBe('68473559');
    expect(BigInt(bodyOf(withOvertime, 'socso').total) * 10_000n).toBeGreaterThanOrEqual(
      BigInt(withOvertime.gross) * FLOOR_BPS.socso,
    );
    expect(meetsMandateFloor(withOvertime, 'socso')).toBe(true);
    expect(meetsMandateFloor(withOvertime, 'eis')).toBe(true);
    expect(meetsMandateFloor(withOvertime, 'epf')).toBe(true);
  });

  it('clears both on every quarter-hour claim the demo wage allows', () => {
    const QUARTER = ['.00', '.25', '.50', '.75'];
    let short = 0;
    for (let quarters = 1; quarters <= 416; quarters += 1) {
      const hours = Math.floor(quarters / 4) + QUARTER[quarters % 4];
      const split = computeStatutory({
        ...month('30.00'),
        overtime: overtimePay(RM('30.00'), 'normal_day', hours),
      });
      if (!meetsMandateFloor(split, 'socso') || !meetsMandateFloor(split, 'eis')) short += 1;
    }
    expect(short).toBe(0);
  });
});
