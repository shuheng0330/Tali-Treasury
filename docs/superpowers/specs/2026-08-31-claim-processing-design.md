# Claim Processing Design

**Date:** 31 August 2026
**Status:** Approved for implementation
**Owner:** Lim Wey Cheng (AI/backend)

## Goal

Connect the deterministic policy evaluator to a real backend process endpoint.
The endpoint loads a submitted claim and event policy from Supabase, verifies a
treasurer demo identity, reads the current Sui mandate, evaluates the claim,
atomically stores the decision and transitions the claim state. This increment
does not construct, sign or broadcast a Sui transaction.

## Scope

This increment adds:

- `ProcessClaimRequest { processor: Address }` to the shared API contract;
- `POST /api/claims/:id/process`;
- treasurer-only demo authorization;
- claim/event process-context loading from Supabase;
- a testable Sui mandate-reader port and production adapter;
- deterministic policy evaluation using the existing `evaluatePolicy` function;
- atomic decision and state persistence;
- idempotent repeated requests; and
- `ProcessClaimResponse` with `payment: null`.

It deliberately excludes private keys, transaction construction, signing,
broadcasting, payment retries, gas handling and finality tracking.

## API contract

The shared request is:

```ts
export interface ProcessClaimRequest {
  processor: Address;
}
```

`POST /api/claims/:id/process` accepts JSON matching this request and returns the
existing `ProcessClaimResponse`:

```ts
{
  claim: Claim;
  decision: PolicyDecision;
  payment: null;
}
```

The route uses the existing `requireDemoIdentityEnabled()` gate. The supplied
processor address remains an explicitly insecure demo identity, not proof of
wallet ownership. Production must remain disabled until wallet/session
authentication is implemented.

## Architecture

The feature follows the existing thin-route, injected-service, adapter pattern:

```text
POST /api/claims/:id/process
              |
              v
     ProcessClaimService
       |      |      |
       v      v      v
    Claim   Mandate  evaluatePolicy
 repository reader   (pure function)
       |        |
       v        v
   Supabase    Sui testnet
```

### Claim process service

`createProcessClaimService()` owns validation, authorization, idempotency,
orchestration, outcome mapping and error translation. Its dependencies are
injected so unit tests perform no database or Sui network access.

### Claim repository

The repository gains focused processing operations rather than exposing its
Supabase client:

- `getProcessContext(claimId)` returns the claim, event policy, configured
  treasurer and mandate object ID;
- `saveDecision(input)` performs a compare-and-set update only when state remains
  `submitted` and decision remains null; and
- the save result distinguishes `saved` from `lost_race`, with the latter carrying
  the current claim when another request has already persisted a decision.

The event policy snapshot contains allowed categories, `startsAtMs` and
`expiresAtMs`. Database timestamps must parse to finite millisecond values.

### Mandate reader

The new `MandateReader` port exposes one operation that accepts the event's
mandate object ID and returns `MandateView`. The production adapter composes the
existing Sui integration functions:

- `createTestnetClient()`;
- `readMandate()`; and
- `toMandateView()`.

The adapter uses server-only Sui configuration. It validates the package and coin
type through the existing integration code and does not require a signer.

## Authorization

Processing is treasurer-only:

1. normalize and validate the supplied processor as a canonical Sui address;
2. load the claim and event process context;
3. compare the processor with `events.treasurer_wallet`; and
4. stop with HTTP 403 before any Sui request or database mutation when they differ.

This equality check limits the demo surface but is not cryptographic
authentication. The environment gate must remain fail-closed by default.

## Processing flow

1. Validate the UUID claim ID and processor address.
2. Load the claim/event process context.
3. Verify the processor is the event treasurer.
4. If the claim already contains a decision, return it unchanged with
   `payment: null` and do not read Sui.
5. If an undecided claim is not in `submitted`, return a processing conflict.
6. Read the event's current Sui mandate.
7. Confirm the returned mandate ID matches the configured event object ID.
8. Evaluate the claim with the event policy, mandate, current time and
   `exactDuplicate: false`.
