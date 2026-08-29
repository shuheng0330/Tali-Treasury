import { USDC_DECIMALS } from './config.js';

export function parseDecimalAmount(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('Decimals must be a non-negative integer');
  }

  const normalized = value.trim();
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match?.[1]) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places`);
  }

  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(match[1]) * scale;
  const fractional = fraction.length === 0
    ? 0n
    : BigInt(fraction.padEnd(decimals, '0'));
  return whole + fractional;
}

export function formatDecimalAmount(value: bigint, decimals: number): string {
  if (value < 0n) throw new Error('Amount cannot be negative');
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('Decimals must be a non-negative integer');
  }

  if (decimals === 0) return value.toString();

  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
}

export function parseUsdc(value: string): bigint {
  return parseDecimalAmount(value, USDC_DECIMALS);
}

export function formatUsdc(value: bigint): string {
  return formatDecimalAmount(value, USDC_DECIMALS);
}
