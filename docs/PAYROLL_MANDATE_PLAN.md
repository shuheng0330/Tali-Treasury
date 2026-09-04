# Payroll mandate — implementation plan

Adds two capabilities to the existing system without changing anything that already
works:

1. **Enforced statutory payroll.** Paying a worker is a single transaction that also pays
   EPF, SOCSO and EIS *at no less than the statutory rate*. If any statutory payment is
   missing or short, the contract aborts and nothing moves.
2. **Per-second salary accrual.** Pay accumulates continuously and a worker can withdraw
   what they have already earned. The contract enforces that they can never draw more than
   accrued, and that the money to cover the stream is reserved up front.

Target: both paths working on testnet by **Thursday 4 September**.

## Out of scope

Do not build these. If a task seems to require one, stop and raise it instead.

- PCB / monthly tax deduction (depends on reliefs and marital status — a form, not a formula)
- MYR to USDC conversion; the existing "no conversion" disclaimer stands
- The seven unbuilt claim endpoints; those screens stay on sample data
- Wallet connect, zkLogin, Walrus
- Any edit to `contracts/tali_treasury/sources/tali_treasury.move`
- Any change to the existing claim flow, its endpoints or its screens

---

## Architecture decisions

These five are settled. Do not redesign them mid-build.

**A. New Move module, added by package upgrade.** The published package has an upgrade
capability at `0x2af41057a6688b9cc151579ff46b10aecc90f8eb2718d9ad1446e98636f8dbec`. The
payroll code goes in a new `tali_treasury::payroll` module. The existing `treasury` module
is not edited, so the deployed mandate, the AgentCap and every passing test keep working.

**B. Move enforces a floor; TypeScript computes the exact ringgit.** The contract does not
encode Malaysian tax law. It enforces that each statutory body receives **at least** its
minimum share of gross, expressed in basis points and fixed at mandate creation. The exact
amounts come from a deterministic, unit-tested calculator in the backend.

This split is what makes the guarantee real. Checking only that a statutory address
*appears* in the payment would let an employer satisfy it with one cent. The floor is what
closes that.

**C. EPF is a band table, not a percentage.** For wages up to RM20,000 the EPF Act Third
Schedule groups wages into RM20 bands below RM5,000 and RM100 bands above, with fixed
ringgit amounts rounded up to the next ringgit. Only above RM20,000 is it a flat 11% / 12%.
Computing `gross * 0.11` is wrong and will be recognised as wrong.

Because a band ceiling is always ≥ the actual wage and the result rounds up, the computed
contribution is always ≥ the plain percentage of gross. The on-chain basis-point floor
therefore never rejects a correctly computed run.

**D. One payment per statutory body, not per leg.** On chain, EPF receives a single amount
covering both the employee and employer share. For a local worker under 60 that is 11% + 13%
below RM5,000 and 11% + 12% above it. Same for SOCSO (225 bps) and EIS (40 bps). The employee/employer breakdown is a UI
concern, not a chain concern. This keeps a run to four recipients instead of seven.

**A mandate covers exactly one worker class, because the floors are fixed at creation.**
A local worker under 60 contributes 2300 or 2400 bps to EPF depending on the wage; a worker
aged 60 or over contributes 400 bps, and a foreign worker 400 bps. Those cannot share a mandate — the older worker's
correct payment would abort against the younger worker's floor.

The demo mandate covers **local workers under 60** and its floors are set for that class.
Other classes need their own mandate with their own basis points. This is a genuine
property of the design, not a limitation to hide: the floor is only meaningful because it
is specific. Say so on the screen rather than letting someone discover it by aborting.

**SOCSO and EIS floors are measured against a capped wage.** Both stop growing at RM6,000
of wages, so a floor expressed as a share of gross drops below the statutory rate for
higher earners and refuses correct payroll. The mandate therefore stores a wage ceiling
per body, and the contract measures each floor against `min(gross, ceiling)`. EPF has no
ceiling below RM20,000, so its entry is zero.

**The EPF floor is 2300 bps, not 2400.** The employer rate steps down from 13% to 12% above
RM5,000, so a single mandate spanning that boundary must use the lower figure or it rejects
every legitimate payroll above RM5,000 on code 24. 2300 bps still refuses a one-cent
payment by a factor of two thousand, which is the bypass the floor exists to close.

