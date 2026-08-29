# Backend Receipt Integration Design

## Goal

Replace the simulated receipt backend with a tested server-side vertical slice that analyzes a private receipt with Gemini, detects event-scoped exact duplicates, stores the receipt privately in Supabase, persists a claim, and lists claims for the existing frontend.

This increment deliberately stops before deterministic policy evaluation, human review actions, agent-wallet signing, or Sui payment execution.

## Existing contracts and ownership

The implementation follows the team repository rather than copying the standalone prototype verbatim:

- `packages/shared/src/claims.ts` remains authoritative for `Amount`, `ExpenseCategory`, `ReceiptAnalysis`, `Claim`, and claim states.
- `packages/shared/src/api.ts` remains authoritative for the analyze, create-claim, and list-claims responses.
- Amounts are positive USDC base-unit decimal strings, never JavaScript floating-point values.
- Categories are `food`, `printing`, `transport`, `venue`, `materials`, and `other`.
- Backend code stays under Lim Wey Cheng's owned paths: `packages/web/src/server/**` and `packages/web/src/app/api/**`.
- This slice does not modify Move code, `packages/sui-integration/**`, or frontend components.

Shared configuration and project documentation will change only where required for dependencies, environment names, migration commands, and truthful status reporting.

## Architecture

The backend is divided into focused units:

1. Receipt-domain modules validate Gemini output, calculate SHA-256 from original bytes, normalize values to shared types, and coordinate analysis.
2. A server-only Supabase client reads privileged credentials from environment variables and is never imported into client components.
3. A receipt store owns private object upload and short-lived signed URL creation.
4. A claim repository owns event-scoped duplicate lookup, membership checks, claim insertion, and row-to-domain mapping.
5. Application services coordinate those units without depending on Next.js request objects.
6. Thin Next.js route handlers parse HTTP input, call services, and map known failures to stable `ApiError` responses.

This separation keeps Gemini, Supabase, HTTP, and Sui boundaries independently testable. The API routes do not construct transactions and do not import private-key code.

## Database model

A timestamped Supabase migration creates:

### `events`

Stores the event name, organisation, treasurer wallet, Sui mandate object ID, allowed categories, lifecycle dates, and timestamps. Wallet and object identifiers use canonical 32-byte Sui hex validation.

### `event_members`

Stores event-scoped wallet membership and display names. Its composite primary key is `(event_id, wallet_address)`.

### `claims`

Stores the claimant wallet, private receipt object path, receipt SHA-256, fuzzy key, merchant, positive base-unit amount, currency, receipt date, category, description, validated receipt-analysis JSON, shared claim state, optional decision/payment JSON, and timestamps.

The composite foreign key `(event_id, claimant_wallet)` requires every claimant to be a registered member. The unique `(event_id, receipt_sha256)` constraint prevents an exact duplicate within one event while allowing the same bytes in another event. Receipt object paths are globally unique.

### Private storage

The migration creates or updates the `receipts` bucket as private, limits files to 10 MiB, and allows JPEG, PNG, and WebP. No browser-facing storage policy is created.

All application tables enable Row Level Security with no `anon` or `authenticated` policies. Browser-facing roles lose direct table privileges. The server secret key is the only application database/storage credential for this increment.

## Receipt analysis flow

`POST /api/receipts/analyze` accepts multipart form data containing:

- `receipt`: one JPEG, PNG, or WebP image up to 10 MiB;
- `eventId`: the target event UUID;
- `submitter`: the claimed canonical Sui wallet address.

The route performs this sequence:

1. Validate form fields, MIME type, and size.
2. Calculate SHA-256 from the original bytes.
3. Look up the same hash within the event.
4. If found, return the existing validated analysis, storage path, and `duplicateOf` claim ID without uploading or calling Gemini again.
5. Otherwise call Gemini with inline image data and a strict structured-output schema.
6. Validate and normalize the response to the existing `ReceiptAnalysis` type.
7. Upload the original bytes to a server-generated private path under the event.
8. Return the analysis, storage path, and `duplicateOf: null`.

