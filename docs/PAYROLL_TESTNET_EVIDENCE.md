# Payroll Testnet evidence

Verified 5 September 2026 through the authenticated local application. All
assets are Sui Testnet assets with no financial value.

## Payroll setup

| Item | Verified value |
| --- | --- |
| Package v2 | [`0xeb973d…b97688`](https://suiscan.xyz/testnet/object/0xeb973dbac9e4e5c2ea0c31ffb6b51b4df1f34e05443f970e89a35301e6b97688) |
| Setup transaction | [`85PdAX…8ne73`](https://suiscan.xyz/testnet/tx/85PdAXLeVT82SetGWUK9a98vX3UAEcrarRRtUv8ne73) |
| Payroll mandate | [`0xa04894…f1100`](https://suiscan.xyz/testnet/object/0xa04894a0d3852092d08df2476bb36e47992ec13ad78ba2a6e38cb891f77f1100) |
| PayrollCap | `0x02ac8f2f667d699adfed56e094997755722b0f9e98994bc6b157242ebe80ef06` |
| Employer | `0xc49326adb506e0716c8beaf69885f4e008d34e116d277da49e253a72e82647b7` |
| Approved employee | `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e` |
| Initial budget | `12.363385 USDC` (RM50 equivalent at the setup quote) |
| Maximum per run | `12.363385 USDC` |

The wallet created and funded the mandate. The backend then independently
verified finality, sender, package, coin type, mandate fields, employee and
PayrollCap owner before storing the registration in Supabase.

## Successful RM30 payroll

Transaction [`HpUwPs…Xr27y`](https://suiscan.xyz/testnet/tx/HpUwPspN9QgoXBmLARh8iJDFSxEACSwZNxhzz3zXr27y)
finalized successfully at checkpoint `379811040` and emitted one `PayrollRun`
event with `run_index = 1`.

| Atomic payment leg | Recipient | Amount |
| --- | --- | ---: |
| Employee net | `0x405200…bb16e` | `6.129767 USDC` |
| EPF stand-in | `0x42e094…7f2a89` | `2.719944 USDC` |
| SOCSO stand-in | `0x8d26d8…55a6f0` | `0.166906 USDC` |
| EIS stand-in | `0x51f093…81fc81` | `0.029673 USDC` |
| **Total mandate spend** | | **`9.046290 USDC`** |

After finality, the mandate reported:

- `budget = 3.317095 USDC`;
- `total_paid = 9.046290 USDC`;
- `run_count = 1`;
- `committed = 0`;
- `revoked = false`.

The backend signer paid `0.006352452 SUI` net gas. It did not custody the payroll
USDC: every USDC leg was split directly from the shared mandate in the one Move
transaction.

## Rounding safeguard found during rehearsal

An earlier pre-submission simulation found that independent half-up conversion
left EIS one micro-USDC below the immutable `40` basis-point floor. No payment
was broadcast. The quote now raises only the employer contribution by the exact
rounding difference, and the corrected transaction above is the resulting live
proof.

## Evidence still required

- One deliberate deficient-contribution transaction refused atomically on
  Testnet.
- One salary stream opened from the remaining budget and an accrued withdrawal
  paid to the registered employee.
