# `@tali/treasury-sui`

Shared TypeScript integration for the Tali Treasury Move package. It provides:

- unsigned transaction builders for `create_mandate`, `spend`, `revoke`, and `withdraw_remaining`;
- a testnet gRPC client and strongly typed mandate reader;
- human-readable mappings for Move abort codes `0` through `11`;
- local input validation before a wallet is asked to sign.

The package never reads or stores private keys. The calling frontend wallet or
backend agent is responsible for signing.

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

## Build an agent payment

```ts
import {
  buildSpendTransaction,
  parseTreasuryError,
  taliTestnetSuiConfig,
} from '@tali/treasury-sui';

const transaction = buildSpendTransaction(taliTestnetSuiConfig, {
  agentCapId,
  mandateId,
  recipient,
  amount: 5_000_000n,
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
For SUI, `1_000_000_000n` MIST equals 1 SUI. For USDC, use the decimals from
the official coin metadata when converting display values.