**E. New mandate objects with expiries past the pitch.** The current claim mandate expires
**5 September 22:30 MYT**, before we present. No public function can extend an expiry, so
both mandates are created fresh on Wednesday with a 30 September expiry.

---

## Shared contracts

Everything downstream compiles against these. They are defined **first**, before any
implementation work starts, so nobody is blocked and nobody invents a local copy.

Per `docs/OWNERSHIP.md` rule 1, a `packages/shared` change needs a group-chat message
before it is pushed.

### `packages/shared/src/payroll.ts` (new file)

```ts
import type { Address, Amount, ObjectId } from './claims.js';

export type StatutoryBody = 'epf' | 'socso' | 'eis';

/** What the calculator returns. Pure arithmetic, no addresses. */
export interface StatutorySplit {
  gross: Amount;
  /** Gross minus the employee-side deductions. */
  net: Amount;
  /** Gross plus the employer-side contributions — what the treasury actually pays out. */
  employerCost: Amount;
  /** Per body, the combined employee and employer amount that body receives. */
  bodies: Array<{
    body: StatutoryBody;
    employee: Amount;
    employer: Amount;
    total: Amount;
  }>;
}

/** A split with recipients attached, ready to submit. */
export interface PayrollBreakdown extends StatutorySplit {
  employee: Address;
  recipients: Record<StatutoryBody, Address>;
}

export interface PayrollRunView {
  id: string;
  employee: Address;
  breakdown: PayrollBreakdown;
  status: 'pending' | 'paid' | 'failed';
  digest: string | null;
  abortCode: number | null;
  createdAtMs: number;
}

export interface SalaryStreamView {
  id: ObjectId;
  mandateId: ObjectId;
  employee: Address;
  /** Total payable across the whole stream period. */
  totalAmount: Amount;
  startedAtMs: number;
  endsAtMs: number;
  withdrawn: Amount;
  /** Earned as of the read. */
  accrued: Amount;
  /** accrued minus withdrawn. */
  available: Amount;
}
```

Export it from `packages/shared/src/index.ts`.

`Amount` is a base-unit decimal string, six decimals — see `packages/shared/src/claims.ts`.
Never use `number` for any of these.

### Abort codes

Reserved range for payroll: **20–29**. Do not reuse 0–11; those belong to `treasury`.

| Code | Constant | Fires when |
|---|---|---|
| 20 | `E_WRONG_PAYROLL_CAP` | Capability does not match this mandate |
| 21 | `E_PAYROLL_REVOKED` | Employer revoked the mandate |
| 22 | `E_LENGTH_MISMATCH` | `statutory_amounts` length ≠ registered body count |
| 23 | `E_PAYROLL_ZERO_AMOUNT` | Net pay is zero |
| 24 | `E_STATUTORY_SHORT` | A statutory body is paid below its basis-point floor |
| 25 | `E_ABOVE_RUN_LIMIT` | Run total exceeds `max_per_run` |
| 26 | `E_PAYROLL_INSUFFICIENT` | Unreserved balance is below what this call needs |
| 27 | `E_PAYROLL_EXPIRED` | Past `expiry_ms` |
| 28 | `E_NOTHING_ACCRUED` | Withdrawal when available is zero |
| 29 | `E_WRONG_STREAM_MANDATE` | Stream does not belong to the passed mandate |
| 30 | `E_INVALID_STREAM_PERIOD` | `ends_at_ms` is not after `started_at_ms` |

---

# Shu Heng — contract and chain integration

Paths: `contracts/**`, `packages/sui-integration/**`, plus `packages/shared/src/payroll.ts`.

Do not touch `packages/web/**`.

## S1. Create `packages/shared/src/payroll.ts`

Exactly as specified above. Export from `index.ts`. Message the group chat, then push
first — S2 onward and both other people depend on it.

**Done when:** `npm run build` is green at the repo root and the types import cleanly from
`@tali/shared`.

## S2. New module `contracts/tali_treasury/sources/payroll.move`

New file. Do not edit `tali_treasury.move`.

