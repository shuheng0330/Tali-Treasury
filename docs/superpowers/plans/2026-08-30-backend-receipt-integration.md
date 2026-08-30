# Backend Receipt Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a server-only receipt and Supabase vertical slice that analyzes private receipt images, identifies event-scoped exact duplicates, persists member claims, and lists claims through the team's existing API contracts.

**Architecture:** Focused receipt-domain modules feed injected application services. Supabase adapters own privileged storage/database operations, while thin Next.js App Router handlers translate HTTP requests into service calls and stable `ApiError` responses. The implementation reuses `@tali/shared` types and does not enter policy or Sui-signing scope.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Zod, Google Gen AI SDK, Supabase JS, PostgreSQL, pgTAP, npm workspaces.

---

## File map

- `package.json`, `package-lock.json`: root database scripts and pinned Supabase CLI.
- `packages/web/package.json`: server dependencies and Vitest script.
- `packages/web/src/server/receipts/schema.ts`: strict Gemini-response normalization into `ReceiptAnalysis`.
- `packages/web/src/server/receipts/hash.ts`: SHA-256 and event-scoped duplicate key.
- `packages/web/src/server/receipts/gemini.ts`: structured-output Gemini adapter.
- `packages/web/src/server/receipts/*.test.ts`: receipt-domain behavior.
- `packages/web/src/server/errors.ts`: typed application errors and safe API mapping.
- `packages/web/src/server/claims/validation.ts`: `CreateClaimRequest` validation.
- `packages/web/src/server/claims/ports.ts`: repository, storage, and analyzer interfaces.
- `packages/web/src/server/claims/services.ts`: analyze, create, and list use cases.
- `packages/web/src/server/claims/services.test.ts`: injected-service tests.
- `packages/web/src/server/supabase/client.ts`: server-only Supabase client construction.
- `packages/web/src/server/supabase/claim-repository.ts`: database operations and row mapping.
- `packages/web/src/server/supabase/receipt-store.ts`: private upload and signed URLs.
- `packages/web/src/server/dependencies.ts`: production dependency composition.
- `packages/web/src/app/api/receipts/analyze/route.ts`: multipart analyze endpoint.
- `packages/web/src/app/api/claims/route.ts`: create-claim endpoint.
- `packages/web/src/app/api/events/[id]/claims/route.ts`: list-claims endpoint.
- `packages/web/src/app/api/**/*.test.ts`: route input/error contracts.
- `supabase/migrations/20260830000000_backend_receipt_schema.sql`: tables, constraints, privileges, trigger, private bucket.
- `supabase/tests/database/backend_receipt_schema.test.sql`: pgTAP database behavior.
- `.env.example`, `README.md`, `docs/PROGRESS.md`: setup and truthful integration status.
- `PROJECT_REQUIREMENTS.md`, `ARCHITECTURE_AND_CODING_DESIGN.md`, `PROJECT_STATUS.md`: mandatory project documentation.

### Task 1: Add integration tooling

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/web/package.json`

- [x] **Step 1: Add pinned dependencies**

Run:

```powershell
npm.cmd install --save-dev supabase@2.116.0
npm.cmd install -w @tali/web @google/genai@2.19.0 @supabase/supabase-js@2.57.4 zod@4.4.3
npm.cmd install --save-dev -w @tali/web vitest@4.1.11 vite@8.2.2
```

- [x] **Step 2: Add scripts**

Root scripts:

```json
"test": "npm run build -w @tali/shared && npm run test --workspaces --if-present",
"supabase:start": "supabase start",
"supabase:stop": "supabase stop",
"supabase:reset": "supabase db reset",
"supabase:test": "supabase test db"
```

Web scripts:

```json
"test": "vitest run src/server src/app/api"
```

- [x] **Step 3: Verify dependency resolution**

Run:

```powershell
npm.cmd install
npm.cmd exec supabase -- --version
```

Expected: clean install and Supabase CLI `2.116.0`.

- [x] **Step 4: Commit tooling**

```powershell
git add package.json package-lock.json packages/web/package.json
git commit -m "chore: add backend integration tooling"
```

### Task 2: Port receipt-domain behavior with TDD

**Files:**
- Create: `packages/web/src/server/receipts/schema.test.ts`
- Create: `packages/web/src/server/receipts/schema.ts`
- Create: `packages/web/src/server/receipts/hash.test.ts`
- Create: `packages/web/src/server/receipts/hash.ts`
- Create: `packages/web/src/server/receipts/gemini.test.ts`
- Create: `packages/web/src/server/receipts/gemini.ts`

- [x] **Step 1: Write failing schema tests**

Tests must assert that this Gemini-shaped input:

```ts
{
  merchant: ' Campus Print Shop ',
  amount: '4.50',
  currency: 'myr',
  receiptDate: '2026-08-30',
  category: 'printing',
  confidence: 0.96,
  uncertainFields: [],
  warnings: []
}
```

normalizes to the existing `ReceiptAnalysis` contract with amount `'4500000'`, uppercase currency, a supplied receipt hash/fuzzy key, and trimmed strings. Add independent rejection cases for zero/negative/more-than-two-decimal amounts, invalid dates, unsupported shared categories, confidence outside `0..1`, unknown properties, and uncertainty fields inconsistent with null values.

- [x] **Step 2: Verify schema tests fail because the module is missing**

```powershell
npm.cmd test -w @tali/web -- src/server/receipts/schema.test.ts
```

- [x] **Step 3: Implement strict schema normalization**

Export:

```ts
export interface ParsedReceiptFields {
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  receiptDate: string | null;
  category: ExpenseCategory | null;
  confidence: number;
  uncertainFields: UncertainField[];
  warnings: string[];
}

