import { randomUUID } from 'node:crypto';
import { convertMyrToUsdc, FX_MAX_RATE_AGE_MS, FX_QUOTE_LIFETIME_MS, isFxQuote, type FxQuote } from '@tali/shared';
import type { ClaimProcessContext } from '../claims/ports';
import { ServerError } from '../errors';
import type { FxRate } from './rates';

export function createClaimQuoter(options: { rates: () => Promise<FxRate>; now?: () => number }) {
  return async (context: ClaimProcessContext): Promise<FxQuote> => {
    const { claim, event } = context;
    if (claim.analysis?.currency !== 'MYR') throw new ServerError('fx_quote_invalid', 409, 'Only MYR receipts support FX quotes.');
    const rate = await options.rates();
    const now = options.now?.() ?? Date.now();
    let targetAmount: string;
    try { targetAmount = convertMyrToUsdc(claim.amount, rate.myrPerUsd); }
    catch { throw new ServerError('fx_quote_invalid', 409, 'The receipt amount cannot be quoted safely.'); }
    const quote: FxQuote = {
      id: randomUUID(), claimId: claim.id, eventId: claim.eventId, recipient: claim.submitter, mandateId: event.mandateId,
      provider: 'open_exchange_rates', sourceCurrency: 'MYR', targetCurrency: 'USDC', sourceAmount: claim.amount,
      targetAmount, ...rate, createdAtMs: now,
      expiresAtMs: Math.min(now + FX_QUOTE_LIFETIME_MS, rate.rateTimestampMs + FX_MAX_RATE_AGE_MS),
      valuation: 'USDC_USD_PARITY', rounding: 'HALF_UP_6DP',
    };
    if (!isFxQuote(quote)) throw new ServerError('fx_unavailable', 503, 'The FX source is too old to issue a quote.');
    return quote;
  };
}
