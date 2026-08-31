# Claim Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a treasurer-only, idempotent process endpoint that reads the live Sui mandate, evaluates a submitted claim, and atomically persists its decision and next state without sending payment.

**Architecture:** Extend the existing shared API and injected backend service pattern. A claim-process service coordinates a Supabase repository port, a read-only Sui mandate port, and the pure policy evaluator; compare-and-set persistence prevents concurrent decisions from diverging.

**Tech Stack:** TypeScript 5.9, Next.js 16 route handlers, Zod 4, Supabase/PostgREST, Sui gRPC integration, Vitest 4, `@tali/shared` contracts.

---

## File structure

- Modify `packages/shared/src/api.ts` and `packages/shared/src/index.ts`: export the process request contract.
- Modify `packages/web/src/server/errors.ts`: add stable processing error codes.
- Modify `packages/web/src/server/claims/validation.ts`: validate claim IDs and process inputs.
- Modify `packages/web/src/server/claims/ports.ts`: define process context, atomic-save result, and mandate-reader ports.
- Create `packages/web/src/server/sui/mandate-reader.ts`: adapt existing Sui read functions to `MandateReader`.
- Create `packages/web/src/server/sui/mandate-reader.test.ts`: verify JSON-safe mapping and failure propagation.
- Modify `packages/web/src/server/claims/services.ts` and `.test.ts`: implement/test authorization, idempotency, evaluation, state mapping and sanitized errors.
- Modify `packages/web/src/server/supabase/claim-repository.ts` and `.test.ts`: load joined process context and perform compare-and-set persistence.
- Create `packages/web/src/app/api/claims/[id]/process/route.ts` and `.test.ts`: add the thin guarded API handler.
- Modify `packages/web/src/server/dependencies.ts`: compose the process service and read-only Sui adapter.
- Modify `PROJECT_REQUIREMENTS.md`, `ARCHITECTURE_AND_CODING_DESIGN.md`, and `PROJECT_STATUS.md`: keep mandatory project documentation current.

### Task 1: Add processing contracts and validation

**Files:**
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/web/src/server/errors.ts`
- Modify: `packages/web/src/server/claims/validation.ts`
- Modify: `packages/web/src/server/claims/services.test.ts`

- [ ] **Step 1: Write a failing validation/service test**

Add a test importing `createProcessClaimService`, passing a malformed claim ID and processor, and asserting `invalid_request` before repository access. This establishes the desired service input:

```ts
const processClaim = createProcessClaimService({
  claims,
  mandates: { read: vi.fn() },
  now: () => NOW_MS,
});

await expect(
  processClaim({ claimId: 'bad', processor: 'bad' }),
).rejects.toMatchObject({ code: 'invalid_request', status: 400 });
expect(claims.getProcessContext).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the focused service test and verify the missing export failure**

Run:

```powershell
npx.cmd vitest run --root packages/web src/server/claims/services.test.ts
```

Expected: FAIL because `createProcessClaimService` and the new port members do not exist.

- [ ] **Step 3: Add the shared request and server types**

Add to `packages/shared/src/api.ts`:

```ts
export interface ProcessClaimRequest {
  processor: Address;
}
```

Export `ProcessClaimRequest` from `packages/shared/src/index.ts`. Add
`processor_forbidden`, `claim_not_found`, `processing_conflict`, and
`mandate_read_failed` to `ServerErrorCode`.

In `validation.ts`, export `claimIdSchema = z.string().uuid()` and:

```ts
const processClaimInputSchema = z.object({
  claimId: claimIdSchema,
  processor: suiAddressSchema,
}).strict();

export function parseProcessClaimInput(input: unknown) {
  return processClaimInputSchema.parse(input);
}
```

- [ ] **Step 4: Define process and mandate ports**

In `ports.ts`, add:

```ts
export interface ClaimProcessContext {
  claim: Claim;
  event: PolicyEventSnapshot & {
    treasurer: Address;
    mandateId: ObjectId;
  };
}

export type ProcessedClaimState = 'approved' | 'awaiting_review' | 'rejected';

export type SaveDecisionResult =
  | { status: 'saved'; claim: Claim }
  | { status: 'lost_race'; claim: Claim };

export interface MandateReader {
  read(mandateId: ObjectId): Promise<MandateView>;
}
```

Extend `ClaimRepository` with `getProcessContext(claimId)` and
`saveDecision({ claimId, decision, state })` using these types.

- [ ] **Step 5: Add the minimum service export that validates input**

Create `createProcessClaimService` in `services.ts`, parse with
`parseProcessClaimInput`, translate Zod failures to `invalid_request`, and leave
valid orchestration for Task 3.

- [ ] **Step 6: Run typecheck and focused test, then commit**

