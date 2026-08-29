import type { Amount } from './claims.js';

export const COIN_DECIMALS = 6;

const UNIT = 10n ** BigInt(COIN_DECIMALS);

export function toBaseUnits(display: string): Amount {
  const cleaned = display.replace(/[,\s]/g, '').trim();
  const negative = cleaned.startsWith('-');
  const [whole = '0', frac = ''] = (negative ? cleaned.slice(1) : cleaned).split('.');

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) {
    throw new Error(`Not a number: ${display}`);
  }

  const padded = (frac + '0'.repeat(COIN_DECIMALS)).slice(0, COIN_DECIMALS);
  const value = BigInt(whole || '0') * UNIT + BigInt(padded || '0');
  return (negative ? -value : value).toString();
}

export function toDisplay(base: Amount, fractionDigits = 2): string {
  const value = BigInt(base);
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const whole = (absolute / UNIT).toLocaleString('en-US');
  const frac = (absolute % UNIT).toString().padStart(COIN_DECIMALS, '0').slice(0, fractionDigits);

  const rendered = fractionDigits > 0 ? `${whole}.${frac}` : whole;
  return negative ? `-${rendered}` : rendered;
}

export function fromBigInt(value: bigint): Amount {
  return value.toString();
}

export function toBigInt(value: Amount): bigint {
  return BigInt(value);
}

export function add(a: Amount, b: Amount): Amount {
  return (BigInt(a) + BigInt(b)).toString();
}

export function subtract(a: Amount, b: Amount): Amount {
  return (BigInt(a) - BigInt(b)).toString();
}

export function compare(a: Amount, b: Amount): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Basis points of `part` in `whole`, so callers avoid float rounding on money. */
export function ratioBps(part: Amount, whole: Amount): number {
  const denominator = BigInt(whole);
  if (denominator === 0n) return 0;
  return Number((BigInt(part) * 10000n) / denominator);
}
