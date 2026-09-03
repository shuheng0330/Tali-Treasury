# MYR reimbursement quotes

Implemented locally on `test_main`, 3 September 2026. **Hosted rollout and a
real MYR-quoted payment are not verified yet.** No new payment was sent while
implementing this feature.

## Meaning of the quote

- Original receipt amount and currency stay unchanged. This repository stores
  both MYR and USDC amounts in six-decimal fixed-point units, not MYR sen.
- Open Exchange Rates supplies **MYR per USD** using its free-plan USD base.
- Payout = original MYR amount / MYR-per-USD rate, rounded half up to the nearest
  0.000001 USDC using integer arithmetic. Zero and out-of-range payouts fail.
- The explicit valuation policy is **1 USDC = 1 USD**. This is not a live USDC
  market price, an executable currency exchange, or a guarantee against depegging.
  The treasury pays from existing Circle Testnet USDC, which has no monetary value.
- Rates are hourly reference data, not second-by-second trading quotes.

Live credential/cache verification returned `1 USD = 4.0457 MYR`, published
`2026-09-03T08:59:58Z`, fetched `2026-09-03T09:27:32.024Z`. As a worked example,
17.25 MYR at that reference rate gives **4.263786 USDC**. This example was not
paid and is not a current offer; the UI uses the currently valid saved quote.

Provider references: [latest endpoint](https://docs.openexchangerates.org/reference/latest-json),
[plan limits](https://openexchangerates.org/signup), and
[usage guidance](https://openexchangerates.org/faq). Free usage eligibility must
be checked before a commercial rollout; no uptime or executable-price guarantee
is implied by this integration.

## Local setup and UI test

1. Put `OPEN_EXCHANGE_RATES_APP_ID` in `packages/web/.env.local`. Never paste the
   value in chat, commit it, or add a `NEXT_PUBLIC_` prefix.
2. Start local Supabase, then apply the additive migration without resetting data:

   ```powershell
   npm exec supabase -- migration up --local
   ```

3. Restart the web development server after environment changes: `npm run dev`.
4. Submit a new MYR receipt through `/claim` as an active event member.
5. Sign in as the configured event treasurer on `/treasury`; choose
   **Get live quote & evaluate**. This fetches/reuses the reference rate, saves a
   bound quote, and evaluates policy. It does **not** pay a MYR claim automatically.
6. Inspect both amounts, source timestamp, expiry, parity assumption and policy
   checks. Invalid on-chain rules still reject the claim. For a payable test,
   use the approved member wallet, valid date/category and an amount below the cap.
7. **Approve and pay** starts a real Testnet transaction. Only click this when
   intentionally authorizing that displayed payout and gas cost. The approval
   request includes the exact quote ID from the dialog snapshot.

The prior rejected SPEEDMART receipt stays rejected; this feature does not
overwrite terminal decisions or bypass the approved-recipient rule.

## Expiry, concurrency and recovery

- Source data may be at most 90 minutes old. Future timestamps beyond 60 seconds,
  missing/non-positive/malformed rates, and rates outside a broad 1–20 MYR/USD
  circuit breaker fail closed. The range is a safety bound, not a forecast.
- Quote acceptance deadline is 15 minutes, capped by the source-data age limit.
  After expiry, **Refresh expired quote & evaluate** saves a new quote and requires
  a fresh human decision. A still-valid quote is reused, not repriced silently.
- All MYR quotes require human approval even if every receipt check passes.
- Quote ID comparisons make a concurrent refresh and approval mutually exclusive.
  The database checks expiry when entering `paying`, then freezes the quote and
  source amount. Accepted payment attempts keep their original amount thereafter.
- Every issued quote is retained in backend-only append-only history, including
  superseded quotes. Browser roles cannot write quotes, access cache RPCs or edit history.
- Reconciliation reads the saved digest/quote and never fetches a replacement
  quote, signs, or submits again. Quote expiry does not prevent recovery of an
  already approved payment.
- Provider errors and stale rates block progress without a mock fallback. Error
  responses never include the App ID, provider request URL or raw provider body.

## Shared free-plan cache

`myr_rate_cache` in Supabase is shared across server instances. A database lease
allows one refresh request; successful refreshes are throttled to once per hour.
Failed refreshes have a five-minute cooldown. Normal continuous use is about
744 upstream requests per 31-day month **per database**, not per user or claim.
Retries and separate local/preview/production databases consume additional quota.
Do not assume one App ID shared across all environments will remain below 1,000
requests. Monitor usage, keep inactive environments idle, and upgrade if needed.

## Rollout and checks

- Apply `20260903010000_myr_fx_quotes.sql` to the intended hosted project only
  after teammate review, before deploying code that selects `claims.fx_quote`.
- Set the server-only App ID in the intended Vercel environment and redeploy.
- Announce the shared `Claim.fxQuote` / approval `quoteId` API changes to the
  team before pushing, as required by `docs/OWNERSHIP.md`.
- Re-run tests and check the browser quote/approval flow on that deployment.
- The gas-fee reporting discrepancy documented in the payment smoke report is
  separate and remains unfixed by this feature.

```powershell
npm test
npm run typecheck
npm run build
npm run supabase:test
```

Optional credential check (local database only, no claim/payment creation):

```powershell
$env:TALI_RUN_LIVE_FX_CHECK='true'
npm exec -w @tali/web -- vitest run src/server/fx/rates.live.test.ts
Remove-Item Env:TALI_RUN_LIVE_FX_CHECK
```

Normal tests skip that explicit live check and use synthetic provider fixtures.

## Code entry points

- `packages/shared/src/fx.ts`: quote contract, integer conversion and validation.
- `packages/web/src/server/fx`: provider adapter, shared cache and quote issuance.
- `packages/web/src/server/claims/services.ts`: process, approval and reconciliation.
- `packages/web/src/server/supabase/claim-repository.ts`: quote persistence and compare-and-set writes.
- `packages/web/src/components/claim/FxQuoteSummary.tsx`: original/quoted amounts and disclosures.
