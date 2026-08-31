import { toMandateView } from '@tali/shared';
import {
  createTestnetClient,
  readMandate,
  taliTestnetUsdcConfig,
  type TreasuryConfig,
} from '@tali/treasury-sui';

import type { MandateReader } from '../claims/ports';

type MandateClient = Pick<ReturnType<typeof createTestnetClient>, 'getObject'>;

export function createSuiMandateReader(options?: {
  client?: MandateClient;
  config?: TreasuryConfig;
  now?: () => number;
}): MandateReader {
  const client =
    options?.client ?? createTestnetClient(process.env.SUI_GRPC_URL);
  const config = options?.config ?? taliTestnetUsdcConfig;
  const now = options?.now ?? Date.now;

  return {
    async read(mandateId) {
      const state = await readMandate(client, config, mandateId);
      return toMandateView(state, now());
    },
  };
}
