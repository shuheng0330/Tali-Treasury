# Product next steps — 3 September 2026

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

## Next: member correction and resubmission

Owner: frontend + backend.

1. Provide an Edit claim action only to the signed-in owner of a claim awaiting
   correction; show the reviewer's reason beside the fields to fix.
2. Define whether a replacement receipt is needed. Preserve the original evidence
   and audit trail; never silently rewrite a paid or rejected claim.
3. Validate replacement drafts, ownership, duplicate rules and allowed transitions
   server-side. Invalidate old quotes/decisions and re-evaluate the corrected claim.
4. Demonstrate request correction → reason visible in My Claims → edit → resubmit
   → review, including an unauthorized-edit failure.
5. Rehearse mobile and projector layouts. Keep the status, reason, and next action
   visible at a glance; keep advanced details available on demand.

Reason visibility and the first layout simplification are complete. Editing and
resubmission are pending; the current UI directs the member to their treasurer.

## Next: authenticated Create event inside the product

Owner: frontend + backend, with Sui integration support.

1. Add a treasurer entry point and form: name, organisation, categories, event dates,
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
hold metadata and roles; the Sui mandate holds USDC. Creating an event should be
possible from the app without visiting an explorer or running setup commands.

## Demo release priorities

1. Review and commit the local UI/configuration/evidence changes.
2. Apply the latest hosted schema, configure the hosted event and server secrets,
   and verify wallet sign-in and receipt flow at the exact HTTPS origin.
3. Fix the recorded gas reporting discrepancy; verify hosted payment/reconciliation
   with an explicitly authorized Testnet payment.
4. Record the successful payment and a rejection/correction example. Explain the
   single-wallet roles, Testnet funds, quote assumptions, and preview-only features.
5. Finish the submission video, deck, disclosures and rehearsal.
