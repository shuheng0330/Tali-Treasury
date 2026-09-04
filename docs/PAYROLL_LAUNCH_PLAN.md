# Payroll-first launch plan

Updated 4 September 2026. This is the authoritative short-term launch sequence.
The detailed contract design remains in [PAYROLL_MANDATE_PLAN.md](PAYROLL_MANDATE_PLAN.md).

## Product decision

Tali is payroll-first. The primary employer action is **Set Up Payroll**. It creates
and funds a Sui `PayrollMandate` for salary runs, statutory-allocation enforcement
and salary streams.

Expense reimbursement remains a separate product flow. **Create Expense Treasury**
creates and funds the existing Sui `Mandate` used for receipt claims. The two
mandate types must not share a creation wizard, capability or backend configuration.

| Employer action | On-chain object | Purpose |
|---|---|---|
| Set Up Payroll | `PayrollMandate<USDC>` + `PayrollCap` | Salary, contribution legs and salary streams |
| Create Expense Treasury | `Mandate<USDC>` + `AdminCap` + `AgentCap` | Receipt claims and reimbursements |

## Agreed demo amounts

- Source wage: **RM30**.
- Total payroll-mandate allocation ceiling: **RM50 equivalent**.
- All mandate and payment amounts are converted using the configured live MYR/USD
  provider, with Testnet USDC valued at USD parity. RM30 must never be interpreted
  as 30 USDC.
- The statutory calculation remains in MYR. One server-issued rate converts the
  gross, worker net, each statutory leg and total employer cost into micro-USDC.
- The employer approves the displayed rate and exact USDC amounts before signing.
  If the rate changes, the app requires a refreshed preview.

At the previously recorded example rate of `1 USD = 4.0416 MYR`, RM30 gross is
`7.422803 USDC`, the RM36.585 calculated employer cost is approximately
`9.052110 USDC` after enforcing the on-chain rounding floors, and the RM50 budget
is `12.371338 USDC`.
These are examples only;
creation must use the current validated quote. Reserve at most RM10 equivalent of
the RM50 allocation for the stream demonstration, leaving the valid payroll and
stream together below the agreed ceiling. Treat that stream as a separate demo
allocation, not a second payment of the same salary obligation.

## Minimum demo journey

1. An authenticated employer opens **Set Up Payroll**.
2. The employer enters the employee wallet and expiry. The server supplies the
   agreed RM30 wage, RM50-equivalent ceiling, current FX quote, backend cap owner
   and configured Testnet statutory-recipient addresses.
3. The app previews the Testnet transaction and immutable rules. The connected
   employer wallet signs and funds the `PayrollMandate`; no private key enters the
   browser.
4. The backend verifies the transaction, sender, package, coin type, mandate fields
   and `PayrollCap` owner before registering the payroll configuration.
5. The employer previews and executes one payroll run. The UI shows the employee
   net payment and all statutory allocation legs with a real explorer link.
6. The enforcement screen submits an intentionally insufficient contribution and
   shows the real on-chain refusal without changing any recipient balance.
7. The employee opens Earnings and withdraws accrued Testnet USDC from a salary
   stream. The caller must match the registered employee.

The existing receipt-claim demonstration remains available as a secondary story.
It is not a prerequisite for creating or running payroll.

## Implementation order

Approximate effort assumes the existing payroll contract and integration tests stay
green. It is planning guidance, not a completion claim.

| Workstream | Lead | Estimate |
|---|---|---:|
| Testnet publication, mandate, stream and evidence | Shu Heng | 6–10 hours |
| Authenticated registration and write authorization | Lim Wey Cheng | 4–8 hours |
| Setup and real-data UI wiring | Ku Kian Xiang | 3–6 hours |
| Integrated verification, fixes and hosted smoke | Team | 6–10 hours |
| Documentation, recording and rehearsal | Team | 3–5 hours |

These workstreams overlap, but the UI and final smoke depend on one verified chain
configuration. Dynamic roster work adds roughly 4–8 hours and is outside the core
demo.

### Gate 1 — agree and fund

- Choose one demo employee wallet and one supported employee class.
- Use the agreed RM30 wage and RM50-equivalent ceiling. Ensure the mandate budget
  covers the payroll, the separate stream allocation, rehearsals and transaction fees.
- Fund the employer and server signer with Testnet SUI. Fund the employer with
  sufficient Testnet USDC.

### Gate 2 — publish and verify the chain configuration

- ✅ Upgrade the payroll module and record package v2, the transaction and UpgradeCap.
- ✅ Create a `PayrollMandate` with the approved employee and Testnet stand-in
  recipients. Deliver its `PayrollCap` to the intended server signer.
- Open a salary stream whose accrual window overlaps rehearsal and presentation.
- Record public object IDs and successful/refused transaction evidence. Setup,
  successful-run and abort-24 refusal evidence are complete; stream evidence remains.
  Never commit a private key or recovery phrase.

### Gate 3 — implement authenticated Set Up Payroll

- ✅ Add an employer-only `/payroll/setup` screen and make it the primary CTA.
- ✅ Preview the current MYR/USD conversion and exact USDC funding, then use the
  existing Sui transaction builder for connected-wallet execution.
- ✅ Verify the finalized transaction, sender, created mandate fields and
  `PayrollCap` owner server-side instead of trusting browser-submitted object fields.
- ✅ Add idempotent durable registration for that verified result, with unique
  transaction, mandate and capability identifiers.
- ✅ Recover safely if the chain transaction succeeds but database registration
  fails. A registration retry must never fund a second mandate.
- **Implemented locally:** the endpoint accepts only the digest, verifies sender,
  package, USDC type, object lineage, supported terms and signer-owned cap, then
  appends one service-role-only snapshot. New/replay responses are `201`/`200`.
- Bind payroll pages, proof and earnings to the registered payroll rather than
  `sampleStaff` or a single global demo constant.

### Gate 4 — close write permissions

- Payroll setup and payroll runs require the registered employer wallet.
- Revoke requires the employer or the authority chosen by the contract design.
- Stream withdrawal requires the stream employee.
- Safety actions require employer authorization and a server-defined bounded test;
  they must not accept arbitrary real payment parameters from the public.
- Keep `TALI_ALLOW_INSECURE_DEMO_IDENTITY=false` in hosted environments.

### Gate 5 — prove and freeze

- ✅ Verify one successful payroll and one contribution refusal. One employee
  stream withdrawal from a fresh browser remains.
- Check database records, Sui balances and explorer links after finality.
- Record a backup demo video and update deployment evidence.
- Freeze nonessential features. Dynamic roster changes, OT, PCB/income tax, batch
  payroll and multi-class sharding remain later work.

## Acceptance gate

Environment-variable presence is not completion. Payroll is demo-ready only when:

- an authenticated employer can create and fund a verified payroll mandate;
- another wallet cannot set up, run or revoke that payroll;
- the UI uses the same registered employee, mandate, capability and wage;
- a valid payroll changes the expected Testnet balances exactly once;
- a deficient statutory allocation fails atomically;
- the registered employee can withdraw accrued salary, while another wallet cannot;
- every displayed transaction link is real and every simulation is labelled.

## Explicitly deferred

- Employer-managed additions to an immutable on-chain employee allowlist.
- OT and attendance verification.
- PCB/income-tax calculation and statutory production remittance.
- Multi-employee batch execution and multi-class concurrency claims.
- Combining payroll and expense-treasury creation.