export function parseGeminiReceiptFields(input: unknown): ParsedReceiptFields;
export function toReceiptAnalysis(
  fields: ParsedReceiptFields,
  receiptHash: string,
): ReceiptAnalysis;
```

Convert a two-decimal displayed amount to six-decimal USDC base units using string/`BigInt` arithmetic. Build `fuzzyKey` from normalized merchant, receipt date, and base-unit amount. Never use `Number` for the amount.

- [x] **Step 4: Run schema tests to green**

```powershell
npm.cmd test -w @tali/web -- src/server/receipts/schema.test.ts
```

- [x] **Step 5: Write failing hash tests**

Assert real SHA-256 output for `hello`, rejection of empty bytes, validation of lowercase 64-character digests, and different duplicate keys for the same hash in two event UUIDs.

- [x] **Step 6: Implement hashing**

Export:

```ts
export function hashReceipt(bytes: Uint8Array): string;
export function createReceiptDuplicateKey(eventId: string, hash: string): string;
```

- [x] **Step 7: Run hash tests to green**

```powershell
npm.cmd test -w @tali/web -- src/server/receipts/hash.test.ts
```

- [x] **Step 8: Write failing Gemini adapter tests**

Use an injected `GeminiModelClient` to assert inline base64 image bytes, allowed MIME types, 10 MiB maximum, strict JSON schema, the selected model, empty/invalid response rejection, and no network call for invalid images.

- [x] **Step 9: Implement the Gemini adapter**

Export:

```ts
export type ReceiptImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export interface ReceiptImage { bytes: Uint8Array; mimeType: string }
export interface ReceiptAnalyzer { analyze(image: ReceiptImage): Promise<ParsedReceiptFields> }
export function createGeminiReceiptAnalyzer(options: {
  client: GeminiModelClient;
  model: string;
}): ReceiptAnalyzer;
export function createGoogleGeminiReceiptAnalyzer(options: {
  apiKey: string;
  model: string;
}): ReceiptAnalyzer;
```

- [x] **Step 10: Run receipt tests and commit**

```powershell
npm.cmd test -w @tali/web -- src/server/receipts
git add packages/web/src/server/receipts
git commit -m "feat: add receipt analysis domain"
```

### Task 3: Add the secure Supabase schema test-first

**Files:**
- Create: `supabase/tests/database/backend_receipt_schema.test.sql`
- Create: `supabase/migrations/20260830000000_backend_receipt_schema.sql`
- Create: `supabase/config.toml`

- [x] **Step 1: Write the failing pgTAP suite**

Use a transaction and `pg_temp.capture_sqlstate(text)` helper. Plan assertions for:

```text
events/event_members/claims tables
RLS enabled and zero browser policies
anon/authenticated read denial
service_role table access
private receipts bucket, 10 MiB, three MIME types
canonical Sui addresses and object IDs
trimmed event/member/merchant values
valid shared categories and claim states
positive integer base-unit amount
valid SHA-256 and receipt-analysis JSON object
active membership foreign key
same-event duplicate rejection
cross-event identical hash acceptance
updated_at trigger
```

- [x] **Step 2: Verify RED against a clean database**

Run the suite against the local Supabase PostgreSQL service and confirm it fails because the three public tables do not exist, not because pgTAP or SQL syntax is broken.

- [x] **Step 3: Implement the migration**

Create `events`, `event_members`, and `claims` using the exact shared categories and states. Store amounts as `numeric(30,0)` with `amount > 0` and map them to strings in TypeScript. Store analysis/decision/payment as JSONB. Add composite membership and event-hash constraints, timestamp triggers, RLS, privilege revocations, explicit `service_role` grants, and a private `storage.buckets` row for `receipts`.

- [x] **Step 4: Verify GREEN and lint**

```powershell
npm.cmd run supabase:reset
npm.cmd run supabase:test
npm.cmd exec supabase -- db lint --local --schema public --level warning --fail-on warning
```

If the workstation cannot download optional services, recreate a temporary database inside the pinned Supabase PostgreSQL container, apply the migration with `psql`, run the unchanged pgTAP file, and record that environment exception in `PROJECT_STATUS.md`.

- [x] **Step 5: Commit database behavior**

```powershell
git add supabase
git commit -m "feat: add backend receipt database schema"
```

### Task 4: Implement application services with injected ports

**Files:**
- Create: `packages/web/src/server/errors.ts`
- Create: `packages/web/src/server/claims/validation.ts`
- Create: `packages/web/src/server/claims/ports.ts`
- Create: `packages/web/src/server/claims/services.test.ts`
- Create: `packages/web/src/server/claims/services.ts`

- [x] **Step 1: Write failing service tests**

Use in-memory fakes for these ports:

```ts
export interface ClaimRepository {
  assertActiveMember(eventId: string, submitter: Address): Promise<void>;
  findDuplicateReceipt(eventId: string, receiptHash: string): Promise<DuplicateReceipt | null>;
  create(input: CreateClaimRequest): Promise<Claim>;
  listByEvent(eventId: string): Promise<StoredClaim[]>;
}