```move
module tali_treasury::payroll;

public struct PayrollMandate<phantom T> has key {
    id: UID,
    budget: Balance<T>,
    employer: address,
    /// Statutory bodies, in a fixed order agreed at creation.
    statutory_recipients: vector<address>,
    /// Parallel to statutory_recipients. Minimum share of the basis, in basis points.
    statutory_min_bps: vector<u64>,
    /// Parallel too. Wage ceiling the floor is measured against; 0 means no ceiling.
    statutory_wage_cap: vector<u64>,
    /// Minimum share of gross the worker must actually receive, in basis points.
    net_min_bps: u64,
    max_per_run: u64,
    /// Sum of the unwithdrawn remainder of every open stream. Not spendable by a run.
    committed: u64,
    expiry_ms: u64,
    revoked: bool,
    total_paid: u64,
    run_count: u64,
}

public struct PayrollCap has key, store { id: UID, mandate_id: ID }

public struct SalaryStream<phantom T> has key {
    id: UID,
    mandate_id: ID,
    employee: address,
    /// Total payable across the whole period. Accrual is derived, not stored.
    total_amount: u64,
    started_at_ms: u64,
    ends_at_ms: u64,
    withdrawn: u64,
}
```

`create_payroll_mandate` must `transfer::share_object(mandate)` and return the `PayrollCap`,
mirroring how `create_mandate` shares its mandate in `tali_treasury.move`. Streams are also
shared objects, so anyone can trigger a withdrawal.

### Entry functions

```move
public fun create_payroll_mandate<T>(
    coin: Coin<T>,
    statutory_recipients: vector<address>,
    statutory_min_bps: vector<u64>,
    statutory_wage_cap: vector<u64>,
    net_min_bps: u64,
    max_per_run: u64,
    expiry_ms: u64,
    ctx: &mut TxContext,
): PayrollCap

public fun run_payroll<T>(
    cap: &PayrollCap,
    mandate: &mut PayrollMandate<T>,
    employee: address,
    gross: u64,
    net: u64,
    statutory_amounts: vector<u64>,   // parallel to mandate.statutory_recipients
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun open_stream<T>(
    cap: &PayrollCap,
    mandate: &mut PayrollMandate<T>,   // mutable: reserves budget
    employee: address,
    total_amount: u64,
    started_at_ms: u64,
    ends_at_ms: u64,
    ctx: &mut TxContext,
)

public fun withdraw_earned<T>(
    stream: &mut SalaryStream<T>,
    mandate: &mut PayrollMandate<T>,
    clock: &Clock,
    ctx: &mut TxContext,
)

public fun revoke_payroll<T>(cap: &PayrollCap, mandate: &mut PayrollMandate<T>)
```

Passing `gross` explicitly is what lets the contract check the floors. It is a declared
figure, not a derived one — the contract's job is to enforce a relationship between gross
and the payments, not to discover gross.

### `run_payroll` assert order

Exactly this order. The tests and the UI both depend on which code comes back first.

1. `cap.mandate_id == mandate.id` → 20
2. `!mandate.revoked` → 21
3. `statutory_amounts.length() == mandate.statutory_recipients.length()` → 22
4. `net > 0` → 23
5. `net * 10000 >= gross * mandate.net_min_bps` → 24
6. for each `i`, with `basis = if cap == 0 { gross } else { min(gross, cap) }`:
   `statutory_amounts[i] * 10000 >= basis * mandate.statutory_min_bps[i]` → 24
7. `total <= mandate.max_per_run` → 25
8. `balance::value(&mandate.budget) - mandate.committed >= total` → 26
9. `clock.timestamp_ms() < mandate.expiry_ms` → 27

where `total = net + sum(statutory_amounts)`.

Accumulate `total` and evaluate every floor comparison in **`u128`**, casting back to `u64`
only after the checks pass. `gross * bps` overflows `u64` for large wages.

Then split and transfer the net to `employee` and each `statutory_amounts[i]` to
`statutory_recipients[i]`, increment `total_paid` and `run_count`, emit `PayrollRun`. Move
reverts the whole transaction on abort, so atomicity needs no extra work.

Step 8 subtracts `committed` so a payroll run can never spend money already promised to an
open stream.

### `open_stream` behaviour

- Abort 30 if `ends_at_ms <= started_at_ms`
- Abort 23 if `total_amount == 0`
- Abort 26 if `balance::value(&mandate.budget) - mandate.committed < total_amount`
- Add `total_amount` to `mandate.committed`, then share the stream

Reserving up front is what makes the promise real. Without it, two streams can be opened
against the same funds and whoever withdraws second is simply told the money is gone.

### `withdraw_earned` behaviour

