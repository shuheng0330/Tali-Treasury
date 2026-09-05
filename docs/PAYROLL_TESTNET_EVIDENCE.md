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

## Atomic deficient-EPF refusal

Transaction [`Hqw44T…gFT8V`](https://suiscan.xyz/testnet/tx/Hqw44T6qTsQKW5ooPGM8BQmN6uNgaXk6TYNvw9tgFT8V)
was deliberately submitted with EPF below the mandate floor. Sui executed
`payroll::run_payroll` and refused it with Move abort code `24` at checkpoint
`379815374`.

The failed transaction changed no USDC balance and emitted no payroll payment.
Only `0.001062852 SUI` was charged to the backend signer for gas. After the
refusal, the mandate still reported:

- `budget = 3.317095 USDC`;
- `total_paid = 9.046290 USDC`;
- `run_count = 1`;
- `committed = 0`;
- `revoked = false`.

The local Supabase run record stores the same digest and `abort_code = 24`, so
the product can link its refusal explanation to independently verifiable chain
evidence.

## Salary stream opened

Transaction [`2tLwnY…Qq1Tq`](https://suiscan.xyz/testnet/tx/2tLwnYYVZkdn3QVAvYhSwixJkyAKb9cDJH12Z2RQq1Tq)
opened salary stream
[`0x64aa6d…6eef8`](https://suiscan.xyz/testnet/object/0x64aa6def14dc646831b3fa3b820c042a7dd8cbcb65c110b8e56e58ca6b26eef8)
at checkpoint `379993839`.

| Stream field | Verified value |
| --- | --- |
| Payroll mandate | `0xa04894a0d3852092d08df2476bb36e47992ec13ad78ba2a6e38cb891f77f1100` |
| Employee | `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e` |
| Reserved amount | `1.000000 USDC` |
| Period start | `2026-09-05T07:01:50.330Z` |
| Period end | `2026-09-05T07:11:50.330Z` |
| Net opening gas | `0.003527304 SUI` |

The post-opening mandate state is `3.317095 USDC` budget,
`1.000000 USDC` committed and `2.317095 USDC` spendable. The local application
reads the registered stream and displays its live per-second accrual to either
authorized payroll party. Withdrawal remains restricted to the immutable
employee wallet.

## Accrued employee withdrawal

The registered employee withdrew the full stream in transaction
[`DHcoXy…vmrX6H`](https://suiscan.xyz/testnet/tx/DHcoXyjw9PP11EQPefAfffZoHWWX3Nz3ZWACvxvmrX6H)
at checkpoint `380020001`.

| Withdrawal field | Verified value |
| --- | --- |
| Employee | `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e` |
| Amount | `1.000000 USDC` |
| Stream withdrawn total | `1.000000 USDC` |
| Mandate committed after withdrawal | `0 USDC` |
| Mandate spendable after withdrawal | `2.317095 USDC` |

This completes the live payroll salary-stream workflow: employer setup and
funding, atomic payroll, accrual, and employee withdrawal.