export interface DuplicateReceipt {
  claimId: string;
  analysis: ReceiptAnalysis;
  storagePath: string;
}

export interface StoredClaim {
  claim: Claim;
  storagePath: string;
}

export interface ReceiptStore {
  upload(input: { eventId: string; bytes: Uint8Array; mimeType: ReceiptImageMimeType }): Promise<string>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}
```

Test: inactive/non-member analysis fails before Gemini/upload; duplicate analysis skips Gemini/upload; new analysis hashes, analyzes, and uploads; valid claim persists; invalid claim fails before repository access; duplicate repository failure maps to `duplicate_receipt`; listing signs only selected claim paths.

- [x] **Step 2: Verify RED**

```powershell
npm.cmd test -w @tali/web -- src/server/claims/services.test.ts
```

- [x] **Step 3: Implement errors, validation, and services**

Export `ServerError` with `code`, `status`, safe `message`, and optional `cause`. Implement:

```ts
export function createAnalyzeReceiptService(deps: {
  analyzer: ReceiptAnalyzer;
  claims: ClaimRepository;
  receipts: ReceiptStore;
}): (input: AnalyzeReceiptInput) => Promise<AnalyzeReceiptResponse>;

export function createClaimService(deps: {
  claims: ClaimRepository;
}): (input: unknown) => Promise<CreateClaimResponse>;

export function createListClaimsService(deps: {
  claims: ClaimRepository;
  receipts: ReceiptStore;
}): (eventId: string) => Promise<ListClaimsResponse>;
```

- [x] **Step 4: Run service tests to green and commit**

```powershell
npm.cmd test -w @tali/web -- src/server/claims
git add packages/web/src/server/errors.ts packages/web/src/server/claims
git commit -m "feat: add receipt claim services"
```

### Task 5: Implement Supabase adapters

**Files:**
- Create: `packages/web/src/server/supabase/client.test.ts`
- Create: `packages/web/src/server/supabase/client.ts`
- Create: `packages/web/src/server/supabase/claim-repository.test.ts`
- Create: `packages/web/src/server/supabase/claim-repository.ts`
- Create: `packages/web/src/server/supabase/receipt-store.test.ts`
- Create: `packages/web/src/server/supabase/receipt-store.ts`

- [x] **Step 1: Write failing adapter tests**

Assert that client construction rejects missing URL/secret and disables session persistence. Use a narrow fake Supabase query/storage surface to test row mapping, Postgres `23505` duplicate mapping, `23503` membership mapping, private upload options, sanitized upload errors, and 300-second signed URLs.

- [x] **Step 2: Verify RED**

```powershell
npm.cmd test -w @tali/web -- src/server/supabase
```

- [x] **Step 3: Implement adapters**

`createServerSupabaseClient` reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, falling back to `SUPABASE_SERVICE_ROLE_KEY` for the team's existing environment during migration. It must use `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }`.

The repository maps numeric/timestamp/JSON values to the existing `Claim` contract and never exposes `receipt_object_path` as a public URL. The storage adapter always targets `SUPABASE_RECEIPT_BUCKET ?? 'receipts'` with `upsert: false`.

- [x] **Step 4: Run adapter tests and commit**

```powershell
npm.cmd test -w @tali/web -- src/server/supabase
git add packages/web/src/server/supabase
git commit -m "feat: add Supabase receipt adapters"
```

### Task 6: Add thin Next.js API routes

**Files:**
- Create: `packages/web/src/server/dependencies.ts`
- Create: `packages/web/src/app/api/receipts/analyze/route.test.ts`
- Create: `packages/web/src/app/api/receipts/analyze/route.ts`
- Create: `packages/web/src/app/api/claims/route.test.ts`
- Create: `packages/web/src/app/api/claims/route.ts`
- Create: `packages/web/src/app/api/events/[id]/claims/route.test.ts`
- Create: `packages/web/src/app/api/events/[id]/claims/route.ts`

- [x] **Step 1: Write failing route tests**

Inject service functions through exported handler factories. Test missing/invalid multipart fields, JSON validation, dynamic event ID forwarding, success response shapes, and `ServerError` to `ApiError` status mapping. Unexpected errors must return `database_failed`/500 without the original secret-bearing message.

- [x] **Step 2: Verify RED**

```powershell
npm.cmd test -w @tali/web -- src/app/api
```

- [x] **Step 3: Implement composition and routes**

Each route exports its Next.js handler and a testable factory. Use `export const runtime = 'nodejs'`. The analyze route accepts `receipt`, `eventId`, and `submitter`; create claims accepts JSON; list claims reads `context.params.id`.

- [x] **Step 4: Run API tests, typecheck, and commit**

```powershell
npm.cmd test -w @tali/web -- src/app/api
npm.cmd run typecheck
git add packages/web/src/server/dependencies.ts packages/web/src/app/api
git commit -m "feat: expose receipt claim APIs"
```

### Task 7: Update environment and mandatory documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/PROGRESS.md`
- Create: `PROJECT_REQUIREMENTS.md`
- Create: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Create: `PROJECT_STATUS.md`