```
elapsed   = min(clock.timestamp_ms(), ends_at_ms) - started_at_ms   // clamp at 0
accrued   = (total_amount as u128 * elapsed as u128)
            / ((ends_at_ms - started_at_ms) as u128)
available = accrued as u64 - withdrawn
```

**Compute accrual from `total_amount` and the period, not from a stored per-millisecond
rate.** A `u64` rate in base units per millisecond truncates catastrophically: a RM3,000
monthly salary works out to 1.157 base units per millisecond, which truncates to 1 and
silently loses RM408 over the month. Deriving from the total avoids this entirely. The
`u128` cast is required — `total_amount * elapsed` overflows `u64` above roughly RM70,000.

- Abort 29 if `stream.mandate_id != mandate.id`
- Abort 28 if `available == 0`
- Add to `withdrawn`, subtract `available` from `mandate.committed`, transfer to
  **`stream.employee`**, emit `WagesWithdrawn`

**`withdraw_earned` must pay `stream.employee`, never `ctx.sender`.** Anyone may trigger a
withdrawal; the money always lands with the worker. Do not add a caller check — the fact
that it does not need one is the point.

No budget assert is needed here: `open_stream` already reserved the funds, so the balance is
guaranteed to cover any accrual. Reducing `committed` as you pay keeps the reservation
accurate.

**Done when:** `sui move build` succeeds and every test in S3 passes.

## S3. `contracts/tali_treasury/tests/payroll_tests.move`

Use `sui::clock::create_for_testing` and `sui::clock::set_for_testing` to drive time.

One test per abort, named for the code:

`test_run_payroll_wrong_cap_aborts_20`, `..._revoked_aborts_21`,
`..._length_mismatch_aborts_22`, `..._zero_net_aborts_23`,
`..._short_statutory_aborts_24`, `..._above_run_limit_aborts_25`,
`..._insufficient_budget_aborts_26`, `..._expired_aborts_27`,
`test_withdraw_nothing_accrued_aborts_28`, `test_withdraw_wrong_mandate_aborts_29`,
`test_open_stream_invalid_period_aborts_30`

Plus these, which are the ones that actually prove the design:

- `test_run_payroll_pays_every_body` — four recipients, all balances change, `run_count` is 1
- `test_run_payroll_is_atomic` — a short EPF amount leaves **every** balance unchanged
- `test_epf_one_cent_aborts_24` — EPF paid 1 base unit passes a presence check but must
  still abort on the floor. **This is the test that proves the headline claim.**
- `test_net_below_floor_aborts_24` — statutory correct but the worker underpaid
- `test_run_cannot_spend_stream_reservation` — with a stream open, a run that would dip into
  the reserved amount aborts 26 even though the raw balance looks sufficient
- `test_withdraw_half_way` — at half the period, available is half the total, exactly
- `test_withdraw_full_period_pays_total` — after `ends_at_ms`, total withdrawn equals
  `total_amount` with no rounding loss
- `test_withdraw_after_end` — accrual stops at `ends_at_ms` and does not keep growing
- `test_withdraw_twice_no_double_pay` — two withdrawals total the accrued amount
- `test_withdraw_pays_employee_not_caller` — a third party triggers it, the employee is paid
- `test_withdraw_before_start_returns_zero` — a clock before `started_at_ms` aborts 28
  rather than underflowing

## S4. `packages/sui-integration/src/payroll.ts`

```ts
export function buildCreatePayrollMandateTransaction(input: CreatePayrollMandateInput): Transaction
export function buildRunPayrollTransaction(input: RunPayrollInput): Transaction
export function buildOpenStreamTransaction(input: OpenStreamInput): Transaction
export function buildWithdrawEarnedTransaction(input: WithdrawEarnedInput): Transaction
export function readPayrollMandate(client, config, mandateId): Promise<PayrollMandateState>
export function readSalaryStream(client, config, streamId): Promise<SalaryStreamState>
export function toSalaryStreamView(state: SalaryStreamState, nowMs: number): SalaryStreamView
```

`readSalaryStream` returns `bigint` fields, matching `MandateState`. `toSalaryStreamView` is
the JSON-safe projection and takes `nowMs` so accrual is computed at a caller-chosen instant
— this mirrors the existing `MandateState` / `MandateView` split in rule 3 of
`docs/OWNERSHIP.md`.