Gemini output is untrusted. Unknown properties, malformed dates/currencies, invalid confidence, unsupported categories, and inconsistent uncertainty metadata fail closed.

The API does not expose a confidence percentage to the DOM. Confidence remains in the server/API model only for the later policy-routing increment.

## Claim persistence flow

`POST /api/claims` accepts the existing `CreateClaimRequest` contract. The service:

1. Validates the request against shared amount, category, address, date, and analysis rules.
2. Requires the submitter to be an active member of the event through the database foreign key.
3. Requires the request's receipt hash and storage path to match the analyzed values.
4. Inserts the claim in `submitted` state.
5. Maps database values back to the existing JSON-safe `Claim` type.

The database unique constraint remains the final race-safe duplicate check. A duplicate insert returns HTTP 409 rather than creating another reimbursement candidate.

`GET /api/events/:id/claims` returns the existing `ListClaimsResponse`. It maps rows to `Claim` values and creates short-lived signed receipt URLs only after the server has selected claims belonging to that event.

## Authentication boundary

The current repository has no wallet-signature authentication. This hackathon slice therefore treats the submitted wallet address as a demo identity, verifies that it belongs to the event, and keeps all privileged credentials off the browser. This is not production authentication and will be recorded as a known limitation.

Wallet signature verification must be added before any production use or before these endpoints can authorize real funds. The later payment-orchestration slice must re-authenticate the requester and rerun deterministic policy checks before signing.

## Error handling

Routes return JSON matching `ApiError` with stable error keys:

- `invalid_request` — malformed form data or claim input, HTTP 400;
- `unsupported_receipt` — invalid MIME type or excessive size, HTTP 415 or 413;
- `event_not_found` — unknown event, HTTP 404;
- `member_not_found` — wallet is not an active event member, HTTP 403;
- `duplicate_receipt` — race-safe duplicate claim insertion, HTTP 409;
- `analysis_failed` — Gemini output or upstream analysis failure, HTTP 422 or 502;
- `storage_failed` and `database_failed` — sanitized server failures, HTTP 500.

No response or log includes Gemini keys, Supabase secret keys, private receipt bytes, or agent private keys.

## Testing strategy

### Unit tests

- Receipt schema tests cover valid normalization and invalid structured output.
- Hash tests use real byte arrays and verify event-scoped duplicate keys.
- Gemini adapter tests use a fake model client at the network boundary.
- Analysis-service tests use fake repository and storage ports.
- Claim-service tests cover valid persistence, membership failure, and duplicate mapping.
- HTTP parser/route tests cover multipart validation and stable error responses without real credentials.

Every new production behavior is introduced through a failing test first.

### Database tests

A transaction-wrapped pgTAP suite verifies tables, shared enum constraints, canonical addresses, positive integer amounts, membership ownership, event-scoped duplicate hashes, private storage configuration, Row Level Security, browser-role denial, and server-role access.

### Repository gate

The completed branch must pass:

- root production build;
- root TypeScript checks;
- all existing and new Vitest tests;
- clean migration application and pgTAP tests;
- Supabase public-schema linting;
- npm audit at high severity;
- secret and attribution scans.

## Deployment boundary

The pull request contains code, migration, tests, and setup documentation. Applying the migration to the hosted Supabase project requires Lim's authenticated Supabase CLI session and project reference. Hosted RLS, table privileges, private-bucket behavior, and signed URLs must be verified before the frontend switches from mocks.

## Definition of done

This increment is complete when:

- a synthetic private receipt can be analyzed through the server API;
- an exact duplicate in the same event is identified without another upload;
- a valid member claim persists with the existing shared `Claim` contract;
- an outsider and a duplicate claim fail closed;
- event claims can be listed with short-lived signed receipt URLs;
- no direct browser database or storage access is introduced;
- repository, database, security, and attribution checks pass;
- the integration branch is pushed for team review without modifying teammates' owned implementation paths.