```powershell
npm.cmd run build -w @tali/shared
npm.cmd run typecheck -w @tali/web
npx.cmd vitest run --root packages/web src/server/claims/services.test.ts
git add -- packages/shared/src/api.ts packages/shared/src/index.ts packages/web/src/server/errors.ts packages/web/src/server/claims/validation.ts packages/web/src/server/claims/ports.ts packages/web/src/server/claims/services.ts packages/web/src/server/claims/services.test.ts
git commit -m "feat: add claim processing contracts"
```

### Task 2: Add the read-only Sui mandate adapter

**Files:**
- Create: `packages/web/src/server/sui/mandate-reader.test.ts`
- Create: `packages/web/src/server/sui/mandate-reader.ts`

- [ ] **Step 1: Write the failing adapter test**

Use a fake `getObject` client returning a mandate JSON object from the configured
Tali package. Assert `reader.read(id)` returns a `MandateView` with decimal-string
amounts and the injected `fetchedAtMs`. Add a second test asserting an invalid Sui
response rejects without being converted into an API response at this adapter.

- [ ] **Step 2: Run the adapter test and confirm the missing-module failure**

```powershell
npx.cmd vitest run --root packages/web src/server/sui/mandate-reader.test.ts
```

- [ ] **Step 3: Implement the adapter**

Create:

```ts
export function createSuiMandateReader(options?: {
  client?: Pick<ReturnType<typeof createTestnetClient>, 'getObject'>;
  config?: TreasuryConfig;
  now?: () => number;
}): MandateReader {
  const client = options?.client ?? createTestnetClient(process.env.SUI_GRPC_URL);
  const config = options?.config ?? taliTestnetUsdcConfig;
  const now = options?.now ?? Date.now;

  return {
    async read(mandateId) {
      return toMandateView(
        await readMandate(client, config, mandateId),
        now(),
      );
    },
  };
}
```

- [ ] **Step 4: Run the adapter tests and commit**

```powershell
npx.cmd vitest run --root packages/web src/server/sui/mandate-reader.test.ts
git add -- packages/web/src/server/sui/mandate-reader.ts packages/web/src/server/sui/mandate-reader.test.ts
git commit -m "feat: add read-only Sui mandate adapter"
```

### Task 3: Implement process-service behavior

**Files:**
- Modify: `packages/web/src/server/claims/services.test.ts`
- Modify: `packages/web/src/server/claims/services.ts`

- [ ] **Step 1: Add authorization and idempotency tests**

Create reusable claim, event and mandate fixtures. Assert a processor different
from `event.treasurer` receives `processor_forbidden` before `mandates.read` or
`claims.saveDecision`. Assert an existing `claim.decision` returns the stored
claim/decision and `payment: null` without reading Sui.

- [ ] **Step 2: Run focused tests and verify orchestration failures**

Expected: new tests fail because valid service inputs do not yet orchestrate.

- [ ] **Step 3: Implement authorization and idempotency**

Load `getProcessContext`, compare lowercase canonical processor/treasurer values,
return an existing decision unchanged, and reject an undecided non-`submitted`
claim with `processing_conflict`.

- [ ] **Step 4: Add failing outcome-mapping tests**

For each evaluator outcome, provide snapshots that naturally cause `auto_pay`,
`review`, or `reject`. Assert `saveDecision` receives respectively `approved`,
`awaiting_review`, or `rejected`, and the response uses the stored decision with
`payment: null`.

- [ ] **Step 5: Implement live read, evaluation and state mapping**

Call `mandates.read(context.event.mandateId)`, require the returned ID to match,
then call:

```ts
evaluatePolicy({
  claim: context.claim,
  event: context.event,
  mandate,
  exactDuplicate: false,
  nowMs: deps.now?.() ?? Date.now(),
});
```

Map the outcome with an exhaustive `Record<PolicyOutcome, ProcessedClaimState>`.
Persist through `saveDecision` and require its returned claim to contain a decision.

- [ ] **Step 6: Add failure and lost-race tests**

Test mandate ID mismatch, Sui read failure, repository failures, an undecided
lost-race result, and a winning stored race decision. Assert Sui errors become
`mandate_read_failed`, database errors remain `database_failed`, and raw causes do
not appear in messages.

- [ ] **Step 7: Implement sanitized failure translation and run tests**

Use `databaseError` for repository calls and a new safe `mandate_read_failed`
wrapper for mandate calls. A lost-race claim with no decision becomes
`processing_conflict`.

```powershell
npx.cmd vitest run --root packages/web src/server/claims/services.test.ts
git add -- packages/web/src/server/claims/services.ts packages/web/src/server/claims/services.test.ts
git commit -m "feat: process claims through policy evaluation"
```

### Task 4: Add Supabase process context and compare-and-set persistence

