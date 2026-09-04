import { describe, expect, it } from 'vitest';

import { grossProblem, grossToBaseUnits } from './payroll-wage';

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
