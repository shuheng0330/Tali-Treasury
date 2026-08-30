# `@tali/treasury-sui`

Shared TypeScript integration for the Tali Treasury Move package. It provides:

- unsigned transaction builders for `create_mandate`, `spend`, `revoke`, and `withdraw_remaining`;
- a testnet gRPC client and strongly typed mandate reader;
- human-readable mappings for Move abort codes `0` through `11`;
- local input validation before a wallet is asked to sign.

The package never reads or stores private keys. The calling frontend wallet or
backend agent is responsible for signing.

The integrated `/treasury` page uses this package server-side for a real,
read-only Testnet mandate query. Claim processing and state-changing UI actions
remain explicitly simulated until the backend signer is connected.

## Install and verify

From the repository root:

```powershell
npm install
npm test
npm run typecheck
npm run build
```

## Read a mandate

```ts
import {
  createTestnetClient,
  readMandate,
  taliTestnetSuiConfig,
} from '@tali/treasury-sui';

const client = createTestnetClient();
const mandate = await readMandate(client, taliTestnetSuiConfig, mandateId);
console.log(mandate.remainingBudget);
```

For the product flow, use `taliTestnetUsdcConfig`. `taliTestnetSuiConfig` is
retained only for the original SUI smoke-test mandate.

The public IDs for the current funded demo are exported as `taliUsdcDemo`, so
the frontend and backend do not need to duplicate mandate and capability IDs.

## Build an agent payment

```ts
import {
  buildSpendTransaction,
  parseUsdc,
  parseTreasuryError,
  taliTestnetUsdcConfig,
} from '@tali/treasury-sui';

const transaction = buildSpendTransaction(taliTestnetUsdcConfig, {
  agentCapId,
  mandateId,
  recipient,
  amount: parseUsdc('5'),
});

try {
  // Backend: keypair.signAndExecuteTransaction({ transaction, client })
  // Frontend: dAppKit.signAndExecuteTransaction({ transaction })
} catch (cause) {
  const error = parseTreasuryError(cause);
  console.error(error.key, error.message);
}
```

Amounts are always atomic coin units (`bigint`), never floating-point values.
Circle's Sui Testnet USDC has 6 decimals, so `parseUsdc('5')` produces
`5_000_000n`. This prevents financial rounding errors from JavaScript numbers.