**Files:**
- Modify: `packages/web/src/server/supabase/claim-repository.test.ts`
- Modify: `packages/web/src/server/supabase/claim-repository.ts`

- [ ] **Step 1: Extend the scripted query client for update assertions**

Add `update`, `is`, and captured filter support. Allow sequenced `maybeSingle`
results so a zero-row compare-and-set can be followed by a reload.

- [ ] **Step 2: Write a failing process-context mapping test**

Return a claim row joined with:

```ts
events: {
  treasurer_wallet: treasurer,
  mandate_object_id: mandateId,
  allowed_categories: ['printing'],
  starts_at: '2026-08-29T00:00:00.000Z',
  expires_at: '2026-09-05T23:59:59.000Z',
}
```

Assert canonical field mapping and finite event timestamps. Add missing-claim and
malformed-event timestamp cases.

- [ ] **Step 3: Implement `getProcessContext`**

Add a `PROCESS_COLUMNS` select joining `events`, map object-or-array relation
shapes, and return `claim_not_found` when PostgREST returns no row.

- [ ] **Step 4: Write failing atomic-save tests**

Assert the update payload contains only `decision` and mapped `state`, filters
include claim ID, `state = submitted`, and `decision IS NULL`, and a returned row
produces `{ status: 'saved', claim }`. Add zero-row reload tests for a stored race
winner and an undecided conflict.

- [ ] **Step 5: Implement `saveDecision`**

Add `update` and `is` to the local query-builder interface. Execute the
compare-and-set update with `.select(CLAIM_COLUMNS).maybeSingle()`. When it returns
no row, call the internal process-context loader: return `lost_race` only when its
claim has a decision; otherwise throw `processing_conflict`.

- [ ] **Step 6: Run repository and service tests, then commit**

```powershell
npx.cmd vitest run --root packages/web src/server/supabase/claim-repository.test.ts src/server/claims/services.test.ts
git add -- packages/web/src/server/supabase/claim-repository.ts packages/web/src/server/supabase/claim-repository.test.ts
git commit -m "feat: persist policy decisions atomically"
```

### Task 5: Add the process route and production composition

**Files:**
- Create: `packages/web/src/app/api/claims/[id]/process/route.test.ts`
- Create: `packages/web/src/app/api/claims/[id]/process/route.ts`
- Modify: `packages/web/src/server/dependencies.ts`

- [ ] **Step 1: Write failing route tests**

Test valid JSON forwarding as `{ claimId, processor }`, malformed JSON, missing
processor, and service error mapping. Use a promised route context matching the
existing dynamic-route tests.

- [ ] **Step 2: Run the route test and confirm the missing-module failure**

```powershell
npx.cmd vitest run --root packages/web src/app/api/claims/[id]/process/route.test.ts
```

- [ ] **Step 3: Implement the thin route**

Export a `createProcessClaimHandler(service)` test seam. Parse JSON, extract
`processor`, await `context.params`, call the service, and return JSON. The
production `POST` must call `requireDemoIdentityEnabled()` before resolving
`getBackendServices().processClaim`.

- [ ] **Step 4: Compose production dependencies**

Create one `MandateReader`, expose `processClaim` on `BackendServices`, and inject
the same claim repository plus mandate reader into `createProcessClaimService`.
Do not import transaction builders, keypairs or signing APIs.

- [ ] **Step 5: Run route, server and type tests, then commit**

```powershell
npx.cmd vitest run --root packages/web src/app/api/claims/[id]/process/route.test.ts src/server
npm.cmd run typecheck
git add -- packages/web/src/app/api/claims/[id]/process/route.ts packages/web/src/app/api/claims/[id]/process/route.test.ts packages/web/src/server/dependencies.ts
git commit -m "feat: expose non-paying claim process endpoint"
```

### Task 6: Update mandatory documentation and verify

**Files:**
- Modify: `PROJECT_REQUIREMENTS.md`
- Modify: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Update all three project documents**

Record treasurer-only demo processing, idempotency, live read-only mandate access,
outcome-to-state mapping, compare-and-set persistence, `payment: null`, and the
continued absence of authentication and signing.

- [ ] **Step 2: Run fresh full verification**

```powershell
git diff --check
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
```

Expected: every command exits zero with no test failures or high-severity audit
findings.

- [ ] **Step 3: Scan branch scope and credentials**

```powershell
git diff --name-only codex/policy-engine...HEAD
git status --short --branch
```

Confirm only the approved processing files and mandatory docs changed, and no
credential-like value appears in changed files.

- [ ] **Step 4: Commit documentation**

```powershell
git add -- PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md
git commit -m "docs: record claim processing integration"
```

- [ ] **Step 5: Re-run diff check and final status**

```powershell
git diff --check codex/policy-engine...HEAD
git status --short --branch
```

Expected: no diff-check errors and a clean worktree.
