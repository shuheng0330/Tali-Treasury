import { describe, expect, it } from 'vitest';

import {
  grossAfterUnpaidLeave,
  grossProblem,
  grossToBaseUnits,
  unpaidLeaveProblem,
  type WageClassValue,
} from './payroll-wage';

describe('grossToBaseUnits', () => {
  it('reads ringgit at the coin precision', () => {
    expect(grossToBaseUnits('3000')).toBe(3_000_000_000n);
    expect(grossToBaseUnits('3000.50')).toBe(3_000_500_000n);
    expect(grossToBaseUnits('0.000001')).toBe(1n);
  });

  it('ignores the separators people type into a salary', () => {
    expect(grossToBaseUnits('4,500.00')).toBe(4_500_000_000n);
    expect(grossToBaseUnits(' 4500 ')).toBe(4_500_000_000n);
  });

  it('refuses anything that is not a plain amount', () => {
    for (const value of ['', '.', '-100', '1e6', '3000.1234567', 'abc']) {
      expect(grossToBaseUnits(value), value).toBeNull();
    }
  });
});

describe('grossProblem', () => {
  it('accepts a monthly wage the server would accept', () => {
    // The bounds are the request schema's, so the screen must not refuse what
    // the server allows, nor offer to send what it would reject.
    expect(grossProblem('30')).toBeNull();
    expect(grossProblem('3000')).toBeNull();
    expect(grossProblem('200000')).toBeNull();
  });

  it('refuses a scaled wage below the narrowest EPF band', () => {
    expect(grossProblem('19.999999')).toContain('at least');
    expect(grossProblem('10')).toContain('at least');
  });

  it('refuses a figure that is a typo rather than a salary', () => {
    expect(grossProblem('200000.000001')).toContain('typo');
  });

  it('explains an unreadable amount rather than calling it out of range', () => {
    expect(grossProblem('abc')).toContain('ringgit');
  });
});

describe('unpaid leave', () => {
  const wage = (gross: string, unpaidLeaveDays = 0): WageClassValue => ({
    gross,
    age: 30,
    citizenship: 'local',
    unpaidLeaveDays,
  });

  it('leaves the wage alone when no leave was taken', () => {
    expect(grossAfterUnpaidLeave(wage('30'))).toBe(grossToBaseUnits('30'));
  });

  /* 26 is the ordinary rate of pay divisor, so one day off RM26 is exactly
     RM1 — the case where the arithmetic is checkable by eye. */
  it('deducts one twenty-sixth of the month per day', () => {
    expect(grossAfterUnpaidLeave(wage('26', 1))).toBe(grossToBaseUnits('25'));
    expect(grossAfterUnpaidLeave(wage('26', 4))).toBe(grossToBaseUnits('22'));
  });

  it('takes the whole wage when the whole month is unpaid', () => {
    expect(grossAfterUnpaidLeave(wage('30', 26))).toBe(0n);
    expect(grossAfterUnpaidLeave(wage('30', 40))).toBe(0n);
  });

  /* A daily rate is computed once and multiplied, the way a payslip states it.
     Deducting a single combined fraction would land a few base units away and
     stop matching what an employee can check. */
  it('multiplies a daily rate rather than deducting one combined fraction', () => {
    const base = grossToBaseUnits('30')!;
    const daily = base / 26n;
    expect(grossAfterUnpaidLeave(wage('30', 3))).toBe(base - daily * 3n);
  });

  it('says nothing is wrong with an ordinary month', () => {
    expect(unpaidLeaveProblem(wage('30', 2))).toBeNull();
  });

  it('refuses a fraction of a day', () => {
    expect(unpaidLeaveProblem(wage('30', 1.5))).toContain('whole number');
    expect(unpaidLeaveProblem(wage('30', -1))).toContain('whole number');
  });

  it('refuses more unpaid days than the month has', () => {
    expect(unpaidLeaveProblem(wage('30', 27))).toContain('26');
  });

  it('says so when leave consumes the entire wage', () => {
    expect(unpaidLeaveProblem(wage('30', 26))).toContain('no wage to run');
  });

  /* The reduced wage still has to clear the floor the run request enforces, or
     the screen would offer a preview the server refuses. */
  it('refuses a reduction that falls under the minimum the mandate accepts', () => {
    expect(unpaidLeaveProblem(wage('21', 20))).toContain('falls below');
  });

  it('has no opinion about leave when the wage itself is unreadable', () => {
    expect(grossAfterUnpaidLeave(wage('not a wage', 2))).toBeNull();
    expect(unpaidLeaveProblem(wage('not a wage', 2))).toBeNull();
  });
});
