# Next implementation plan — payroll-first

4 September decision: the primary employer journey is **Set Up Payroll**. It creates
and funds a `PayrollMandate`. **Create Expense Treasury** remains a separate journey
using the existing reimbursement `Mandate`. See [current progress](PROGRESS.md),
[payroll launch plan](PAYROLL_LAUNCH_PLAN.md) and
[product acceptance criteria](PRODUCT_NEXT_STEPS.md).

The current safe boundary is: an authenticated member can submit a receipt, the
treasurer can process and review it, eligible USDC approval can start payment, and
an uncertain payment can be reconciled by its stored digest without retrying.
MYR receipts always require explicit approval of a saved quote. Other non-USDC
currencies remain unsupported.

## 1. Lock the payroll demo configuration

- Choose one employee wallet, employer wallet and server signer.
- Support one employee class for the demo; do not imply universal statutory coverage.
- Use the agreed RM30 source wage and RM50-equivalent total ceiling. Convert both
  through one current configured MYR/USD quote; include statutory legs and a
  distinct stream allocation of at most RM10 equivalent.
- Time the stream so visible accrual occurs during rehearsal and presentation.

Acceptance: every teammate uses the same addresses, wage and object plan, and the
budget can cover the complete demonstrated flow more than once.

## 2. Publish and configure payroll on Testnet

- Publish/upgrade the payroll Move module.
- Create and fund `PayrollMandate<USDC>` and deliver `PayrollCap` to the intended
  signer.
- Open the employee stream and record all public identifiers and explorer evidence.
- Include `PAYROLL_PACKAGE_ID`; configuration is incomplete without it.

Acceptance: direct chain reads show the expected employer, employee, policy,
budget, capability ownership and stream state.

## 3. Authenticated Set Up Payroll

- ✅ Build `/payroll/setup` as the primary CTA.
- ✅ Require the configured employer session, fetch the current MYR/USD rate and
  preview the immutable rules and exact Testnet USDC funding before wallet signing.
- ✅ Build the transaction through `@tali/treasury-sui` and let the connected
  employer wallet sign and fund it. Cancellation leaves no application record.
- ✅ Verify finality, sender, package, coin type, all mandate rules and the
  `PayrollCap` owner server-side. Failed verification never rebuilds or resubmits.
- Make registration idempotent and recoverable without creating a second mandate.
- Replace sample employee data across payroll, proof and earnings screens.

Acceptance: an authorized employer can create and reopen the registered payroll;
a cancelled signature creates nothing; a forged digest or unauthorized wallet is
rejected; registration can be retried without another funding transaction.

## 4. Authorization and end-to-end payroll proof

- Employer-only: payroll setup, payroll run and mandate revocation.
- Employee-only: salary-stream withdrawal for that employee.
- Employer-only and bounded: any interactive safety transaction.
- Verify a successful payroll, deficient-contribution refusal and stream withdrawal.

Acceptance: expected balances change exactly once for success, no balance changes
for the refusal, unauthorized writes return 403, and every displayed digest opens
the matching Testnet transaction.

## 5. Preserve the expense treasury as a separate flow

The receipt flow below is already complete locally and remains the secondary demo.
Do not move its `AdminCap`, `AgentCap`, categories, claim cap or recipients into
payroll setup. Later, **Create Expense Treasury** should independently create its
own reimbursement mandate and verified event registration.

### Authenticated identity and analysis binding — complete locally

- Issue a short-lived wallet challenge with a one-time nonce.
- Verify the signed challenge server-side and create an HTTP-only session.
- Replace submitted member and processor addresses with the authenticated address.
- Persist receipt analysis as an expiring draft and consume it once at confirmation.
- Store original extraction and member corrections separately for audit.

Acceptance is covered locally: replayed challenges and consumed drafts fail;
member/treasurer access is checked from the session; invalid cookies cannot fall
back; and atomic claim failure leaves the draft usable. Rollout still requires the
hosted migration, exact HTTPS origin configuration, and manual two-role testing.

### MYR-to-USDC quote — complete locally; hosted verification pending

- Add original amount/currency and payout amount/currency as separate fields.
- Store rate, provider, quoted time, expiry and integer rounding result.
- Show `RM original → USDC payout` before confirmation.
- Requote expired claims and require confirmation when the payout changes.
- Evaluate mandate cap and budget only against the stored USDC payout.

Acceptance: no floating-point money, no implicit 1:1 conversion, deterministic
rounding tests, and an expired or missing quote can never reach auto-pay.

### Treasurer review actions — complete locally

- Implement approve, reject and request-correction endpoints with compare-and-set
  transitions and an audit event for every action.
- Require a reason for rejection and correction.
- Replace the remaining demo buttons and refresh the persisted queue.

Acceptance: invalid transitions return 409, repeated requests are idempotent, and
reviewing one claim cannot update another claim.

### Payment orchestration and reconciliation — complete locally

- Reserve budget before signing concurrent approved claims.
- Move claims through `approved → paying → paid` or `payment_failed`.
- Build transactions only through `@tali/treasury-sui`.
- Keep the agent key server-side, wait for finality and store digest/checkpoint/gas.
- Persist the signed transaction digest before broadcast and reconcile unknown
  finality on demand without another signature or submission.

Local acceptance: attempt persistence is required before submission, uncertain
finality remains `paying`, exact-digest checks settle terminal results once, and
neither a not-found transaction nor an RPC failure can trigger a second payment.
The funded Testnet smoke remains a separately authorized rollout check.

## 6. Demo proof and submission

- Record the payroll run, on-chain refusal and employee withdrawal.
- Retain a short expense-claim demonstration as secondary proof.
- Finish the deck, Devfolio copy, AI-tool disclosure and rehearsal.

Acceptance: every visible digest opens in an explorer, all simulated controls remain
labelled, and the complete demo can be repeated from a fresh browser.
