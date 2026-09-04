# Authenticated claim API

All examples are same-origin. State-changing requests require an `Origin` header
that exactly equals `TALI_APP_ORIGIN`. Protected endpoints use the opaque
`tali_session` HTTP-only cookie; wallet addresses in request payloads are not an
authentication mechanism.

## Wallet session

`POST /api/auth/challenge`

```json
{ "address": "0x…64 lowercase hex digits…" }
```

Returns `{ "challengeId", "message", "expiresAt" }`. The exact human-readable
message expires after five minutes and may be consumed once.

`POST /api/auth/session`

```json
{ "challengeId": "uuid", "signature": "wallet personal-message signature" }
```

The server verifies the stored message and expected address, sets `tali_session`
for one fixed hour, and returns `{ "address", "expiresAt" }`. The response never
contains the token. `GET /api/auth/session` returns the active session;
`DELETE /api/auth/session` revokes only the current token and clears its cookie.

## Event member roster

Both roster endpoints require an active wallet session for the event's configured
treasurer. Member wallets and unrelated treasurers receive `403`.

`GET /api/events/:id/members` returns active members ordered by creation time and
then wallet address:

```json
{
  "members": [
    {
      "eventId": "event uuid",
      "address": "0x…64 lowercase hex digits…",
      "displayName": "Lim Wey Cheng",
      "addedAtMs": 1788480000000
    }
  ]
}
```

`POST /api/events/:id/members` also requires the exact configured `Origin` and
accepts:

```json
{
  "address": "0x…64 lowercase hex digits…",
  "displayName": "New Member"
}
```

The display name must already be trimmed and contain 1–120 characters. A successful
insert returns HTTP `201` with `{ "member": { ... } }`. The endpoint never renames
or reactivates an existing event/address pair.

## Receipt and claims

`POST /api/receipts/analyze` is multipart with `receipt` and `eventId`. It returns:

```json
{
  "analysis": { "merchant": "…", "receiptHash": "…" },
  "draftId": "uuid or null",
  "draftExpiresAt": "ISO timestamp or null",
  "duplicateOf": "claim uuid or null"
}
```

A duplicate has no usable draft. Private object paths are never returned.

`POST /api/claims` accepts only the draft reference and confirmed editable fields:

```json
{
  "draftId": "uuid",
  "merchant": "Confirmed merchant",
  "amount": "1000000",
  "receiptDate": "2026-09-01",
  "category": "printing",
  "description": "Team printing"
}
```

The database atomically supplies event, wallet, currency, receipt hash, private
path and original extraction from the draft, verifies active membership, creates
one claim, and consumes the draft. `GET /api/events/:id/claims` derives the viewer
from the session and permits an active member or the configured treasurer.

`POST /api/claims/:id/process` accepts `{}`. `POST /api/claims/:id/review`
accepts `approve`, `reject`, or `request_correction`; rejection and correction
require a trimmed 1–500 character reason. Both derive the treasurer from session.

`POST /api/claims/:id/pay` accepts `{}` and derives the treasurer from the
session. Approving records a decision and moves the claim to `approved`; this is
the separate request that signs the transfer, so a signing failure reads as a
failed payment rather than as a treasurer who changed their mind. It also
retries a claim in `payment_failed`, a state only written when nothing moved.

`POST /api/claims/:id/reconcile` accepts `{}` and derives the treasurer from the
session. It observes only the durable payment digest and returns:

```json
{
  "claim": { "state": "paying", "paymentAttempt": { "digest": "…" } },
  "status": "pending",
  "digest": "…",
  "payment": null
}
```

`status` is `pending`, `paid`, or `payment_failed`. A pending response never signs
or broadcasts. Terminal claims replay their stored payment result.

## Payroll registration

`POST /api/payroll/register` requires the exact configured `Origin`, an active
wallet session, and the configured employer. It accepts only:

```json
{ "digest": "base58 Sui transaction digest" }
```

The server waits for finality and independently discovers and verifies the new
Testnet USDC `PayrollMandate` and `PayrollCap`. A new immutable registration
returns HTTP `201`; an exact retry returns HTTP `200`:

```json
{
  "status": "registered",
  "mandateId": "0x…64 lowercase hex digits…",
  "capId": "0x…64 lowercase hex digits…"
}
```

Registration never signs or broadcasts. The client retains the funded digest
after failure, so retrying registration cannot fund a second mandate.

## Safe errors

- `401 authentication_required` / `authentication_failed`: sign in again; no
  challenge, signature, token or cookie detail is disclosed.
- `403 origin_forbidden`: request did not come from the configured exact origin.
- `409 analysis_draft_consumed`: draft is consumed, unavailable, or belongs to a
  different wallet; analyze again when appropriate.
- `410 analysis_draft_expired`: the 15-minute draft expired; analyze again.
- `403 member_not_found`, `processor_forbidden`, `reviewer_forbidden`: the session
  wallet lacks the required event role.
- `404 event_not_found`: the roster event does not exist.
- `409 member_already_exists`: the wallet is already present in the event roster.
- `409 payment_reconciliation_unavailable`: a legacy in-flight claim has no safe
  durable digest and will not be retried automatically.
- `502 payment_reconciliation_failed`: the chain result could not be determined;
  the claim remains `paying` and may be checked again later.
- `409 payroll_registration_pending`: the digest is not finalized; retry the same
  digest shortly. `payroll_registration_conflict` means an identifier is already
  bound to a different verified snapshot.
- `422 payroll_registration_refused`: the finalized transaction or objects do not
  match the supported payroll. `502 payroll_registration_failed` is sanitized RPC
  uncertainty; `503 payroll_registration_configuration_failed` is missing or
  invalid server-only configuration.

Database, RPC, signature, token, key and private storage details are never part of
API errors.

## Payroll setup preview

`POST /api/payroll/setup/preview` requires the same-origin wallet session and accepts:

```json
{ "employee": "0x…", "expiryMs": 1788281999000 }
```

Only `TALI_EMPLOYER_WALLET` may call it. The server returns the configured
Testnet package, official USDC type, backend `PayrollCap` recipient, statutory
recipients and rules, plus the exact RM50-equivalent micro-USDC budget derived
from the current MYR/USD rate. The browser uses that server-issued preview with
the shared transaction builder; it never receives the backend agent key.

The preview endpoint does not register a payroll or accept a transaction digest.

`POST /api/payroll/setup/verify` accepts `{ "digest": "…" }` from the same
authenticated employer. It waits for a checkpoint and independently verifies the
transaction sender, configured package and coin type, the single created mandate,
every immutable rule, and the created `PayrollCap` owner. It returns the verified
mandate and cap IDs. It never signs, rebuilds or resubmits a transaction.

Durable idempotent registration is performed by the canonical
`POST /api/payroll/register` endpoint. It accepts only the digest, applies the
strict server-side verification, and stores the immutable verified snapshot in
`payroll_configurations`. A new registration returns 201 and an exact replay
returns 200, both as `{ "status": "registered", "mandateId": "0x…", "capId": "0x…" }`.
Replaying a stored digest never creates another chain transaction; conflicting
mandate or capability IDs return 409. `/api/payroll/setup/register` is retained
as a compatibility alias to the same handler.
