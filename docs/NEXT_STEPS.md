# Next implementation plan

The current safe boundary is: a member can submit a receipt, the treasurer can run
the real server policy, and no code claims that approval means payment. Non-USDC
receipts cannot auto-pay until a conversion quote exists.

## 1. Authenticated identity and analysis binding

- Issue a short-lived wallet challenge with a one-time nonce.
- Verify the signed challenge server-side and create an HTTP-only session.
- Replace submitted member and processor addresses with the authenticated address.
- Persist receipt analysis as an expiring draft and consume it once at confirmation.
- Store original extraction and member corrections separately for audit.

Acceptance: replayed challenges and consumed drafts fail; members cannot submit or
read claims for another event; only the configured treasurer can process or review.

## 2. MYR-to-USDC quote

- Add original amount/currency and payout amount/currency as separate fields.
- Store rate, provider, quoted time, expiry and integer rounding result.
- Show `RM original → USDC payout` before confirmation.
- Requote expired claims and require confirmation when the payout changes.
- Evaluate mandate cap and budget only against the stored USDC payout.

Acceptance: no floating-point money, no implicit 1:1 conversion, deterministic
rounding tests, and an expired or missing quote can never reach auto-pay.

## 3. Treasurer review actions

- Implement approve, reject and request-correction endpoints with compare-and-set
  transitions and an audit event for every action.
- Require a reason for rejection and correction.
- Replace the remaining demo buttons and refresh the persisted queue.

Acceptance: invalid transitions return 409, repeated requests are idempotent, and
reviewing one claim cannot update another claim.

## 4. Payment orchestration

- Reserve budget before signing concurrent approved claims.
- Move claims through `approved → paying → paid` or `payment_failed`.
- Build transactions only through `@tali/treasury-sui`.
- Keep the agent key server-side, wait for finality and store digest/checkpoint/gas.
- Add retry and reconciliation for unknown finality without double payment.

Acceptance: one valid MYR receipt is quoted and paid end to end on Testnet; an
overspend and unknown recipient are rejected by the contract; retrying cannot pay
twice.

## 5. Demo proof and submission

- Wire one interactive safety refusal and one valid counterfactual payment.
- Record a member-flow video and the adversarial safety-test video.
- Finish the deck, Devfolio copy, AI-tool disclosure and rehearsal.

Acceptance: every visible digest opens in an explorer, all simulated controls remain
labelled, and the complete demo can be repeated from a fresh browser.