`toSalaryStreamView` must use the **same integer arithmetic as the Move function**. If the
contract computes `total * elapsed / duration` in `u128`, this computes it in `BigInt`. A
floating-point version here will disagree with the chain by a few base units and make the
withdraw button offer an amount the contract refuses.

Add codes 20–30 to `TREASURY_ABORT_CODE` and `ERROR_DEFINITIONS` in
`packages/sui-integration/src/errors.ts`, with plain-language messages in the same voice as
the existing ones. Code 24's message must name which body was short. Export everything new
from `packages/sui-integration/src/index.ts`.

**Done when:** `readSalaryStream` returns live values from testnet, and `toSalaryStreamView`
and the contract agree on `available` to the base unit for a stream mid-period.

## S5. Deploy and seed

1. **Confirm the testnet USDC balance first.** The agreed demo ceiling is RM50
   equivalent, converted with the current configured MYR/USD rate and USDC valued at
   USD parity. Do not interpret the RM30 source wage as 30 USDC. The converted budget
   must cover the valid payroll plus the distinct stream allocation.
2. Upgrade the package using the existing UpgradeCap. If the upgrade fails for any reason,
   **publish `payroll` as a separate package instead of debugging under time pressure** —
   record the new package ID and move on.
3. Create the payroll mandate: expiry **30 September 2026**, with both budget and
   `max_per_run` set from the approved RM50-equivalent USDC quote,
   `statutory_recipients` = three testnet addresses standing in for EPF, SOCSO and EIS,
   `statutory_min_bps` = `[2300, 225, 40]`,
   `statutory_wage_cap` = `[0, 6_000_000000, 6_000_000000]`, `net_min_bps` = `7000`.
4. Open one salary stream for the demo employee over a short period — an hour, not a month —
   so accrual is visible to the eye during a demo.
5. Keep the reimbursement mandate separate. Re-create it only if the selected hosted
   claim demo actually expires before it is needed; never fold it into payroll setup.
6. Record every payroll object id in `packages/sui-integration/src/demo.ts` under a new
   `taliPayrollDemo` export. Do not overwrite historical reimbursement evidence.
7. Add `PAYROLL_PACKAGE_ID`, `PAYROLL_MANDATE_ID`, `PAYROLL_CAP_ID` and `DEMO_STREAM_ID` to `.env.example` with
   empty values, and post the real values in the group chat — not in the repo.

**Done when:** every id in `demo.ts` resolves on testnet, no mandate expires before
30 September, and both the agent and treasurer addresses hold SUI for gas.

---

# Wey Cheng — statutory engine and payroll API

Paths: `packages/web/src/server/payroll/**`, `packages/web/src/app/api/payroll/**`.

Do not touch `packages/web/src/server/streams/**` or `packages/web/src/app/api/streams/**`
— those are someone else's this sprint. Do not touch `packages/web/src/components/**`.

## W1. `packages/web/src/server/payroll/statutory.ts`

The credibility of the whole feature is in this file.

```ts
export interface StatutoryInput {
  /** Monthly gross wage in base units, six decimals. */
  gross: Amount;
  age: number;
  citizenship: 'local' | 'foreign';
}

export function computeStatutory(input: StatutoryInput): StatutorySplit;
```

Returns `StatutorySplit`, which has **no addresses in it**. This function is pure arithmetic
and must not know that recipients exist; W3 attaches them.

Rules to implement:

**EPF.** Wages ≤ RM20,000 use the Third Schedule bands: RM20 wide below RM5,000, RM100 wide
from RM5,000 to RM20,000. For each band the contribution is the rate applied to the band
ceiling, rounded **up** to the next whole ringgit. Rates: employee 11%; employer 13% when
wages ≤ RM5,000, otherwise 12%. Above RM20,000, apply 11% and 12% to actual wages. Age 60
and over: employer 4%, employee 0%. Foreign workers: 2% each.

**SOCSO.** Employee 0.5%, employer 1.75%, on wages capped at RM6,000.

**EIS.** Employee 0.2%, employer 0.2%, on wages capped at RM6,000. Age 60 and over is exempt.

**Money handling.** `bigint` only. No `number`, no floats anywhere in this file. Round-up is
integer arithmetic on base units.

**Returns.** `bodies` always in the order `epf`, `socso`, `eis` — this order must match
`statutory_recipients` on the mandate exactly, because the contract pairs them by index.
Include a body even when its amount is zero, so the array length stays constant; the
contract requires a full-length vector.

