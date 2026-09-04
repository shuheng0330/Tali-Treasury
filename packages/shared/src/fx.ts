import type { Claim } from './claims.js';

export const FX_MAX_RATE_AGE_MS = 90 * 60_000;
export const FX_QUOTE_LIFETIME_MS = 15 * 60_000;
const U64_MAX = 18_446_744_073_709_551_615n;

/** Receipt amounts retain the repository's six-decimal units, including MYR. */
export interface FxQuote {
  id: string;
  claimId: string;
  eventId: string;
  recipient: string;
  mandateId: string;
  provider: 'open_exchange_rates';
  sourceCurrency: 'MYR';
  targetCurrency: 'USDC';
  sourceAmount: string;
  targetAmount: string;
  /** MYR per one USD, not USD per MYR. */
  myrPerUsd: string;
  rateTimestampMs: number;
  fetchedAtMs: number;
  createdAtMs: number;
  expiresAtMs: number;
  valuation: 'USDC_USD_PARITY';
  rounding: 'HALF_UP_6DP';
}

export function convertMyrToUsdc(amount: string, myrPerUsd: string): string {
  if (!/^[1-9]\d{0,19}$/.test(amount) || BigInt(amount) > U64_MAX) throw new Error('Invalid source amount');
  if (!/^\d{1,3}(?:\.\d{1,12})?$/.test(myrPerUsd)) throw new Error('Invalid FX rate');
  const [whole, fraction = ''] = myrPerUsd.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const rate = BigInt(whole + fraction);
  // Broad circuit breaker, not a prediction of the exchange rate.
  if (rate < scale || rate > 20n * scale) throw new Error('FX rate outside supported range');
  const numerator = BigInt(amount) * scale;
  const result = (2n * numerator + rate) / (2n * rate);
  if (result <= 0n || result > U64_MAX) throw new Error('Invalid payment amount');
  return result.toString();
}

export function isFxQuote(value: unknown): value is FxQuote {
  if (!value || typeof value !== 'object') return false;
  const q = value as FxQuote;
  try {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const address = /^0x[0-9a-f]{64}$/;
    return typeof q.sourceAmount === 'string' && typeof q.targetAmount === 'string' &&
      [q.id, q.claimId, q.eventId].every(v => typeof v === 'string' && uuid.test(v)) &&
      [q.recipient, q.mandateId].every(v => typeof v === 'string' && address.test(v)) &&
      q.provider === 'open_exchange_rates' && q.sourceCurrency === 'MYR' && q.targetCurrency === 'USDC' &&
      q.valuation === 'USDC_USD_PARITY' && q.rounding === 'HALF_UP_6DP' &&
      [q.rateTimestampMs, q.fetchedAtMs, q.createdAtMs, q.expiresAtMs].every(v => Number.isSafeInteger(v) && v > 0) &&
      q.rateTimestampMs <= q.fetchedAtMs + 60_000 && q.fetchedAtMs <= q.createdAtMs &&
      q.expiresAtMs > q.createdAtMs && q.expiresAtMs <= q.createdAtMs + FX_QUOTE_LIFETIME_MS &&
      q.expiresAtMs <= q.rateTimestampMs + FX_MAX_RATE_AGE_MS &&
      convertMyrToUsdc(q.sourceAmount, q.myrPerUsd) === q.targetAmount;
  } catch { return false; }
}

/** Omit nowMs only for historical display/reconciliation, never new execution. */
export function claimPaymentAmount(
  claim: Pick<Claim, 'amount' | 'analysis' | 'fxQuote'> & Partial<Pick<Claim, 'id' | 'eventId' | 'submitter'>>,
  nowMs?: number,
): string | null {
  if (claim.analysis?.currency === 'USDC') {
    return /^[1-9]\d{0,19}$/.test(claim.amount) && BigInt(claim.amount) <= U64_MAX ? claim.amount : null;
  }
  const q = claim.fxQuote;
  if (claim.analysis?.currency !== 'MYR' || !isFxQuote(q) || q.sourceAmount !== claim.amount ||
      (claim.id !== undefined && q.claimId !== claim.id) ||
      (claim.eventId !== undefined && q.eventId !== claim.eventId) ||
      (claim.submitter !== undefined && q.recipient !== claim.submitter) ||
      (nowMs !== undefined && (nowMs < q.createdAtMs || nowMs >= q.expiresAtMs))) return null;
  return q.targetAmount;
}