9. Map the outcome to a claim state:
   - `auto_pay` to `approved`;
   - `review` to `awaiting_review`; and
   - `reject` to `rejected`.
10. Atomically persist the decision and new state.
11. If another request won the compare-and-set race, return its stored decision.
12. Return the updated claim, stored decision and `payment: null`.

The database unique constraint on `(event_id, receipt_sha256)` is the race-safe
exact-duplicate authority. A persisted claim therefore supplies
`exactDuplicate: false`; duplicate receipt bytes cannot coexist as a second claim
within the event.

## Idempotency and concurrency

Once a claim has a stored decision, processing is idempotent. A repeated request
returns the stored claim and decision without reading the mandate or reevaluating
policy. A newer mandate state does not rewrite a historical decision.

The persistence update filters by claim ID, `state = submitted` and
`decision IS NULL`. If no row is updated, the repository reloads the claim:

- a stored decision means another request won, so return that result;
- no stored decision means an unsupported transition, so return HTTP 409; and
- no claim means HTTP 404.

This prevents two simultaneous requests from recording different decisions.

## State and payment semantics

`approved` means the claim passed policy and is ready for a later payment step. It
does not mean funds moved. `payment` remains null for every outcome in this
increment. The UI and documentation must not describe `approved` as paid.

Only a future signer increment may move an approved claim through `paying` to
`paid` or `payment_failed`.

## Error handling

The server exposes stable, sanitized errors:

- `invalid_request`, HTTP 400: malformed JSON, claim UUID or processor address;
- `processor_forbidden`, HTTP 403: processor is not the configured treasurer;
- `claim_not_found`, HTTP 404: claim does not exist;
- `processing_conflict`, HTTP 409: an undecided claim is not processable;
- `mandate_read_failed`, HTTP 502: Sui mandate loading or validation fails; and
- `database_failed`, HTTP 500: Supabase loading or persistence fails.

Raw Supabase errors, Sui provider errors, credentials and receipt contents are
never returned. Repository `ServerError` values retain their safe meanings;
unexpected adapter errors are translated at the service boundary.

## Testing

### Service tests

- each policy outcome maps to the correct state;
- only the configured treasurer is authorized;
- authorization fails before mandate loading or mutation;
- an existing decision returns idempotently without mandate loading;
- an undecided unsupported state returns a conflict;
- the evaluator receives the claim, event and live mandate snapshots;
- a compare-and-set loser returns the winning stored decision;
- mismatched mandate IDs fail closed;
- Sui read errors become `mandate_read_failed`; and
- database errors stay sanitized.

### Repository tests

- process context joins the correct event fields and maps timestamps;
- missing claims return `claim_not_found`;
- malformed joined rows fail as database errors;
- compare-and-set updates only submitted undecided claims;
- saved rows map the stored decision and target state;
- zero-row updates reload and distinguish a race winner from conflict; and
- provider details do not escape.

### Route and composition tests

- valid JSON reaches the service with the route claim ID;
- malformed JSON and missing processor return HTTP 400;
- service errors map through `toApiError`;
- the production dependency graph constructs a read-only mandate adapter; and
- no code path constructs, signs or broadcasts a transaction.

The full repository tests, typecheck, production build, audit, diff check and
credential scan must pass.

## Documentation impact

Implementation updates all mandatory project documents:

- `PROJECT_REQUIREMENTS.md` records treasurer-only idempotent processing and
  non-paying state semantics;
- `ARCHITECTURE_AND_CODING_DESIGN.md` records the process service, mandate-reader
  port and compare-and-set persistence; and
- `PROJECT_STATUS.md` marks process integration complete while leaving review
  actions, authentication and signing pending.

## Deferred work

- wallet-signature or session authentication;
- treasurer review approve/reject/request-correction actions;
- private-key storage and service-wallet construction;
- Sui transaction building, signing, broadcasting and finality;
- payment retry and reconciliation;
- decision versioning or reevaluation against changed mandates; and
- frontend replacement of remaining mock policy/payment behavior.
