import { FX_MAX_RATE_AGE_MS } from '@tali/shared';
import { ServerError } from '../errors';

export interface FxRate { myrPerUsd: string; rateTimestampMs: number; fetchedAtMs: number }
export interface RateCache {
  read(): Promise<FxRate | null>;
  acquire(token: string): Promise<boolean>;
  write(token: string, rate: FxRate): Promise<void>;
}
export const fxUnavailable = () => new ServerError('fx_unavailable', 503,
  'Live MYR/USD rates are unavailable or stale. No payment was started. Please retry later.');

export function validRate(rate: FxRate, nowMs: number): boolean {
  return /^\d{1,3}(?:\.\d{1,12})?$/.test(rate.myrPerUsd) && Number(rate.myrPerUsd) >= 1 &&
    Number(rate.myrPerUsd) <= 20 && Number.isSafeInteger(rate.rateTimestampMs) &&
    Number.isSafeInteger(rate.fetchedAtMs) && rate.rateTimestampMs > 0 &&
    rate.rateTimestampMs <= nowMs + 60_000 && rate.fetchedAtMs <= nowMs &&
    nowMs - rate.rateTimestampMs < FX_MAX_RATE_AGE_MS;
}

export function createOpenExchangeRateReader(options: {
  appId: () => string | undefined;
  cache: RateCache;
  fetch?: typeof fetch;
  now?: () => number;
  token?: () => string;
}) {
  return async (): Promise<FxRate> => {
    const now = options.now ?? Date.now;
    try {
      const cached = await options.cache.read();
      if (cached && validRate(cached, now()) && now() - cached.fetchedAtMs < 60 * 60_000) return cached;
      const appId = options.appId()?.trim();
      if (!appId || !/^[a-f0-9]{32}$/i.test(appId)) throw fxUnavailable();
      // Distributed lease: warm/cold Vercel instances share the same quota.
      const token = options.token?.() ?? crypto.randomUUID();
      if (!await options.cache.acquire(token)) throw fxUnavailable();
      const url = new URL('https://openexchangerates.org/api/latest.json');
      url.searchParams.set('app_id', appId);
      url.searchParams.set('symbols', 'MYR'); // USD base works on the free plan.
      const response = await (options.fetch ?? fetch)(url, {
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw fxUnavailable();
      const body = await response.json();
      if (body.base !== 'USD' || typeof body.rates?.MYR !== 'number' ||
          !Number.isFinite(body.rates.MYR) || !Number.isSafeInteger(body.timestamp)) throw fxUnavailable();
      const rate: FxRate = { myrPerUsd: String(body.rates.MYR), rateTimestampMs: body.timestamp * 1000, fetchedAtMs: now() };
      if (!validRate(rate, now())) throw fxUnavailable();
      await options.cache.write(token, rate);
      return rate;
    } catch {
      // Never expose provider errors/URLs: URLs contain the App ID. No demo fallback.
      throw fxUnavailable();
    }
  };
}
