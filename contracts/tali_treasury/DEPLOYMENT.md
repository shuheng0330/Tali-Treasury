# Tali Treasury Sui Testnet Deployment

This is the authoritative record for deployed objects and on-chain transaction
evidence. Operational faucet and recreation steps belong in `USDC_SETUP.md`.

## Current deployment

- Network: Sui testnet
- Package ID: `0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523`
- Module: `treasury`
- Move call prefix: `0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523::treasury`
- UpgradeCap ID: `0x2af41057a6688b9cc151579ff46b10aecc90f8eb2718d9ad1446e98636f8dbec`
- Publisher: `0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9`
- Publish transaction: `Byjr61PJAtFyRej98GKacjSKJryzfWFvVceW1Z1Krepe`
- Package version: `1`
- Sui toolchain: `1.78.1`
- Net publish cost: `0.02117496 SUI` in testnet tokens

## Verify from the CLI

```powershell
sui client object 0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523
sui client object 0x2af41057a6688b9cc151579ff46b10aecc90f8eb2718d9ad1446e98636f8dbec
sui client tx-block Byjr61PJAtFyRej98GKacjSKJryzfWFvVceW1Z1Krepe
```

## Integration notes

Publishing creates the immutable package and an owned `UpgradeCap`. It does not create a Tali mandate. A treasurer creates each mandate later by calling `create_mandate<T>` with a funding coin, an agent address, a per-claim limit, an expiry, and an allowlist.

The `UpgradeCap` authorizes future package upgrades. Keep it controlled by the deployment wallet and never share the wallet's private key or recovery phrase.

## First live SUI mandate

This smoke-test mandate uses testnet SUI to verify the on-chain workflow before integrating official testnet USDC.

- Creation transaction: `5u1zaYoGtu5etYhryiKxoA1LhBzutY1dNfqXefBQfPDU`
- Mandate ID: `0x471cc5a25025c63e3fb58c03c631383a5362882db618a410bc7a666a1bfe7e83`
- AdminCap ID: `0x982c7f1f7621cba0f3df439acb719b8abd08d067cb37fc429c408dfa27642a6d`
- AgentCap ID: `0xf71e8d722f13fecfa0fb41dde1b6af34f5177657fef60c30d422deeb2256ea8c`
- Treasurer: `0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9`
- Agent: `0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471`
- Approved member: `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e`
- Initial budget: `500000000 MIST` (`0.50 SUI`)
- Maximum per claim: `100000000 MIST` (`0.10 SUI`)
- Expiry: `2026-09-05 17:46:22 SGT` (`1788601582744` milliseconds)
- Agent gas-funding transaction: `DMXrGF6ebshbVeWHPhFWBuEj156oSRofif8URvonnrt5`

The mandate is a shared object. The treasurer owns its matching `AdminCap`, and the agent owns its matching `AgentCap`. The member starts with no balance and will receive a coin only after a successful `spend` transaction.

## First live reimbursement

- Payment transaction: `7VrBh8jwTgffxhARM72T5BmbgLzDuC8EEYJTgNQHzkt8`
- Payment amount: `50000000 MIST` (`0.05 SUI`)
- Recipient coin ID: `0x7689b69ca3802dd352185859678665721de7782cefdaf2a0dfd05136f7d2195c`
- Mandate balance after payment: `450000000 MIST` (`0.45 SUI`)
- Mandate amount spent: `50000000 MIST` (`0.05 SUI`)
- Agent gas charged: `2035348 MIST` (`0.002035348 SUI`)
- Audit event: `PaymentMade`, sequence `0`

This transaction proves that the agent can use its capability to reimburse an approved member while the shared mandate enforces its amount limit, remaining budget, expiry, revocation state, and allowlist.

## Live safety tests

Two deliberately invalid reimbursements were submitted to Testnet from the
agent wallet. Both were rejected by `treasury::spend` as designed:

| Scenario | Transaction | Result |
| --- | --- | --- |
| Request `0.15 SUI` when the maximum is `0.10 SUI` | `JD1cvKrj3ieWF8mhWbVJh7pgZpzM1z1VADor53ZsuT4g` | Failed with abort code `5` (`E_AMOUNT_ABOVE_LIMIT`) |
| Request `0.05 SUI` for a non-approved recipient | `6xU1WoPA53AcckWYi6t8k133TWSsz8obkZK45yZRmiWk` | Failed with abort code `7` (`E_RECIPIENT_NOT_APPROVED`) |

