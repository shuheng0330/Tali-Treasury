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
  |       |          |          |
  v       v          v          v
Gemini  Auth +     Receipt   PaymentExecutor
adapter draft/claim store    (Sui Testnet)
          |          |
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
- `src/server/auth` issues/verifies signed challenges, hashes opaque tokens,
  enforces exact origins, resolves session identity with invalid-cookie precedence,
  and applies server-only employer-wallet authorization for privileged writes.
- `src/server/events` owns treasurer authorization and validation for the add-only
  event-member roster use cases.
- `src/server/dependencies.ts` composes production adapters lazily so importing a
  route never reads secrets.
- `src/app/api` contains thin Node.js route handlers and testable handler factories.

Receipt amounts retain the extracted ISO currency. Only a USDC-denominated claim
may run the mandate's monetary comparisons. A non-USDC receipt is routed to review
and its cap and budget checks remain deferred until a future quote module stores an
explicit converted USDC payout. The original analysis remains unchanged when a
member corrects the confirmed claim fields.

The claim boundary and database accept three-letter ISO currency codes plus the
explicit four-letter `USDC` asset symbol. This keeps validation narrow while
allowing the configured payment asset to persist end to end.

## Payroll and treasury write authorization

Registered payroll selection is URL-addressable but server-authorized. Public
configuration views omit capability data. Preview/run services derive the sole
employee and ordered statutory recipients from the immutable snapshot; execution
receives package, mandate and cap per call and verifies the signer against the
stored cap owner. `payroll_runs.payroll_mandate_id` scopes new runs and history
while remaining nullable only for legacy rows. Stream routes authorize the same
selection and compare current chain mandate and employee state before responding
or signing.

`POST /api/payroll/runs`, `POST /api/mandate/revoke`, and
`POST /api/safety/attack` use a shared route authorization primitive. The route
checks the exact `TALI_APP_ORIGIN`, resolves the fixed-expiry wallet session, and
compares its canonical address with the server-only `TALI_EMPLOYER_WALLET` before
parsing the body or invoking a service that can sign or mutate. Missing or malformed
configuration fails closed; the browser never receives the configured address from
an API response.

`POST /api/streams/:id/withdraw` uses the same origin/session ordering, then reads
the selected stream and compares the session wallet with `stream.employee`. Only
after ownership passes may it call the withdrawal dependency. Handler factories
inject identity and business operations so route tests prove unauthorized requests
cannot reach chain-signing code. Payroll-history GET behavior remains unchanged.

## Database design

- `events` stores organisation, treasurer, mandate object, allowed categories and
  lifecycle dates.
- `event_members` uses `(event_id, wallet_address)` as its primary key and records
  whether membership is active. The roster API lists only active rows in stable
  `created_at`, `wallet_address` order and inserts new rows with `active = true`.
- `claims` stores positive integer base units, normalized receipt fields, analysis
  JSON, internal object path, decision/payment JSON, nullable review metadata, and
  one nullable payment-attempt digest with prepared/last-checked timestamps. The
  pre-payment budget is internal persistence used to reconstruct a terminal result.
- `claim_review_events` is append-only. A security-definer `AFTER UPDATE` trigger
  inserts its single audit row when review metadata changes from null to populated,
  so the state transition and audit record commit together.
- `wallet_auth_challenges` stores exact five-minute personal-sign messages and a
  single consumed timestamp. `wallet_sessions` stores only unique SHA-256 token
  hashes with fixed expiry/revocation timestamps.
- `receipt_analysis_drafts` privately binds event, wallet, object path, hash and
  immutable extraction for 15 minutes. A row lock consumes it and inserts one
  claim in the same transaction; an insertion failure rolls back consumption.
- `payroll_configurations` is an append-only registry of verified creation
  transactions. Unique digest, mandate and cap identifiers make concurrent
  registration idempotent while allowing multiple configurations per employer.
  It stores policy and ownership snapshots as decimal strings/JSON, has RLS with
  no browser policies, and grants the service role only `select` and `insert`.
- `(event_id, receipt_sha256)` is unique. Receipt object paths are globally unique.
- A composite membership foreign key preserves ownership history, while an insert
  trigger rejects claims by inactive members without preventing later member
  deactivation.
- All three tables enable RLS without browser policies. Explicit grants are limited
  to `service_role`.

The private `receipts` bucket has a 10 MiB limit and accepts only JPEG, PNG and
WebP. Public URLs are never stored; list operations create 300-second signed URLs.

