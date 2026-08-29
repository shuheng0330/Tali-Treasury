# Official Sui Testnet USDC setup

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
