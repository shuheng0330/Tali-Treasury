import { convertMyrToUsdc, type PayrollFxConversion, type StatutorySplit } from '@tali/shared';

import type { FxRate } from '../fx/rates';

function convert(value: string, rate: string): bigint {
  return value === '0' ? 0n : BigInt(convertMyrToUsdc(value, rate));
}

/**
 * Converts one MYR statutory calculation into the exact micro-USDC amounts
 * submitted to Sui. The identities are reconstructed after rounding so the
 * displayed total is exactly what the transaction sends.
 */
export function quotePayrollSplit(
  source: StatutorySplit,
  rate: FxRate,
  quotedAtMs: number,
): StatutorySplit & { currency: 'USDC'; fxConversion: PayrollFxConversion } {
  const gross = convert(source.gross, rate.myrPerUsd);
  const bodies = source.bodies.map((body) => {
    const employee = convert(body.employee, rate.myrPerUsd);
    const employer = convert(body.employer, rate.myrPerUsd);
    return {
      body: body.body,
      employee: employee.toString(),
      employer: employer.toString(),
      total: (employee + employer).toString(),
    };
  });
  const employeeSide = bodies.reduce((sum, body) => sum + BigInt(body.employee), 0n);
  const net = gross - employeeSide;
  const employerCost = bodies.reduce((sum, body) => sum + BigInt(body.total), net);

  if (net <= 0n) throw new Error('FX-rounded payroll has no employee net payment');

  return {
    gross: gross.toString(),
    net: net.toString(),
    employerCost: employerCost.toString(),
    bodies,
    currency: 'USDC',
    fxConversion: {
      provider: 'open_exchange_rates',
      sourceCurrency: 'MYR',
      targetCurrency: 'USDC',
      myrPerUsd: rate.myrPerUsd,
      rateTimestampMs: rate.rateTimestampMs,
      fetchedAtMs: rate.fetchedAtMs,
      quotedAtMs,
      valuation: 'USDC_USD_PARITY',
      rounding: 'HALF_UP_6DP',
      source,
    },
  };
}