Post-test verification:

- Mandate remaining budget: `450000000 MIST` (`0.45 SUI`), unchanged.
- Mandate amount spent: `50000000 MIST` (`0.05 SUI`), unchanged.
- Approved member balance: `50000000 MIST` (`0.05 SUI`), unchanged.
- Total agent gas for both failed transactions: `2094696 MIST` (`0.002094696 SUI`).
- No `PaymentMade` event was emitted by either failed transaction.

This proves the core security model: an agent may propose a payment, but the
Move contract is the final authority. A rejected transaction cannot move
treasury funds. See `ERROR_CODES.md` for the complete application-facing error
mapping.

## Official Testnet USDC mandate

The product demo now uses Circle-issued Sui Testnet USDC in a separate mandate:

- Creation transaction: `7kk5cWL7zCQfTpDs43cMiRDWTuM2ch39ynztAjeGp3vH`
- Coin type: `0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC`
- Mandate ID: `0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f`
- AdminCap ID: `0x0c7b45b5d2bf5ded39da7077068b4dee359625dc5de657bbfc35b2584a114245`
- AgentCap ID: `0x9b2d3f17cfc23e5fb5c2fa561ef9fb551dd11241c376b83b70b183febf31e67a`
- Budget: `20 USDC`
- Maximum per claim: `5 USDC`
- Expiry: `2026-09-05 22:30:28 SGT`
- Approved member: `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e`

See `USDC_SETUP.md` for Circle metadata, funding details, and verification
commands. The TypeScript integration exports these IDs as `taliUsdcDemo`.

### First USDC reimbursement

- Payment transaction: `Aksj8wgVoVRnbkVDyCMQ4qMKa1HfkWqDWF8Xptz5yQXA`
- Amount: `3 USDC`
- Recipient coin ID: `0xbf53ab0a4db161fd68a876ae7b19135cc532280a36cb296b6ff68483f45955ad`
- Remaining mandate budget: `17 USDC`
- Total spent: `3 USDC`
- Audit event: `PaymentMade`, sequence `0`
- Agent gas: `0.0023699 SUI`

### Live USDC Safety Test

| Scenario | Transaction | Result |
| --- | --- | --- |
| `15 USDC` claim against a `5 USDC` maximum | `5fMDNz9dAxJFiamg5Bi5iXnPjnHv2HTUB3hv2wJ2PNpU` | Failed with abort code `5` |
| `3 USDC` claim to a non-approved recipient | `2htVB5NJCxhz1QXQtLGDjJ6kLVAwit6MLqzghzGDnk5e` | Failed with abort code `7` |

After both rejected transactions, the mandate still held `17 USDC`, the member
still held `3 USDC`, and neither transaction emitted `PaymentMade`. Only the
agent's SUI gas balance changed, by `0.002095 SUI` in total.

## 3 September: separate single-wallet demo mandate

The original mandate above is retained. A separate mandate was created for the
local browser demo, using the same package and Circle Testnet USDC type:

| Object / evidence | Identifier |
| --- | --- |
| Creation | `HC81t2fynCeqm2dgnfRVcpqXMA6j1crHbzhXRCwH2fng` |
| Mandate | `0x1cc179098026a7a8f323ee926ee4e81d1805ed4cc512f195a91e6b925ee5cd34` |
| AdminCap (original CLI treasurer) | `0xdbf079d1964dda4b558a2fcf9888430869de8c7a816afd9c9929f00a2100250a` |
| AgentCap (existing backend agent) | `0x9adcf422eee1660adec815b91bff64c6fa0fc28401e36de24143fdd1a77322b1` |
| Approved Slush recipient | `0xc49326adb506e0716c8beaf69885f4e008d34e116d277da49e253a72e82647b7` |
| Browser-approved MYR payment | `J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq` |

Budget 10 USDC; cap 5 USDC; expiry 7 September 2026, 00:00 Singapore time.
The RM6 receipt paid 1.484561 USDC, leaving 8.515439 USDC at checkpoint 379316730.
The original mandate retained 16 USDC after its separate native-USDC recovery test.
Refresh chain state for current balances. Full local event/role details:
[single-wallet demo](../../docs/LOCAL_SINGLE_WALLET_DEMO.md).
