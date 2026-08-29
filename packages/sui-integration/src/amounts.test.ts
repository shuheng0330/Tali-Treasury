import { describe, expect, it } from 'vitest';
import { formatUsdc, parseUsdc } from './amounts.js';

describe('USDC amount conversion', () => {
  it('converts display USDC to its 6-decimal atomic units exactly', () => {
    expect(parseUsdc('500')).toBe(500_000_000n);
    expect(parseUsdc('4.50')).toBe(4_500_000n);
    expect(parseUsdc('0.000001')).toBe(1n);
  });

  it('formats atomic units without floating-point rounding', () => {
    expect(formatUsdc(500_000_000n)).toBe('500');
    expect(formatUsdc(4_500_000n)).toBe('4.5');
    expect(formatUsdc(1n)).toBe('0.000001');
  });

  it('rejects invalid or over-precise input', () => {
    expect(() => parseUsdc('-1')).toThrow('Invalid decimal amount');
    expect(() => parseUsdc('1.0000001')).toThrow('more than 6 decimal places');
    expect(() => parseUsdc('1e6')).toThrow('Invalid decimal amount');
  });
});
