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

## Safe errors

- `401 authentication_required` / `authentication_failed`: sign in again; no
  challenge, signature, token or cookie detail is disclosed.
- `403 origin_forbidden`: request did not come from the configured exact origin.
- `409 analysis_draft_consumed`: draft is consumed, unavailable, or belongs to a
  different wallet; analyze again when appropriate.
- `410 analysis_draft_expired`: the 15-minute draft expired; analyze again.
- `403 member_not_found`, `processor_forbidden`, `reviewer_forbidden`: the session
  wallet lacks the required event role.
- `409 payment_reconciliation_unavailable`: a legacy in-flight claim has no safe
  durable digest and will not be retried automatically.
- `502 payment_reconciliation_failed`: the chain result could not be determined;
  the claim remains `paying` and may be checked again later.

Database, RPC, signature, token, key and private storage details are never part of
API errors.

## Payroll setup preview

`POST /api/payroll/setup/preview` requires the same-origin wallet session and accepts:

```json
{ "employee": "0x…", "expiryMs": 1788281999000 }
```

Only `PAYROLL_EMPLOYER_ADDRESS` may call it. The server returns the configured
Testnet package, official USDC type, backend `PayrollCap` recipient, statutory
recipients and rules, plus the exact RM50-equivalent micro-USDC budget derived
from the current MYR/USD rate. The browser uses that server-issued preview with
the shared transaction builder; it never receives the backend agent key.

The current endpoint does not register a payroll. Server-side verification of the
finalized digest and idempotent durable registration are the next gate.
