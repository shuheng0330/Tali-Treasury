import { COIN_DECIMALS, toDisplay } from '@tali/shared';

/** What the calculator needs to know about one month of one person's wages. */
export interface WageClassValue {
  /** Ringgit as typed, not base units: this is what is in the input. */
  gross: string;
  age: number;
  citizenship: 'local' | 'foreign';
}

/* The same bounds the request schema enforces, so the screen refuses what the
   server would refuse and says the same thing about it. */
const MIN_GROSS = 100_000_000n;
const MAX_GROSS = 200_000_000_000n;

const AMOUNT = /^\d+(?:\.\d{1,6})?$/;

export function grossToBaseUnits(gross: string): bigint | null {
  const value = gross.replace(/[,\s]/g, '');
  if (!AMOUNT.test(value)) return null;

  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(COIN_DECIMALS) + BigInt(fraction.padEnd(COIN_DECIMALS, '0'));
}

/** The reason this wage cannot be run, or null when it can. */
export function grossProblem(gross: string): string | null {
  const base = grossToBaseUnits(gross);
  if (base === null) return 'Enter a monthly wage in ringgit, to at most six decimals.';
  if (base < MIN_GROSS) {
    /* The EPF schedule's narrowest band is RM20, so below about RM100 the
       employee share stops being a share of the wage at all. */
    return `Below ${toDisplay(MIN_GROSS.toString())} the EPF bands stop describing a salary.`;
  }
  if (base > MAX_GROSS) return 'That is a typo, not a monthly salary.';
  return null;
}
