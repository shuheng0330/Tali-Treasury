import type { RateCache, FxRate } from './rates';
import { fxUnavailable } from './rates';

interface RpcClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

export function createSupabaseRateCache(client: RpcClient): RateCache {
  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.rpc(name, args);
    if (result.error) throw fxUnavailable();
    return result.data;
  }
  return {
    async read() { return await call('read_myr_rate', {}) as FxRate | null; },
    async acquire(token) { return await call('acquire_myr_rate_refresh', { token }) === true; },
    async write(token, rate) {
      if (await call('save_myr_rate', { token, rate }) !== true) throw fxUnavailable();
    },
  };
}
