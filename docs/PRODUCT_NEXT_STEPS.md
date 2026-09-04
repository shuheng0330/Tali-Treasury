# Product next steps — 4 September 2026

Current evidence and subsystem status: [PROGRESS.md](PROGRESS.md).
The local browser journey has paid RM6 as 1.484561 Testnet USDC. Hosted rollout
still needs separate verification. No completion percentage is inferred from this.

## Delivered: clearer claim outcomes

- One Paid tab with Auto-paid or Paid after review chips, using the saved review
  action and policy decision. Legacy rows with no provenance simply say Paid.
- Rejected tab includes only the `rejected` state, with reviewer reason or failed
  policy checks. `payment_failed` remains distinct and visible under All.
- Needs correction shows the reviewer's recorded reason in Treasury and My Claims.
  Correction requests remain under All in Treasury and in the member's claim list.
- Merchant, original amount, status, and reason come before supplementary data.
  Policy checks and exchange-rate metadata are expandable; exact quoted USDC
  remains visible before approval. Quote acceptance and on-chain safeguards remain.

## Delivered: member correction and resubmission

Owner: frontend + backend.

1. ✅ An Edit action is offered to the signed-in owner of a claim awaiting
   correction, with the reviewer's reason beside the fields to fix. My Claims
   surfaces it as **Fix and resubmit**, routed through
   `POST /api/claims/:id/resubmit`.
2. Define whether a replacement receipt is needed. Preserve the original evidence
   and audit trail; never silently rewrite a paid or rejected claim.
3. Validate replacement drafts, ownership, duplicate rules and allowed transitions
   server-side. Invalidate old quotes/decisions and re-evaluate the corrected claim.
4. Demonstrate request correction → reason visible in My Claims → edit → resubmit
   → review, including an unauthorized-edit failure.
5. Rehearse mobile and projector layouts. Keep the status, reason, and next action
   visible at a glance; keep advanced details available on demand.

Reason visibility, the first layout simplification, and member editing and
resubmission are complete. Items 2 to 5 above describe the guarantees that
flow already relies on; what remains is the rehearsal pass on projector and
phone, not the feature.

## Primary: authenticated Set Up Payroll

Owner: frontend + backend, with Sui integration support.

1. ✅ Add employer-only `/payroll/setup`. The authenticated employer supplies the
   employee and expiry; the server supplies the agreed RM30/RM50 demo amounts,
   current FX quote, agent cap owner and configured statutory recipients.
2. ✅ Preview exact Testnet USDC funding and immutable rules, then use the existing
   `buildCreatePayrollMandateTransaction` through the connected employer wallet.
3. ✅ Verify finality, sender, package, coin type, mandate fields and `PayrollCap`
   ownership in a protected endpoint without trusting browser object IDs.
4. ✅ Make registration idempotent by transaction and mandate. Recover a successful
   chain creation whose database registration failed without funding twice.
5. Route payroll, proof, history and earnings from the registered payroll. Remove
   `sampleStaff` from the live journey.
6. Require the employer for setup/run/revoke and the registered employee for stream
   withdrawal. A connected wallet is not automatically an employer.
7. Verify one successful payroll, one atomic refusal and one employee withdrawal.

This is the primary launch flow. It creates a `PayrollMandate` and must not create
or modify the reimbursement `Mandate`.

## Separate follow-up: Create Expense Treasury

Owner: frontend + backend, with Sui integration support.

1. Label this action **Create Expense Treasury**, not Set Up Payroll. Add a form for
   name, organisation, categories, event dates,
   USDC budget, per-claim cap, approved recipients, and configured backend agent.
   Establish who is permitted to create events; a wallet session alone does not
   grant organisation-level treasurer permissions.
2. Preview Testnet network, funding amount, gas and immutable rules. Use the
   existing `buildCreateMandateTransaction` wrapper and ask the connected treasurer
   wallet to sign. Retain the AdminCap in that wallet; issue the AgentCap to the
   configured backend signer. No private-key input in the browser.
3. Add a protected backend event-registration endpoint. Independently verify the
   successful transaction, sender, package/coin type, new mandate fields and cap
   owners against the request before inserting the event and members in Supabase.
4. Make registration idempotent by transaction/mandate, and recover when funding
   succeeds but database registration fails. Retrying registration must not fund
   another mandate. Handle cancelled wallet prompts without creating an event.
5. Replace fixed demo selection with event selection/routing. Bind every claim,
   dashboard read and backend capability to the same selected event. The current
   single global AgentCap setting needs an event-aware mapping before multiple
   funded events can pay reliably.
6. Verify unauthorized creation, forged transaction IDs, mismatched recipients,
   retry after registration failure, and a wallet-created event's reimbursement.

This feature is planned, not implemented by the claim-history change. Event records
hold metadata and roles; the Sui reimbursement mandate holds USDC. It remains
separate so payroll employees, statutory recipients, `PayrollCap` and salary rules
cannot be confused with claim recipients, `AgentCap` or per-claim policy.

## Demo release priorities

1. Lock and fund the single-employee payroll configuration.
2. Publish/configure payroll and record the real objects.
3. Apply the registration migration to hosted Supabase, wire payroll pages to the
   registered configuration and close all payroll write permissions.
4. Record successful payroll, atomic refusal and employee withdrawal evidence.
5. Keep the proven claim journey available; defer correction editing and dynamic
   expense-treasury creation if they threaten the payroll proof.
6. Finish the submission video, deck, disclosures and rehearsal.