`net = gross - sum(employee shares)`. `employerCost = gross + sum(employer shares)`.

## W2. `packages/web/src/server/payroll/statutory.test.ts`

Required cases:

- Band boundaries: RM 2,999.99 / 3,000.00 / 3,000.01 land in the correct bands
- The RM5,000 employer-rate change: 13% at 5,000.00, 12% at 5,000.01
- The RM6,000 SOCSO and EIS caps: a RM10,000 wage contributes the same as RM6,000
- Above RM20,000 switches to exact percentages
- Age 60: employer 4%, employee 0%, EIS zero, `bodies` still length 3
- Foreign worker: 2% each
- Rounding: a band producing `X.01` rounds up to `X + 1`
- `net + sum(employee shares) === gross` for twenty wages across the range
- Every returned amount is a non-negative `bigint`
- **Floor conformance, for local workers under 60 only:** with
  `socsoBasis = eisBasis = min(gross, RM6,000)` and `epfBasis = gross`, assert
  `epf.total * 10000 >= epfBasis * 2300`, `socso.total * 10000 >= socsoBasis * 225`,
  `eis.total * 10000 >= eisBasis * 40`, and `net * 10000 >= gross * 7000`. These are the
  exact comparisons the contract makes; if a computed split fails one here, `run_payroll`
  will abort on 24 in production.

  **Measure SOCSO and EIS against the capped basis, not against gross.** Their
  contributions stop growing at RM6,000 of wages, so a floor taken on gross falls below
  the rate for anyone earning more — an RM6,800 salary contributes 199 bps of gross to
  SOCSO against a 225 bps floor and would be refused despite being correct.

  **Do not apply this assertion to the age-60 or foreign-worker cases.** They contribute
  400 bps to EPF, not 2300, and would fail a floor that was never meant for them — see
  decision D. Those classes belong to a different mandate with different basis points, and
  the demo mandate does not accept them. Test their arithmetic, not their floor conformance.

**Verify at least five EPF rows against the published KWSP Third Schedule and cite them in
comments.** A derived table that has never been checked against the real one is the single
most likely way this feature embarrasses us.

> If a legitimate wage fails the floor conformance test, do not adjust the calculator to
> pass. Raise it — the basis points on the mandate are wrong and Shu Heng needs to
> re-create the mandate. The calculator is the source of truth for the law.

## W3. `packages/web/src/server/payroll/service.ts`

```ts
export function createPayrollService(deps: {
  runs: PayrollRunRepository;
  chain: PayrollChainPort;
  recipients: StatutoryRecipientConfig;
}): {
  preview(input: StatutoryInput & { employee: Address }): PayrollBreakdown;
  run(input: StatutoryInput & { employee: Address }): Promise<PayrollRunView>;
};
```

`preview` calls `computeStatutory`, attaches the configured recipient addresses and the
employee address, and returns. It signs nothing and writes nothing.

`run` must:

1. Compute the breakdown
2. Persist a `pending` row **before** submitting anything
3. Build the transaction only through `@tali/treasury-sui`, passing `gross`, `net` and the
   three body totals in the order `epf`, `socso`, `eis`
4. On success, store digest and mark `paid`
5. On a Move abort, store the abort code and mark `failed` — **this is an expected outcome,
   not an exception to swallow.** Abort 24 in particular must reach the caller as a typed
   result carrying the code, never as a 500
6. Never retry automatically; a duplicate payroll run is worse than a failed one

Ports go in `packages/web/src/server/payroll/ports.ts`, following the shape already used in
`packages/web/src/server/claims/ports.ts`.

`StatutoryRecipientConfig` reads three addresses from environment variables
`PAYROLL_EPF_ADDRESS`, `PAYROLL_SOCSO_ADDRESS`, `PAYROLL_EIS_ADDRESS`. Add them to
`.env.example` with empty values.

## W4. Endpoints

`packages/web/src/app/api/payroll/preview/route.ts` — `POST`, body
`{ employee, gross, age, citizenship }`, returns `PayrollBreakdown`. Validate with a `zod`
`.strict()` schema in `packages/web/src/server/payroll/validation.ts`. No signing, no writes.

`packages/web/src/app/api/payroll/runs/route.ts` — `POST`, same body, returns
`PayrollRunView`. `GET` returns the last twenty runs.

