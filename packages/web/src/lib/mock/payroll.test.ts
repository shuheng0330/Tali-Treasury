import { describe, expect, it } from 'vitest';

import { sampleStaff } from './payroll';

/** What S5 registers on the mandate. A run below any of these aborts on 24. */
const FLOOR_BPS = { epf: 2300n, socso: 225n, eis: 40n } as const;

/**
 * SOCSO and EIS contributions stop growing at RM6,000 of wages, so their floor
 * is measured against a capped basis. Taken on gross, an RM6,800 salary pays
 * 199 bps against a 225 bps floor and correct payroll would be refused.
 */
const WAGE_CAP = { epf: 0n, socso: 6_000_000_000n, eis: 6_000_000_000n } as const;
const NET_MIN_BPS = 7000n;

function basisFor(body: keyof typeof WAGE_CAP, gross: bigint): bigint {
  const cap = WAGE_CAP[body];
  return cap === 0n || gross < cap ? gross : cap;
}

describe.each(sampleStaff)('$name', (staff) => {
  const { gross, net, employerCost, bodies } = staff.breakdown;
  const employeeSide = bodies.reduce((sum, b) => sum + BigInt(b.employee), 0n);
  const employerSide = bodies.reduce((sum, b) => sum + BigInt(b.employer), 0n);

  it('takes the employee deductions out of gross to reach net', () => {
    expect(BigInt(net)).toBe(BigInt(gross) - employeeSide);
  });

  it('adds the employer contributions on top of gross to reach the cost', () => {
    expect(BigInt(employerCost)).toBe(BigInt(gross) + employerSide);
  });

  it('pays out exactly what it costs the employer', () => {
    const total = BigInt(net) + bodies.reduce((sum, b) => sum + BigInt(b.total), 0n);
    expect(total).toBe(BigInt(employerCost));
  });

  it('lists the bodies in the order the contract pairs them by index', () => {
    expect(bodies.map((b) => b.body)).toEqual(['epf', 'socso', 'eis']);
  });

  /* If a sample fails a floor here, the screen would be showing a run the
     contract refuses — which is worse than showing nothing. */
  it.each(['epf', 'socso', 'eis'] as const)('clears the on-chain %s floor', (name) => {
    const body = bodies.find((b) => b.body === name);
    expect(body).toBeDefined();
    expect(BigInt(body!.total) * 10000n).toBeGreaterThanOrEqual(
      basisFor(name, BigInt(gross)) * FLOOR_BPS[name],
    );
  });

  it('leaves the worker above the net floor', () => {
    expect(BigInt(net) * 10000n).toBeGreaterThanOrEqual(BigInt(gross) * NET_MIN_BPS);
  });

  it('keeps every amount a positive base-unit string', () => {
    for (const value of [gross, net, employerCost, ...bodies.map((b) => b.total)]) {
      expect(typeof value).toBe('string');
      expect(BigInt(value)).toBeGreaterThan(0n);
    }
  });
});
