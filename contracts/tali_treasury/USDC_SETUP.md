# Official Sui Testnet USDC setup

This runbook explains how to obtain Testnet USDC and recreate a funded mandate.
For the authoritative current object IDs and transaction evidence, see
`DEPLOYMENT.md`.

Tali uses Circle-issued Testnet USDC for its stablecoin demo. Testnet tokens
have no financial value.

- Coin type: `0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC`
- Symbol: `USDC`
- Decimals: `6`
- Treasurer wallet: `0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9`
- Circle faucet: <https://faucet.circle.com/>
- Circle Sui quickstart: <https://developers.circle.com/stablecoins/quickstart-setup-transfer-usdc-sui>

## Funding steps

1. Open the Circle faucet.
2. Select `Sui` and `Testnet` if the faucet asks for network details.
3. Enter the treasurer wallet address above.
4. Request USDC and complete any verification requested by Circle.
5. Wait for the faucet transaction to finalize.
6. Verify the wallet from PowerShell:

```powershell
sui client balance 0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9 `
  --coin-type "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC" `
  --with-coins
```

Do not create the USDC mandate until this command shows a non-zero balance.
The treasurer must also retain SUI separately to pay network gas.

## Current funded demo mandate

Funding and mandate creation are complete.

- Creation transaction: `7kk5cWL7zCQfTpDs43cMiRDWTuM2ch39ynztAjeGp3vH`
- Mandate ID: `0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f`
- AdminCap ID: `0x0c7b45b5d2bf5ded39da7077068b4dee359625dc5de657bbfc35b2584a114245`
- AgentCap ID: `0x9b2d3f17cfc23e5fb5c2fa561ef9fb551dd11241c376b83b70b183febf31e67a`
- Initial and remaining budget: `20000000` atomic units (`20 USDC`)
- Maximum per claim: `5000000` atomic units (`5 USDC`)
- Amount spent: `0 USDC`
- Approved member: `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e`
- Expiry: `2026-09-05 22:30:28 SGT` (`1788618628595` milliseconds)
- Creation gas: `5020704 MIST` (`0.005020704 SUI`)

The faucet coin object was consumed by `create_mandate`; this is expected. Its
20 USDC balance now lives inside the shared mandate rather than directly in the
treasurer wallet.

## First live USDC reimbursement

- Payment transaction: `Aksj8wgVoVRnbkVDyCMQ4qMKa1HfkWqDWF8Xptz5yQXA`
- Payment amount: `3000000` atomic units (`3 USDC`)
- Recipient coin ID: `0xbf53ab0a4db161fd68a876ae7b19135cc532280a36cb296b6ff68483f45955ad`
- Mandate remaining budget: `17000000` atomic units (`17 USDC`)
- Mandate amount spent: `3000000` atomic units (`3 USDC`)
- Member wallet balance: `3 USDC`
- Agent gas charged: `2369900 MIST` (`0.0023699 SUI`)
- Audit event: `PaymentMade`, sequence `0`

This is the first complete stablecoin reimbursement proof: the authorized agent
requested a policy-compliant payment, the Move contract released Circle
Testnet USDC, the approved member received it, and the on-chain audit state was
updated atomically.

## Live USDC Safety Test

Two invalid reimbursements were deliberately submitted from the authorized
agent wallet:

| Scenario | Transaction | On-chain result |
| --- | --- | --- |
| Request `15 USDC` when the maximum is `5 USDC` | `5fMDNz9dAxJFiamg5Bi5iXnPjnHv2HTUB3hv2wJ2PNpU` | Failed with code `5` (`E_AMOUNT_ABOVE_LIMIT`) |
| Request `3 USDC` for a non-approved recipient | `2htVB5NJCxhz1QXQtLGDjJ6kLVAwit6MLqzghzGDnk5e` | Failed with code `7` (`E_RECIPIENT_NOT_APPROVED`) |

Post-test verification:

- Mandate remaining budget: `17 USDC`, unchanged.
- Mandate amount spent: `3 USDC`, unchanged.
- Approved member balance: `3 USDC`, unchanged.
- Payment events emitted: none.
- Total agent gas for both failed transactions: `2095000 MIST` (`0.002095 SUI`).

This is the judge-facing security proof: even the correctly authorized agent
cannot bypass the immutable amount limit or recipient allowlist.
