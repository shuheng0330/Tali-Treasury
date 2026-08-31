# Architecture and coding design

## System boundary

The receipt and payment backend is a server-only vertical slice inside the Next.js
web workspace. It reuses `@tali/shared` for domain and API contracts and delegates
all Sui transaction construction to `@tali/treasury-sui`.

```text
Next.js API route
      |
      v
Application service
  |       |       |          |
  v       v       v          v
Gemini  Claim    Receipt   PaymentExecutor
adapter repository store    (Sui Testnet)
          |        |
          +--- Supabase
```

## Modules

- `src/server/receipts` validates Gemini output, hashes exact bytes and converts
  displayed decimals to six-decimal base units with `BigInt` arithmetic.
- `src/server/claims` defines injected ports, validates claim confirmation input
  and coordinates analyze, persist and list use cases.
- `src/server/policy` deterministically evaluates trusted claim, event, mandate,
  duplicate and time snapshots without performing I/O.
- `src/server/sui` reads live mandates and implements the testnet-only
  `PaymentExecutor`, with transaction preparation separated from submission for
  safe failure classification and fake-only tests.
- `src/server/supabase` owns privileged client construction, database row mapping,
  private uploads and signed URLs.
- `src/server/dependencies.ts` composes production adapters lazily so importing a
  route never reads secrets.
- `src/app/api` contains thin Node.js route handlers and testable handler factories.

Receipt amounts retain the extracted ISO currency. Only a USDC-denominated claim
may run the mandate's monetary comparisons. A non-USDC receipt is routed to review
and its cap and budget checks remain deferred until a future quote module stores an
explicit converted USDC payout. The original analysis remains unchanged when a
member corrects the confirmed claim fields.

## Database design

- `events` stores organisation, treasurer, mandate object, allowed categories and
  lifecycle dates.
- `event_members` uses `(event_id, wallet_address)` as its primary key and records
  whether membership is active.
- `claims` stores positive integer base units, normalized receipt fields, analysis
  JSON, internal object path and optional later decision/payment JSON.
- `(event_id, receipt_sha256)` is unique. Receipt object paths are globally unique.
- A composite membership foreign key preserves ownership history, while an insert
  trigger rejects claims by inactive members without preventing later member
  deactivation.
- All three tables enable RLS without browser policies. Explicit grants are limited
  to `service_role`.

The private `receipts` bucket has a 10 MiB limit and accepts only JPEG, PNG and
WebP. Public URLs are never stored; list operations create 300-second signed URLs.

Because wallet authentication is not part of this increment, all privileged
receipt routes fail closed by default. Controlled local demos must explicitly
enable insecure demo identity mode; claim listing also requires an active member
viewer address. This is not production authentication.

## Deterministic policy design

`evaluatePolicy` is a pure server function. It returns all nine shared rule checks
in stable order and uses the existing `PolicyDecision` outcome contract. Monetary
snapshots are strict decimal base-unit strings compared with `BigInt`; malformed or
non-positive claim amounts fail closed. Receipt dates use strict `YYYY-MM-DD`
calendar parsing and must fall within the event window and no later than the
evaluation's UTC day.

The evaluator injects `nowMs` for deterministic tests and uses a single selected
timestamp for date and mandate-expiry checks. A mandate is expired when
`nowMs >= expiryMs`, matching the Move boundary. Exact duplicates, mandate-limit
failures, revoked or expired mandates, and non-allowlisted recipients produce
`reject`. Category, date and extraction-certainty failures produce `review` unless
a hard failure also exists. Only nine passing checks produce `auto_pay`.

This module itself neither fetches the on-chain mandate nor persists the decision.
The claim-processing service provides current snapshots, stores the result and
sends only `auto_pay` claims through the injected payment port. The Move contract
remains the final authority and rechecks its rules at execution time.

## Claim-processing design

`POST /api/claims/:id/process` is a thin route behind the existing fail-closed demo
identity gate. Its injected service validates the claim and processor, loads the
claim plus event policy, and permits only the configured treasurer. The processor
address remains an insecure demo identity until wallet authentication exists.

