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
