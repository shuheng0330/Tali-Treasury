# Tali Treasury Sui Testnet Deployment

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
