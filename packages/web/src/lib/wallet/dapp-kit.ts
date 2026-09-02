import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const TESTNET_GRPC_URL = 'https://fullnode.testnet.sui.io:443';

export const dAppKit = createDAppKit({
  networks: ['testnet'],
  defaultNetwork: 'testnet',
  autoConnect: true,
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  storageKey: 'tali_treasury_wallet',
  createClient: (network) =>
    new SuiGrpcClient({ network, baseUrl: TESTNET_GRPC_URL }),
});

declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