Both guarded by `requireDemoIdentityEnabled()`, matching the existing routes. Errors go
through `toApiError` so the shape matches the rest of the API.

**Done when:** posting a RM 3,000 gross returns three bodies whose employee shares plus
`net` equal `gross`, and a deliberately shorted EPF amount returns abort code 24 in the
response body rather than a 500.

## W5. Persistence

`packages/web/src/server/supabase/payroll-repository.ts` implementing `PayrollRunRepository`.
Two tables in `supabase/`: `payroll_runs` and `payroll_legs`. Amounts stored as text, never
as float. Follow the column conventions already in `claim-repository.ts`.

---

# Kian Xiang — salary streams and interface

Paths: `packages/web/src/server/streams/**`, `packages/web/src/app/api/streams/**`,
`packages/web/src/app/(app)/**`, `packages/web/src/components/**`, plus
`packages/web/src/lib/demo-config.ts`.

Do not touch `packages/web/src/server/payroll/**` or `packages/web/src/app/api/payroll/**`.

## K1. `packages/web/src/server/streams/service.ts`

The whole salary-stream vertical is yours, server through screen.

```ts
export function createStreamService(deps: {
  chain: StreamChainPort;
  now: () => number;
}): {
  read(streamId: ObjectId): Promise<SalaryStreamView>;
  withdraw(streamId: ObjectId): Promise<
    | { ok: true; digest: string; amount: Amount }
    | { ok: false; abortCode: number; message: string }
  >;
};
```

`read` calls `readSalaryStream` from `@tali/treasury-sui` and projects with
`toSalaryStreamView(state, deps.now())`. Compute accrual **at read time** — never store a
snapshot, it is stale within a second.

`withdraw` builds through `buildWithdrawEarnedTransaction` and submits via the existing
agent path. Abort 28 is a normal outcome and returns `{ ok: false }`, not a thrown error.

Ports in `packages/web/src/server/streams/ports.ts`, same shape as
`packages/web/src/server/claims/ports.ts`.

## K2. `packages/web/src/server/streams/service.test.ts`

- `read` with a fake clock returns `available === accrued - withdrawn`
- accrual stops at `endsAtMs` and does not grow past it
- a clock before `startedAtMs` returns zero available, never a negative
- at exactly `endsAtMs`, accrued equals `totalAmount` — no rounding shortfall
- `withdraw` surfacing abort 28 returns `{ ok: false, abortCode: 28 }`
- `read` never returns a `number` for a money field
- **agreement check:** for a mid-period stream, `available` matches a `BigInt`
  recomputation of `total * elapsed / duration`. If the UI offers an amount the contract
  will not honour, the withdraw button fails in front of an audience.

## K3. Endpoints

`packages/web/src/app/api/streams/[id]/route.ts` — `GET`, returns `SalaryStreamView`.

`packages/web/src/app/api/streams/[id]/withdraw/route.ts` — `POST`, no body, returns the
withdraw result. A `{ ok: false }` result is HTTP 200 with the abort code in the body — it
is a contract decision, not a server failure.

Both guarded by `requireDemoIdentityEnabled()` and using `toApiError`, matching the existing
routes exactly.

## K4. `/earnings` — the accrual screen

`packages/web/src/app/(app)/earnings/page.tsx` plus components under
`packages/web/src/components/earnings/`.

- Server component reads the stream once so the first paint is real, not a spinner
- A client component ticks the displayed figure **locally** from `totalAmount`,
  `startedAtMs` and `endsAtMs`, and re-reads the chain every 15 seconds to correct drift
- Local ticking must use the same integer formula as the chain, then format for display.
  Do not tick by adding a floating-point delta each frame; the error compounds visibly
- The ticking figure uses the `tnum` class already in the design system, so digits do not
  jump width
- Stop ticking at `endsAtMs`; show the period as complete rather than freezing silently
- A withdraw button showing the available amount, disabled with a plain reason when zero
- Offer slightly less than the last read if needed, never more — an offer the contract
  refuses is worse than one that is a few base units conservative
- After a withdrawal, show the digest with a Suiscan link and reset the counter from a fresh
  chain read, not from arithmetic
- Respect `prefers-reduced-motion`: update once a second rather than per frame

Follow `docs/DESIGN.md`. No gradients, no shadows, tabular figures on every number, status
never signalled by colour alone.

