# Deterministic Policy Engine Design

**Date:** 31 August 2026
**Status:** Approved for implementation
**Owner:** Lim Wey Cheng (AI/backend)

## Goal

Add a deterministic, server-side policy engine that explains whether a submitted
claim may be paid automatically, requires treasurer review, or must be rejected.
The engine mirrors the Sui mandate's payment constraints while also evaluating
off-chain receipt policy. It does not sign transactions, update Supabase, or expose
a new API route in this increment.

## Product rules

A claim is eligible for automatic payment only when every rule passes:

1. the recipient is allowlisted by the Sui mandate;
2. the amount does not exceed the mandate's per-claim maximum;
3. the amount does not exceed the mandate's remaining budget;
4. the receipt date is a valid calendar date within the event window and is not
   in the future at evaluation time;
5. the receipt is not an exact duplicate within the event;
6. Gemini confidence is at least 90%, with no uncertain fields or warnings;
7. the expense category is allowed by the event;
8. the mandate has not expired; and
9. the mandate has not been revoked.

The engine must not claim to detect fraud. Duplicate handling is limited to the
existing exact file-hash signal.

## Outcome classification

The decision uses the existing `PolicyDecision` contract.

### `auto_pay`

All nine rule checks pass.

### `review`

No hard failure exists, but at least one correctable or uncertain off-chain check
fails:

- receipt date invalid;
- category not allowed; or
- confidence below 90%, uncertain fields present, or analysis warnings present.

### `reject`

At least one hard failure means an automatic Sui payment is prohibited or the
claim is already represented:

- exact duplicate;
- recipient not allowlisted;
- amount above the per-claim maximum;
- amount above the remaining budget;
- mandate expired; or
- mandate revoked.

Hard failures take precedence over review failures. For example, a low-confidence
claim against a revoked mandate is rejected, while every individual check remains
visible in the returned explanation.

## Architecture

Add a pure module under `packages/web/src/server/policy/`. It belongs to the server
because it consumes trusted event and mandate snapshots and will later be composed
into the claim-processing service. It does not belong in the browser mock or in
`@tali/shared`; shared contracts describe the result, while the server owns the
authorization policy.

The public function accepts one immutable evaluation input:

- a claim snapshot containing submitter, amount, receipt date, category and
  receipt analysis;
- an event-policy snapshot containing allowed categories, start time and expiry;
- a current `MandateView` from `@tali/shared`;
- an exact-duplicate boolean supplied by the persistence layer;
- an optional `nowMs` test seam that defaults to `Date.now()`.

The function returns a `PolicyDecision` containing:

- the final outcome;
- all nine `RuleCheck` entries in stable order;
- a concise plain-language reason based on the final outcome; and
- `evaluatedAtMs` equal to the selected evaluation time.

The module is side-effect-free and performs no network, database, filesystem,
wallet, or clock access other than the explicit `Date.now()` default.

## Rule evaluation details

- Monetary comparisons use `BigInt` base units. The evaluator fails closed if an
  amount snapshot is malformed or non-positive.
- Sui addresses are compared after lowercase normalization. Persisted inputs are
  expected to be canonical; normalization avoids case-only mismatch without
  broadening address validity.
- The per-claim check uses `amount <= maxPerClaim`.
- The budget check uses `amount <= remainingBudget`.
- The mandate-active check is `!mandate.revoked`.
- The expiry check uses `nowMs < mandate.expiryMs`; equality is expired, matching
  the contract boundary.
- Receipt dates use strict `YYYY-MM-DD` calendar validation rather than permissive
  JavaScript date parsing. A date must fall from the event start date through the
  earlier of the event expiry date and the current UTC date, inclusive.
- Category matching is exact against the event's allowed category values.
- Confidence passes only when it is finite and at least `0.9`, and both
  `uncertainFields` and `warnings` are empty.
- Duplicate status is the exact event-scoped file-hash result already enforced by
  the database unique constraint.

## Rule order and presentation

Checks are returned in the stable order defined by the current shared model:

1. `per_claim_max`
2. `total_budget`
3. `recipient_allowlist`
4. `mandate_active`
5. `not_expired`
6. `not_duplicate`
7. `category_allowed`
8. `receipt_date_valid`
9. `confidence_sufficient`

Each check includes an end-user-readable label and detail, plus the existing
`onChain` marker. Details may display USDC amounts but must never contain receipt
contents, credentials, provider errors, or private keys.

## Error handling

The evaluator returns a decision for policy failures; it does not throw merely
because a rule fails. Structurally invalid trusted snapshots fail closed by
marking the affected check as failed. This prevents malformed values from becoming
automatic-payment approvals and keeps the later process service in control of API
error translation.

## Testing

Unit tests cover:

- a valid claim producing `auto_pay` and nine passing checks;
- every hard failure producing `reject`;
- every review failure producing `review`;
- hard-failure precedence when review failures also exist;
- exact per-claim and remaining-budget boundaries;
- exact 90% confidence;
- uncertainty and warning routing even with high numeric confidence;
- mandate expiry immediately before and exactly at the boundary;
- invalid and impossible calendar dates;
- dates outside the event window and future dates;
- malformed and non-positive monetary snapshots failing closed;
- stable rule order and accurate on-chain markers; and
- deterministic `evaluatedAtMs` through the injected time.

The repository's lint, typecheck, unit tests, and production build must pass.

## Documentation impact

Implementation updates:

- `PROJECT_REQUIREMENTS.md` to add deterministic policy requirements and narrow
  the remaining out-of-scope list;
- `ARCHITECTURE_AND_CODING_DESIGN.md` to document the pure policy module, inputs,
  precedence and testing strategy; and
- `PROJECT_STATUS.md` to mark the evaluator complete while leaving claim-process
  persistence, review actions, server signing and payment broadcasting pending.

## Deferred work

The following work is intentionally separate:

- loading event and mandate snapshots from live adapters;
- `POST /api/claims/:id/process` orchestration;
- persisting decisions and claim-state transitions;
- review approve/reject endpoints;
- service-wallet key management;
- Sui transaction construction, signing and broadcasting; and
- concurrency reservations for simultaneous claims before on-chain settlement.

The Sui contract remains the final payment authority even after these later
integrations are added.