For a new submitted claim, a read-only Sui adapter composes `createTestnetClient`,
`readMandate` and `toMandateView`. The adapter rejects a mandate with a different
coin type, and the service verifies the returned object ID before it runs
`evaluatePolicy` and maps the outcome to `approved`, `awaiting_review` or
`rejected`.

Supabase persists the state and decision with a compare-and-set update filtered by
claim ID, `state = submitted` and `decision IS NULL`. A zero-row update reloads the
claim: a stored decision is returned as the concurrent winner, while an undecided
row becomes a conflict.

For an `auto_pay` result, the service validates the signer configuration, reads and
re-evaluates the mandate again, then atomically reserves payment with
`approved -> paying` and `payment IS NULL`. Only the reservation winner may invoke
`PaymentExecutor.execute`. Confirmed outcomes are stored with another guarded
transition to `paid` or `payment_failed`. Terminal results are returned
idempotently. A transport or finality uncertainty leaves the row in `paying`; later
requests return a reconciliation conflict and never sign a replacement payment.

`createSuiPaymentExecutor` is lazy: factory creation and route import do not read
`AGENT_PRIVATE_KEY`. `assertReady` accepts only testnet, parses the server-only
Ed25519 key and canonical `AgentCap`, and caches the validated runtime. Its internal
operations boundary separates build/sign (`prepare`) from submission/finality
(`submit`) and the final mandate-budget read. Tests inject all three operations, so
they cannot access a real RPC endpoint or broadcast.

## Error handling

`ServerError` carries a stable code, safe message and HTTP status. Provider errors
are retained only as an internal cause. Unknown failures become a generic
`database_failed` response and never return raw provider text.

Pre-submit construction failures become sanitized terminal payment failures.
Confirmed Move aborts use the shared abort-code mapping and persist no raw error.
Submission or post-submission uncertainty returns
`payment_submission_uncertain` without persisting provider text, signatures or
private-key material.

## Testing strategy

- Vitest tests use injected Gemini, repository, storage and service boundaries.
- Receipt hashing uses real bytes and a known SHA-256 vector.
- Route tests use real `Request`, `FormData`, `File` and `Response` objects.
- Policy tests exercise every reject and review rule, hard-failure precedence,
  exact monetary and confidence limits, malformed snapshots, strict calendar
  dates, and the exclusive mandate-expiry boundary.
- Claim-processing tests cover treasurer authorization, stored-decision
  idempotency, outcome-to-state mapping, atomic persistence races, live mandate
  mapping, payment readiness, preflight policy changes, single-winner signing,
  terminal idempotency, uncertainty handling, route validation and sanitized
  adapter failures.
- Payment-adapter tests use generated credentials and injected operations to cover
  lazy configuration, success, Move rejection and failure classification without
  a network request or transaction broadcast.
- pgTAP applies the migration to a clean database and checks constraints,
  privileges, RLS, storage configuration and duplicate behavior.
- Repository completion requires build, typecheck, tests, audit, secret scan and
  attribution scan.

## Deployment design

Local Supabase is the normal development target. Hosted deployment uses
`supabase login`, `supabase link` and `supabase db push`, followed by direct checks
that RLS, grants and the private bucket match the migration. Hosted verification
must be recorded separately from local completion. Migration
`20260830000000_backend_receipt_schema.sql` was applied to hosted project
`mnoalwykrmueimmuyllw` on 30 August 2026 and verified through synchronized
migration history, a clean schema lint, PostgreSQL catalog checks and storage
bucket metadata.
The non-secret verification scope and reproduction queries are recorded in
[`docs/HOSTED_SUPABASE_VERIFICATION.md`](docs/HOSTED_SUPABASE_VERIFICATION.md).

Hosted demo data uses immutable additive migrations. Migration `20260831000000`
created the fixed demo event and Kian Xiang membership; migration
`20260831010000` added Shu Heng and Lim Wey Cheng without rewriting the applied
seed or deleting other members. Both migrations were applied to the hosted
project and the three active mappings were catalog-verified on 31 August 2026.

Local Logflare analytics and its Vector collector are intentionally disabled. On
Windows the collector otherwise requires Docker Desktop's unauthenticated TCP API
on port 2375, which this project does not enable. Database, Auth, Storage, REST,
Realtime, Edge Runtime, Mailpit and Studio remain available; developers inspect
local service output with `docker logs` when needed.
