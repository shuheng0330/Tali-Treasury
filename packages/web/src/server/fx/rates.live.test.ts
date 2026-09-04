import { expect, it } from 'vitest';
import { createOpenExchangeRateReader, validRate } from './rates';
import { createSupabaseRateCache } from './cache';

// Explicit opt-in: one real provider/cache read, never any claim or payment.
it.skipIf(process.env.TALI_RUN_LIVE_FX_CHECK !== 'true')('reads a live MYR rate through the local shared cache', async () => {
  // Next intentionally skips .env.local under NODE_ENV=test. Opt-in smoke
  // checks load it explicitly; ordinary unit tests never read credentials.
  const { loadEnvFile } = await import('node:process');
  loadEnvFile('.env.local');
  expect(new URL(process.env.SUPABASE_URL!).origin).toBe('http://127.0.0.1:54321');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const read = createOpenExchangeRateReader({ appId: () => process.env.OPEN_EXCHANGE_RATES_APP_ID, cache: createSupabaseRateCache(client) });
  const rate = await read();
  expect(validRate(rate, Date.now())).toBe(true);
  expect(await read()).toEqual(rate);
  console.info('Verified live FX reference (no claim/payment created):', JSON.stringify(rate));
}, 20_000);
