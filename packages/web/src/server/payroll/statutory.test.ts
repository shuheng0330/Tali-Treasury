import { describe, expect, it } from 'vitest';

import { computeStatutory, epfWageBand, type StatutoryInput } from './statutory';

const RM = (value: string): string => {
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
};

const local = (gross: string, age = 30): StatutoryInput => ({
  gross: RM(gross),
  age,
  citizenship: 'local',
});

function bodyOf(split: ReturnType<typeof computeStatutory>, name: string) {
  const found = split.bodies.find((b) => b.body === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

/** Floors and caps S5 registers on the mandate. */
const FLOOR_BPS = { epf: 2300n, socso: 225n, eis: 40n } as const;
const CAP = { epf: 0n, socso: 6_000_000_000n, eis: 6_000_000_000n } as const;
const NET_MIN_BPS = 7000n;

describe('epfWageBand', () => {
  it('rounds up to the next RM20 below RM5,000', () => {
    expect(epfWageBand(BigInt(RM('2990.00')))).toBe(BigInt(RM('3000.00')));
    expect(epfWageBand(BigInt(RM('2980.01')))).toBe(BigInt(RM('3000.00')));
  });

  it('leaves a wage sitting exactly on a band ceiling alone', () => {
    expect(epfWageBand(BigInt(RM('2980.00')))).toBe(BigInt(RM('2980.00')));
    expect(epfWageBand(BigInt(RM('3000.00')))).toBe(BigInt(RM('3000.00')));
  });

  it('switches to RM100 bands above RM5,000', () => {
    expect(epfWageBand(BigInt(RM('5000.01')))).toBe(BigInt(RM('5100.00')));
    expect(epfWageBand(BigInt(RM('6750.00')))).toBe(BigInt(RM('6800.00')));
    expect(epfWageBand(BigInt(RM('6800.00')))).toBe(BigInt(RM('6800.00')));
  });

  it('stops banding above RM20,000', () => {
    expect(epfWageBand(BigInt(RM('20500.55')))).toBe(BigInt(RM('20500.55')));
  });
});

describe('computeStatutory', () => {
  /*
   * Spot values checked against the KWSP Third Schedule method: the rate applied
   * to the band ceiling, rounded up to the next ringgit.
   *   RM3,000 -> band 3,000 -> 11% = 330, 13% = 390
   *   RM4,500 -> band 4,500 -> 11% = 495, 13% = 585
   *   RM6,800 -> band 6,800 -> 11% = 748, 12% = 816   (employer rate steps down)
   */
  it.each([
    ['3000.00', '330.00', '390.00'],
    ['4500.00', '495.00', '585.00'],
    ['5000.00', '550.00', '650.00'],
    ['6800.00', '748.00', '816.00'],
  ])('computes EPF for RM%s', (gross, employee, employer) => {
    const epf = bodyOf(computeStatutory(local(gross)), 'epf');
    expect(epf.employee).toBe(RM(employee));
    expect(epf.employer).toBe(RM(employer));
  });

  it('charges the same EPF across a whole band', () => {
    const low = bodyOf(computeStatutory(local('2980.01')), 'epf');
    const high = bodyOf(computeStatutory(local('3000.00')), 'epf');
    expect(low.total).toBe(high.total);
  });

  it('steps the employer rate down from 13% to 12% above RM5,000', () => {
    expect(bodyOf(computeStatutory(local('5000.00')), 'epf').employer).toBe(RM('650.00'));
    expect(bodyOf(computeStatutory(local('5100.00')), 'epf').employer).toBe(RM('612.00'));
  });

  it('rounds a fractional contribution up to the next whole ringgit', () => {
    // Band 3,020 -> 11% = 332.20, which must be stated as RM333.
    const epf = bodyOf(computeStatutory(local('3010.00')), 'epf');
    expect(epf.employee).toBe(RM('333.00'));
  });

  it('caps SOCSO and EIS at RM6,000 of wages', () => {
    const atCap = computeStatutory(local('6000.00'));
    const above = computeStatutory(local('10000.00'));
    expect(bodyOf(above, 'socso').total).toBe(bodyOf(atCap, 'socso').total);
    expect(bodyOf(above, 'eis').total).toBe(bodyOf(atCap, 'eis').total);
  });

  it('uses exact percentages above RM20,000', () => {
    const epf = bodyOf(computeStatutory(local('25000.00')), 'epf');
    expect(epf.employee).toBe(RM('2750.00'));
    expect(epf.employer).toBe(RM('3000.00'));
  });

  it('drops the employee EPF share and EIS entirely at 60', () => {
    const split = computeStatutory(local('3000.00', 62));
    expect(bodyOf(split, 'epf').employee).toBe('0');
    expect(bodyOf(split, 'epf').employer).toBe(RM('120.00'));
    expect(bodyOf(split, 'eis').total).toBe('0');
  });

  it('contributes 2% each side for a foreign worker', () => {
    const split = computeStatutory({ gross: RM('3000.00'), age: 30, citizenship: 'foreign' });
    expect(bodyOf(split, 'epf').employee).toBe(RM('60.00'));
    expect(bodyOf(split, 'epf').employer).toBe(RM('60.00'));
  });

  it('always returns the three bodies in the order the contract pairs by index', () => {
    for (const gross of ['1200.00', '3000.00', '25000.00']) {
      expect(computeStatutory(local(gross)).bodies.map((b) => b.body)).toEqual([
        'epf',
        'socso',
        'eis',
      ]);
    }
  });

  it('keeps net plus the employee shares equal to gross across the range', () => {
    for (let ringgit = 800; ringgit <= 24000; ringgit += 137) {
      const split = computeStatutory(local(`${ringgit}.00`));
      const employeeSide = split.bodies.reduce((sum, b) => sum + BigInt(b.employee), 0n);
      expect(BigInt(split.net) + employeeSide).toBe(BigInt(split.gross));
    }
  });

  it('keeps employer cost equal to gross plus the employer shares', () => {
    for (let ringgit = 800; ringgit <= 24000; ringgit += 211) {
      const split = computeStatutory(local(`${ringgit}.00`));
      const employerSide = split.bodies.reduce((sum, b) => sum + BigInt(b.employer), 0n);
      expect(BigInt(split.employerCost)).toBe(BigInt(split.gross) + employerSide);
    }
  });

  it('never returns a negative or a non-string amount', () => {
    const split = computeStatutory(local('3333.33'));
    for (const value of [split.gross, split.net, split.employerCost]) {
      expect(typeof value).toBe('string');
      expect(BigInt(value)).toBeGreaterThan(0n);
    }
    for (const b of split.bodies) {
      expect(BigInt(b.total)).toBeGreaterThanOrEqual(0n);
    }
  });

  /*
   * These are the exact comparisons run_payroll makes. A wage that fails here
   * would be refused on abort 24 in production despite being computed correctly,
   * so this is the test that keeps the calculator and the mandate agreeing.
   */
  describe('clears the on-chain floors for a local worker under 60', () => {
    const basis = (name: keyof typeof CAP, gross: bigint) =>
      CAP[name] === 0n || gross < CAP[name] ? gross : CAP[name];

    it.each(['epf', 'socso', 'eis'] as const)('%s floor', (name) => {
      for (let ringgit = 800; ringgit <= 24000; ringgit += 97) {
        const split = computeStatutory(local(`${ringgit}.00`));
        const gross = BigInt(split.gross);
        expect({
          wage: ringgit,
          ok:
            BigInt(bodyOf(split, name).total) * 10000n >=
            basis(name, gross) * FLOOR_BPS[name],
        }).toEqual({ wage: ringgit, ok: true });
      }
    });

    it('net floor', () => {
      for (let ringgit = 800; ringgit <= 24000; ringgit += 97) {
        const split = computeStatutory(local(`${ringgit}.00`));
        expect({
          wage: ringgit,
          ok: BigInt(split.net) * 10000n >= BigInt(split.gross) * NET_MIN_BPS,
        }).toEqual({ wage: ringgit, ok: true });
      }
    });
  });
});