## K5. `/payroll` — the employer screen

`packages/web/src/app/(app)/payroll/page.tsx` plus `packages/web/src/components/payroll/`.

- A staff list with gross wage per person, from sample data until W4 exists. Every person
  on it is a local worker under 60 — the demo mandate accepts no other class, per decision
  D. State that on the screen; do not offer an age or citizenship control that would build
  a request the mandate is guaranteed to reject
- Calls `POST /api/payroll/preview` and renders each body with its employee and employer
  share and the combined total that is actually sent on chain
- Shows gross, net and total employer cost as three distinct figures — the gap between
  gross and employer cost is the point of the screen
- A run button calling `POST /api/payroll/runs`, with the digest on success
- On abort, render the message from `treasuryErrorFromCode`, never a raw code

Build against mocks until Wey Cheng's endpoints land — rule 4 of `docs/OWNERSHIP.md`.

## K6. `/payroll/proof` — the enforcement screen

`packages/web/src/app/(app)/payroll/proof/page.tsx`.

Shows one payroll run with every body listed and a control beside the EPF row that sets its
amount to **one base unit** rather than removing it. That is the honest version of the
demonstration: the payment still contains an EPF line, and the contract still refuses it,
because the floor is on the amount and not on the presence of an address.

With the control on, the run aborts on code 24 and the screen shows the real transaction.
With it off, the same button pays everyone in one digest.

Both outcomes must be **real transactions against testnet**. Do not simulate either one.
Show the digest for the successful path and the abort for the failed one, each with a
Suiscan link.

Copy rules: never call the abort an error or a failure. It is the contract refusing. Wording
in the same voice as `packages/web/src/lib/checks.ts`.

## K7. Navigation, config and states

- Add `/payroll` and `/earnings` to the existing navigation in `packages/web/src/components/`
- Extend `packages/web/src/lib/demo-config.ts` with the payroll mandate and stream ids from
  `taliPayrollDemo`
- Every new screen needs a working back path, an empty state, a loading state and a failure
  state
- Mobile layout at 320px must not scroll horizontally

---

## Order of work

The only hard dependency is the shared types.

```
S1  shared types  ──┬─→  S2 → S3 → S4 → S5  (chain)
                    ├─→  W1 → W2 → W3 → W4 → W5  (statutory + payroll API)
                    └─→  K1 → K2 → K3 → K4 → K7  (streams + UI)

K5, K6 need W4 and S5 live. Build them against mocks first.
```

Everything after S1 runs in parallel. Nobody waits.

### Two agreements that cross paths

**The body order `epf, socso, eis` is load-bearing.** The contract pairs
`statutory_amounts[i]` with `statutory_recipients[i]` by index. W1 emits that order, S5
creates the mandate in that order, S4 sends it in that order. If any one of the three
diverges, money goes to the wrong body and every assert still passes. Fix the order in S1's
type and do not vary it.

**The basis points and wage caps on the mandate must match the calculator.** S5 sets
`statutory_min_bps = [2300, 225, 40]`, `statutory_wage_cap = [0, 6_000_000000, 6_000_000000]`
and `net_min_bps = 7000`; W2 asserts every computed split clears exactly those numbers
against the same basis. If either side changes, both change together, and the mandate has to be
re-created because the values are fixed at creation.

## Checkpoint — Tuesday evening

If `run_payroll` is not compiling with its tests green by end of Tuesday, **drop the
statutory payroll feature and ship only the salary stream.** Streaming has no tax tables, no
basis-point floors and no multi-recipient vector; it is much the smaller build and still
demonstrates enforced limits on chain.

Deciding this on Tuesday costs nothing. Discovering it on Friday costs everything.

## Risks

| Risk | Handling |
|---|---|
| Claim mandate expires 5 Sep 22:30 | Re-created in S5 on Wednesday. Not optional. |
| Not enough testnet USDC | Checked as the first step of S5, before any deployment work. |
| Package upgrade fails | Publish as a separate package; do not debug under deadline. |
| EPF table wrong | W2 requires five rows checked against the published Third Schedule. |
| UI and chain disagree on accrual | Both use the same integer formula; K2 asserts agreement. |
| Agent has no gas | Fund the agent and treasurer addresses on Wednesday, not Thursday. |
| Scope creep into the claim flow | Nothing in this plan edits it. If a task seems to need to, stop and raise it. |