Browser wallets connect through Testnet-only `@mysten/dapp-kit-react` and
`SuiGrpcClient`. Connection alone is not authentication: the user explicitly
signs the stored challenge. The raw random 256-bit session token is returned only
as an HTTP-only strict cookie and never reaches application JSON or persistence.
Disconnect/account change revokes the current client session. Local compatibility
identity is possible only with no cookie and an explicit insecure flag; hosted
deployments disable it.

## Mobile presentation architecture

The payroll proof and treasury surfaces use summary-first rendering without
changing their service boundaries. `EnforcementProof` owns the semantic scenario
fieldset, an always-visible expected outcome, a collapsed full calculation, and
an `aria-live` terminal result. Only the deficient-EPF scenario calls the run API;
the valid comparison links to the normal payroll route.

`MandateHeader` renders the operational balance hierarchy and keeps immutable
Sui safeguards in a native `details` disclosure. `ClaimRow` and
`ClaimHistoryCard` are separate card presentations over the existing claim
contracts. Review checks are copied before sorting into failed, pending, and
passed groups, so domain objects remain immutable. `FxQuoteSummary` exposes a
compact treasury variant while its full confirmation-dialog variant remains the
approval evidence source.

Reusable disclosure styling and safe-area padding live in `globals.css`; no new
runtime dependency or animation layer is introduced. Buttons retain the shared
button system and meet a 44px minimum target. Responsive behavior is CSS-driven,
so no viewport subscription or client rendering branch is required.

## Event-member roster design

`GET /api/events/:id/members` resolves the fixed-expiry wallet session, validates
the event identifier, and authorizes the caller against `events.treasurer_wallet`
before querying `event_members`. The repository filters `active = true` and applies
stable database ordering by `created_at` and `wallet_address`.

`POST /api/events/:id/members` checks the exact configured origin before session
resolution, then performs the same treasurer authorization before parsing the
member payload. The service accepts only the shared `{ address, displayName }`
contract and the repository inserts a new active row. PostgreSQL error `23505` is
mapped to `member_already_exists`; no upsert can rename or reactivate an existing
row. Provider details remain only on the internal error cause. The existing
Treasury form adapts its local `walletAddress` field to this shared transport
contract; authoritative roster rendering remains a frontend handoff.

## Payroll registration design

`POST /api/payroll/register` applies origin, session and configured-employer
authorization before JSON parsing. The service accepts only `{ digest }` and an
injected verifier reads the finalized Testnet transaction with effects, sender
and object types. It requires exactly one newly created configured-package USDC
payroll mandate and one payroll capability, then rereads both objects to prove
their `previousTransaction` is the submitted digest.

The verifier compares the mandate with the supported one-employee statutory
template, checks that it is unused and unrevoked, and requires the capability to
reference that mandate and be owned by the address derived from
`AGENT_PRIVATE_KEY`. The repository inserts the resulting immutable snapshot.
On a uniqueness race it reloads by digest and returns an idempotent replay only
when every stored field matches; other collisions fail closed. Automated tests
inject all chain operations and cannot broadcast.

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

`POST /api/claims/:id/process` derives its processor from the fixed-expiry wallet
session, validates the claim, loads claim plus event policy, and permits only the
configured treasurer. The browser payload contains no processor address.

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

Before `PaymentExecutor` broadcasts, it derives the canonical Sui digest from the
signed transaction bytes and invokes the repository's guarded attempt callback.
Only a successfully persisted first attempt may proceed to submission. This makes
the digest durable even when submission or finality becomes uncertain.

## Treasurer-review design

`POST /api/claims/:id/review` uses the same authenticated treasurer identity as
claim processing. The service validates the discriminated request, loads trusted
claim/event context, and requires the configured treasurer. Supabase applies one
guarded update filtered by claim ID, `state = awaiting_review`,
`review_action IS NULL`, and `payment IS NULL`. Rejection and correction finish at
`rejected` and `needs_correction`; approval reserves payment immediately by moving
directly to `paying`.

Before approval changes state, the service validates the signer, reads the current
mandate, verifies its object ID, and re-runs all policy checks. Only category,
receipt-date, and extraction-confidence failures are human-overridable. Currency
readiness and every on-chain rule remain mandatory. Only the compare-and-set winner
invokes the injected `PaymentExecutor`; terminal outcomes reuse the existing
guarded `paying -> paid|payment_failed` persistence. Exact replays return stored
results, while an in-flight/uncertain approval remains `paying` and cannot be
automatically retried.

