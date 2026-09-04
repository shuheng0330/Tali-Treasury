# Local payment and reconciliation evidence

Executed 3 September 2026, 08:44:53 UTC (16:44:53 Singapore), on `test_main`.
One explicitly authorized payment of **1 Circle Testnet USDC** was submitted.
This is a local-backend / real-Sui-Testnet test, not a hosted deployment test.

## Result: payment and recovery passed

| Check | Observed result |
| --- | --- |
| Synthetic claim | `614aec35-620f-49b8-9ab4-1cf1a20d6eed` |
| Event | `ba7e50e2-7e7b-4a67-a505-9e3a329739ae` (Orientation Week) |
| Mandate | `0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f` |
| Transaction | `98fYYN5KiuraMmFdT9Vimv3f4NwFxhSgt4qxzR1WGEjL` |
| Confirmed checkpoint | `379263715` |
| Recipient | `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e` (`tali-member`) |
| Agent | `0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471` |
| Mandate remaining budget | 17 USDC → **16 USDC** |
| Recipient USDC balance | 3 USDC → **4 USDC** |
| Total mandate spent | **4 USDC**, confirmed by `treasury::PaymentMade` |
| Actual agent SUI debit | 2,369,900 MIST (**0.0023699 Testnet SUI**) |
| Submission calls in harness | **1** |
| First reconciliation | `paying` → `paid`, using saved transaction digest |
| Second reconciliation | Same `paid` status and digest; all measured balances unchanged |

## What was exercised

1. Authenticated the original treasurer through the running localhost challenge/session APIs using a personal-message signature. The temporary session was logged out afterward.
2. Inserted one clearly labeled synthetic PNG and native-USDC claim into **local Supabase only**. No actual purchase, MYR conversion, or AI extraction is represented by this fixture.
3. Called the authenticated claim-processing HTTP API. All hard rules passed; deliberately low extraction confidence put the fixture into `awaiting_review`.
4. Invoked the real review service and repository as the authenticated treasurer. The real payment executor used the configured agent and deployed mandate, with a harness gas budget ceiling of 0.01 Testnet SUI.
5. Persisted the payment digest before broadcasting. After successful on-chain execution, the harness deliberately threw instead of performing the final `finishPayment` database write. The local claim remained `paying` with its durable digest.
6. Called the real authenticated reconciliation HTTP API twice. The first call recovered the confirmed payment; the second verified idempotent behavior. Reconciliation did not sign or submit another transaction.
7. Independently read the transaction effects, `PaymentMade` event, and balance changes from Sui Testnet.

The interruption was injected **only in the standalone harness**. No application behavior was changed to simulate failure. Approval was exercised at the service boundary, not through the review button or HTTP review route.

## Preserved data and limits

- The original 17.25 MYR SPEEDMART claim `d032b3a5-da5a-4abd-ab0c-4a6bf341cffa` is still `rejected`, with no payment digest. It was not converted, overridden, or paid.
- The event treasurer remains `0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9`. No new on-chain allowlist permission was granted to the Slush wallet.
- Local test receipt/claim/payment records were retained as evidence. The real Testnet payment cannot be undone by deleting local records.
- No hosted Supabase or Vercel mutation, merge, commit, or push was performed in this test.
- This does not prove hosted end-to-end operation, browser review-button payment execution, automatic scheduled recovery, MYR conversion, or payroll deployment.

## Follow-up found: gas reporting discrepancy

The backend recorded `gasUsed = 2417400` MIST, but the actual agent balance change was `-2369900` MIST. The difference is the 47,500 MIST `nonRefundableStorageFee` that `netGasUsed()` currently adds separately in `packages/web/src/server/sui/transaction.ts`.

Raw effects: computation 1,000,000; storage 6,072,400; rebate 4,702,500; non-refundable fee 47,500 MIST. Computation + storage − rebate equals the observed 2,369,900 MIST debit. Review this reporting formula and its tests before presenting exact gas metrics; payment amount and reconciliation results passed independently. No application formula was changed during this smoke test.

## Local harness

`tools/local-payment-smoke.mjs` is a machine-specific, local-only test utility, intentionally left uncommitted and unavailable in a fresh clone. It reads credentials in memory and never prints keys, signatures, or session tokens. Its fixed claim ID refuses a new submission when that claim already exists; do not delete the fixture to run another payment accidentally.

The installed CLI could not sign the personal-message payload (it tried to parse transaction data). The harness therefore uses the SDK's explicit personal-message signer with the existing local keystore; the treasurer key never signs a transaction.

For a subsequent read/reconciliation check only, from the repository root:

```powershell
node tools/local-payment-smoke.mjs --reconcile-only
```

Requires the same localhost app, local database, and configured Testnet environment. No new payment is authorized by this report. Do not reuse the payment execution mode for another fixture without fresh authorization.
