import { describe, expect, it } from 'vitest';

import { computeStatutory } from './statutory';
import { quotePayrollSplit } from './fx';

const RM = (value: string): string => {
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString();
};

describe('payroll MYR to USDC conversion', () => {
  it('quotes the RM30 scaled wage instead of sending 30 USDC', () => {
    const source = computeStatutory({ gross: RM('30'), age: 30, citizenship: 'local' });
    const quoted = quotePayrollSplit(
      source,
      { myrPerUsd: '4.0416', rateTimestampMs: 1_000, fetchedAtMs: 2_000 },
      3_000,
    );

    expect(quoted.gross).toBe('7422803');
    expect(quoted.employerCost).toBe('9052110');
    expect(quoted.fxConversion.source.gross).toBe(RM('30'));
    expect(quoted.fxConversion.myrPerUsd).toBe('4.0416');
  });

  it('keeps every rounded token accounting identity exact', () => {
    const source = computeStatutory({ gross: RM('30'), age: 30, citizenship: 'local' });
    const quoted = quotePayrollSplit(
      source,
      { myrPerUsd: '4.0416', rateTimestampMs: 1_000, fetchedAtMs: 2_000 },
      3_000,
    );
    const employeeSide = quoted.bodies.reduce((sum, body) => sum + BigInt(body.employee), 0n);
    const paid = quoted.bodies.reduce((sum, body) => sum + BigInt(body.total), BigInt(quoted.net));

    expect(BigInt(quoted.net) + employeeSide).toBe(BigInt(quoted.gross));
    expect(paid).toBe(BigInt(quoted.employerCost));
  });

  it('rounds every statutory transfer up to the immutable on-chain floor', () => {
    const source = computeStatutory({ gross: RM('30'), age: 30, citizenship: 'local' });
    const quoted = quotePayrollSplit(
      source,
      { myrPerUsd: '4.0442', rateTimestampMs: 1_000, fetchedAtMs: 2_000 },
      3_000,
    );
    const floors = { epf: 2300n, socso: 225n, eis: 40n } as const;

    for (const body of quoted.bodies) {
      expect(BigInt(body.total) * 10_000n).toBeGreaterThanOrEqual(
        BigInt(quoted.gross) * floors[body.body],
      );
    }
    expect(quoted.bodies.find((body) => body.body === 'eis')?.total).toBe('29673');
  });
});