The treasury client uses one review dialog. Approval explicitly names the testnet
USDC payment consequence; rejection and correction validate their reason before
sending. Successful writes reload persisted claims, and terminal payment responses
also refresh the server-rendered mandate snapshot.

## Payment-reconciliation design

`POST /api/claims/:id/reconcile` derives the caller from the wallet session,
enforces exact origin, and permits only the event treasurer. A `paying` claim must
have a durable payment-attempt digest and internal budget snapshot. The service
looks up that exact digest on Sui Testnet without invoking transaction preparation,
signing, or submission.

A missing transaction remains `paying`; an RPC failure returns a sanitized 502;
confirmed success reads the current mandate balance and compare-and-sets the claim
to `paid`; and a confirmed Move rejection uses the shared abort mapping before the
same guarded transition to `payment_failed`. Concurrent terminal updates reload the
winner, and terminal calls replay the stored result. Legacy digest-less `paying`
rows return a safe conflict.

The treasury client polls only after an explicit **Check payment status** action,
at two-second intervals for at most 20 seconds. The general chain refresh performs
one reconciliation lookup for each visible `paying` claim before reloading claims
and mandate state. There is no cron job or automatic rebroadcast path.

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

Authentication failures intentionally collapse missing/invalid/replayed
challenge details into safe 401 responses. Consumed or ownership-mismatched
drafts return a non-disclosing 409; expiry returns 410 so the client can show
“Analyze again.” Signatures, session tokens, private paths, RPC text and database
messages are never serialized.

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
- Review tests cover request validation, authorization, all three compare-and-set
  transitions, audit mapping, exact replay/conflict behavior, fresh mandate
  failures, single-winner signing, terminal payment classification, uncertainty,
  client payloads, dialog copy, reason validation and queue rules.
- Reconciliation tests cover attempt-before-submit ordering, lost races, pending
  lookups, terminal success/rejection, RPC uncertainty, idempotency, authorization,
  bounded polling, explorer links, and the guarantee that observation never signs
  or submits.
- Payroll/revoke/safety route tests cover exact-origin, missing-session,
  missing-configuration and wrong-wallet failures with mutation spies kept at
  zero calls. Stream tests additionally prove read-before-withdraw ordering and
  employee-only ownership.
- Event-member roster tests cover active-only stable ordering, row mapping,
  insertion and duplicate sanitization; service tests prove authorization happens
  before reads/writes; route tests cover sessions, exact origin, payloads and safe
  status codes; and the client test locks the shared request/response contract.
- Payment-adapter tests use generated credentials and injected operations to cover
  lazy configuration, success, Move rejection and failure classification without
  a network request or transaction broadcast.
- pgTAP applies the migration to a clean database and checks constraints,
  privileges, RLS, storage configuration and duplicate behavior.
- Real Ed25519 and Secp256k1 personal signatures cover correct/wrong addresses,
  replay, expiry and malformed input; cookie/origin tests cover fixed expiry,
  logout and invalid-cookie precedence.
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

After PR #17, migration `20260901000000` adds the direct claims-to-events
relationship and `20260901010000` adds payroll runs. Review persistence therefore
uses `20260901020000_claim_review_actions.sql`, preserving a unique chronological
migration version.

Migration `20260901030000_wallet_auth_and_analysis_drafts.sql` adds the three
private auth/draft tables plus service-role-only atomic challenge and draft
functions. After merge it must be pushed to hosted Supabase, `TALI_APP_ORIGIN`
must equal the deployed HTTPS origin, and the member/treasurer browser flows must
be verified manually. No automated verification broadcasts a Sui transaction.

Migration `20260902010000_claim_payment_reconciliation.sql` adds the guarded
payment-attempt metadata and consistency constraints. It is additive and must be
applied after the wallet/draft migration during hosted rollout.

The event-member roster increment adds no migration. It reuses the existing
service-role-only `events` and `event_members` tables and therefore requires only
application deployment plus hosted treasurer/non-treasurer verification.

Migration `20260904020000_payroll_configurations.sql` adds the private immutable
payroll registry. After deployment it must be applied before registration is
used; the published package, employer, signer and statutory recipient variables
must match the mandate created by `/payroll/setup`.

Local Logflare analytics and its Vector collector are intentionally disabled. On
Windows the collector otherwise requires Docker Desktop's unauthenticated TCP API
on port 2375, which this project does not enable. Database, Auth, Storage, REST,
Realtime, Edge Runtime, Mailpit and Studio remain available; developers inspect
local service output with `docker logs` when needed.