- [x] **Step 1: Update safe environment placeholders**

Use `SUPABASE_SECRET_KEY=` as the preferred server credential, retain the legacy service-role placeholder during transition, and set `GEMINI_MODEL=gemini-3.5-flash-lite`. No real value may be committed.

- [x] **Step 2: Document setup and verification**

Document local database commands, hosted `supabase login/link/db push`, private-bucket checks, demo-identity limitation, server-only secret handling, and sample multipart/JSON request fields without credentials.

- [x] **Step 3: Update project status truthfully**

Mark backend receipt integration as complete locally only after tests pass. Keep hosted migration, frontend mock replacement, wallet authentication, policy, and signing pending until separately verified.

- [x] **Step 4: Run documentation hygiene and commit**

```powershell
git diff --check
rg -n "^(GEMINI_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|AGENT_PRIVATE_KEY)=[^[:space:]]+" . --glob '.env*' --glob '!node_modules/**' --glob '!.git/**'
git add .env.example README.md docs/PROGRESS.md PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md
git commit -m "docs: document backend receipt integration"
```

Expected: whitespace clean and secret scan returns no matches.

### Task 8: Final verification and pull request

**Files:**
- Verify every file changed above.
- Modify: `docs/superpowers/plans/2026-08-30-backend-receipt-integration.md`

- [x] **Step 1: Run the complete repository gate**

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run typecheck
npm.cmd audit --audit-level=high
git diff --check
git status --short
```

- [x] **Step 2: Recreate and verify the database**

Apply the migration to a clean local database, run the pgTAP suite, and lint only the migration-owned `public` schema. Expected: every assertion passes and no public-schema lint result exists.

- [x] **Step 3: Run security and attribution scans**

```powershell
rg -n "^(GEMINI_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|AGENT_PRIVATE_KEY)=[^[:space:]]+" . --glob '.env*' --glob '!node_modules/**' --glob '!.git/**'
git log --format='%an%n%ae%n%B' origin/main..HEAD | Select-String -Pattern 'claude|anthropic|co-authored|generated with' -CaseSensitive:$false
```

Expected: both scans return no matches.

- [x] **Step 4: Self-review the complete diff**

Compare `origin/main..HEAD` against the approved specification. Fix all critical or important findings and rerun affected verification.

- [x] **Step 5: Record the completed plan**

Mark executed checkboxes, then commit:

```powershell
git add docs/superpowers/plans/2026-08-30-backend-receipt-integration.md
git commit -m "docs: record backend integration plan"
```

- [x] **Step 6: Push and create the pull request**

```powershell
git push --set-upstream origin codex/backend-integration
gh pr create --base main --head codex/backend-integration --title "feat: integrate receipt backend" --body "Adds the private receipt and claim vertical slice. Verification: production build, 72 Vitest tests, 33 pgTAP assertions, typechecks, audit, and security scans."
```

The pull-request description must summarize the vertical slice and verification rather than include AI attribution or unexecuted plan prose.
