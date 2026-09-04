# Payroll and Treasury Write-Route RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an authenticated authorized wallet for payroll execution, mandate revocation, safety attacks, and salary-stream withdrawals before any signing or mutation occurs.

**Architecture:** Add a small server-only employer-authorization helper around the existing exact-origin and wallet-session primitives. Three routes compare the session wallet with `TALI_EMPLOYER_WALLET`; stream withdrawal reads the selected stream and compares the session wallet with its immutable employee. Route handlers remain dependency-injected for tests, and existing chain/service implementations remain unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.9, Zod 4, Supabase-backed wallet sessions, Vitest 4, existing `ServerError`/`ApiError` serialization.

---

## File map

- Create `packages/web/src/server/auth/authorization.ts` — employer configuration validation and reusable employer request authorization.
- Create `packages/web/src/server/auth/authorization.test.ts` — exact-origin, session, configuration, and role tests.
- Modify `packages/web/src/server/errors.ts` — add safe authorization error codes.
- Modify `packages/web/src/app/api/payroll/runs/route.ts` — protect payroll POST while preserving GET behavior.
- Create `packages/web/src/app/api/payroll/runs/route.test.ts` — payroll route authorization and no-side-effect tests.
- Modify `packages/web/src/app/api/mandate/revoke/route.ts` — protect irreversible revocation.
- Create `packages/web/src/app/api/mandate/revoke/route.test.ts` — revoke authorization and typed-confirmation tests.
- Modify `packages/web/src/app/api/safety/attack/route.ts` — protect real gas-spending safety submissions.
- Create `packages/web/src/app/api/safety/attack/route.test.ts` — safety authorization and validation tests.
- Modify `packages/web/src/app/api/streams/[id]/withdraw/route.ts` — enforce stream employee ownership.
- Create `packages/web/src/app/api/streams/[id]/withdraw/route.test.ts` — employee authorization and call-order tests.
- Modify `.env.example` — declare the server-only employer wallet.
- Modify `README.md`, `PROJECT_REQUIREMENTS.md`, `ARCHITECTURE_AND_CODING_DESIGN.md`, `PROJECT_STATUS.md`, and `docs/PROGRESS.md` — record the security boundary, status, and rollout.

---

### Task 1: Add the employer authorization primitive

**Files:**
- Create: `packages/web/src/server/auth/authorization.ts`
- Create: `packages/web/src/server/auth/authorization.test.ts`
- Modify: `packages/web/src/server/errors.ts:3-27`

- [ ] **Step 1: Write failing authorization tests**

Create `packages/web/src/server/auth/authorization.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { authorizeEmployerRequest, requireEmployerWallet } from './authorization';

const employer = `0x${'a'.repeat(64)}`;
const outsider = `0x${'b'.repeat(64)}`;
const origin = 'https://tali-treasury.vercel.app';

function request(requestOrigin = origin) {
  return new Request(`${origin}/api/payroll/runs`, {
    method: 'POST',
    headers: { origin: requestOrigin },
  });
}

describe('requireEmployerWallet', () => {
  it('returns a canonical configured employer address', () => {
    expect(requireEmployerWallet({ TALI_EMPLOYER_WALLET: employer })).toBe(employer);
  });

  it.each([undefined, '', '0x1234', `0x${'A'.repeat(64)}`])(
    'fails closed for malformed configuration %s',
    (value) => {
      expect(() =>
        requireEmployerWallet({ TALI_EMPLOYER_WALLET: value }),
      ).toThrow(expect.objectContaining({
        code: 'authorization_configuration_failed',
        status: 503,
      }));
    },
  );
});

describe('authorizeEmployerRequest', () => {
  it('returns the authenticated configured employer', async () => {
    await expect(
      authorizeEmployerRequest({
        request: request(),
        appOrigin: origin,
        resolveIdentity: vi.fn(async () => employer),
        env: { TALI_EMPLOYER_WALLET: employer },
      }),
    ).resolves.toBe(employer);
  });

  it('rejects another authenticated wallet', async () => {
    await expect(
      authorizeEmployerRequest({
        request: request(),
        appOrigin: origin,
        resolveIdentity: vi.fn(async () => outsider),
        env: { TALI_EMPLOYER_WALLET: employer },
      }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('checks origin before resolving identity', async () => {
    const resolveIdentity = vi.fn(async () => employer);
    await expect(
      authorizeEmployerRequest({
        request: request('https://evil.example'),
        appOrigin: origin,
        resolveIdentity,
        env: { TALI_EMPLOYER_WALLET: employer },
      }),
    ).rejects.toMatchObject({ code: 'origin_forbidden', status: 403 });
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
npm.cmd exec -w @tali/web -- vitest run src/server/auth/authorization.test.ts
```

Expected: FAIL because `./authorization` does not exist.

- [ ] **Step 3: Add the safe server error codes**

Add these members to `ServerErrorCode` in `packages/web/src/server/errors.ts`:

```ts
  | 'forbidden'
  | 'authorization_configuration_failed'
```

- [ ] **Step 4: Implement the minimal authorization helper**

Create `packages/web/src/server/auth/authorization.ts`:

```ts
import { assertSameOrigin } from './session';
import { ServerError } from '../errors';
import type { EnvLike } from '../env';

const CANONICAL_SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export type ResolveRequestIdentity = (request: Request) => Promise<string>;

export function requireEmployerWallet(env: EnvLike = process.env): string {
  const address = env.TALI_EMPLOYER_WALLET?.trim();
  if (!address || !CANONICAL_SUI_ADDRESS.test(address)) {
    throw new ServerError(
      'authorization_configuration_failed',
      503,
      'Authorization configuration is unavailable',
    );
  }
  return address;
}

export function assertAuthorizedWallet(actual: string, expected: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new ServerError(
      'forbidden',
      403,
      'This wallet is not authorized for this action',
    );
  }
}

export async function authorizeEmployerRequest(input: {
  request: Request;
  appOrigin: string;
  resolveIdentity: ResolveRequestIdentity;
  env?: EnvLike;
}): Promise<string> {
  assertSameOrigin(input.request, input.appOrigin);
  const actor = await input.resolveIdentity(input.request);
  assertAuthorizedWallet(actor, requireEmployerWallet(input.env));
  return actor;
}
```

- [ ] **Step 5: Run the authorization tests**

Run the focused command from Step 2.

Expected: all authorization tests PASS.

- [ ] **Step 6: Commit the primitive**

```powershell
git add packages/web/src/server/auth/authorization.ts packages/web/src/server/auth/authorization.test.ts packages/web/src/server/errors.ts
git commit -m "feat: add employer wallet authorization"
```

---

### Task 2: Protect payroll execution

**Files:**
- Modify: `packages/web/src/app/api/payroll/runs/route.ts`
- Create: `packages/web/src/app/api/payroll/runs/route.test.ts`

- [ ] **Step 1: Write failing payroll authorization tests**

Create `packages/web/src/app/api/payroll/runs/route.test.ts`. Use canonical addresses
and the smallest valid wage accepted by `payrollRequestSchema`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { ServerError } from '../../../../server/errors';
import { createPayrollRunsPostHandler } from './route';

const employer = `0x${'a'.repeat(64)}`;
const origin = 'https://tali-treasury.vercel.app';
const payload = {
  employee: `0x${'b'.repeat(64)}`,
  gross: '100000000',
  age: 25,
  citizenship: 'local' as const,
};

function request(requestOrigin = origin) {
  return new Request(`${origin}/api/payroll/runs`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('payroll runs POST authorization', () => {
  it('runs payroll for the configured employer', async () => {
    const run = vi.fn(async () => ({ id: 'run-1' }));
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity: vi.fn(async () => employer),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(201);
    expect(run).toHaveBeenCalledWith(payload);
  });

  it('does not run payroll for another wallet', async () => {
    const run = vi.fn();
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity: vi.fn(async () => `0x${'c'.repeat(64)}`),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
    expect(run).not.toHaveBeenCalled();
  });

  it('does not parse or run after authentication failure', async () => {
    const run = vi.fn();
    const response = await createPayrollRunsPostHandler({
      run,
      resolveIdentity: vi.fn(async () => {
        throw new ServerError('authentication_required', 401, 'A valid wallet session is required');
      }),
      appOrigin: origin,
      env: { TALI_EMPLOYER_WALLET: employer },
    })(request());

    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the payroll route test and verify it fails**

```powershell
npm.cmd exec -w @tali/web -- vitest run src/app/api/payroll/runs/route.test.ts
```

Expected: FAIL because `createPayrollRunsPostHandler` is not exported.

- [ ] **Step 3: Extract the testable POST handler**

In `route.ts`, import `authorizeEmployerRequest`, `resolveWalletIdentity`,
`getBackendServices`, and the `EnvLike`/`PayrollRequest` types. Add:

```ts
export function createPayrollRunsPostHandler(deps: {
  run: (input: PayrollRequest) => Promise<unknown>;
  resolveIdentity: (request: Request) => Promise<string>;
  appOrigin: string;
  env?: EnvLike;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      await authorizeEmployerRequest({
        request,
        appOrigin: deps.appOrigin,
        resolveIdentity: deps.resolveIdentity,
        env: deps.env,
      });

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
      }
      const parsed = payrollRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError(
          'invalid_request',
          400,
          parsed.error.issues[0]?.message ?? 'Invalid payroll request',
        );
      }
      return Response.json(await deps.run(parsed.data), { status: 201 });
    } catch (error) {
      const { body, status } = toApiError(error);
      return Response.json(body, { status });
    }
  };
}
```

Replace only the POST composition with:

```ts
export async function POST(request: Request): Promise<Response> {
  try {
    const services = getBackendServices();
    return createPayrollRunsPostHandler({
      run: (input) => getPayrollService().run(input),
      resolveIdentity: async (currentRequest) =>
        (
          await resolveWalletIdentity({
            request: currentRequest,
            auth: services.auth,
          })
        ).address,
      appOrigin: services.appOrigin,
    })(request);
  } catch (error) {
    const { body, status } = toApiError(error);
    return Response.json(body, { status });
  }
}
```

Remove `requireDemoIdentityEnabled()` from POST. Leave GET unchanged.

- [ ] **Step 4: Run the payroll route and existing payroll tests**

```powershell
npm.cmd exec -w @tali/web -- vitest run src/app/api/payroll/runs/route.test.ts src/server/payroll
```

Expected: PASS; the unauthorized test proves `run` is untouched.

- [ ] **Step 5: Commit payroll authorization**

```powershell
git add packages/web/src/app/api/payroll/runs/route.ts packages/web/src/app/api/payroll/runs/route.test.ts
git commit -m "feat: authorize payroll execution"
```

---

### Task 3: Protect irreversible mandate revocation

**Files:**
- Modify: `packages/web/src/app/api/mandate/revoke/route.ts`
- Create: `packages/web/src/app/api/mandate/revoke/route.test.ts`

- [ ] **Step 1: Write the revoke route tests**

Create a handler test using `confirm: 'Orientation Week'` and
`expected: 'Orientation Week'`. Cover employer success, outsider 403, wrong-origin
403, missing-session 401, configuration 503, and mismatched confirmation 400. In
every non-success case assert `revoke` was not called. The core success assertion is:

```ts
const revoke = vi.fn(async () => ({ status: 'revoked' as const, digest: 'digest' }));
const response = await createRevokeHandler({
  revoke,
  resolveIdentity: vi.fn(async () => employer),
  appOrigin: origin,
  env: { TALI_EMPLOYER_WALLET: employer },
})(request({ confirm: 'Orientation Week', expected: 'Orientation Week' }));

expect(response.status).toBe(200);
expect(revoke).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the test and verify the missing-handler failure**

```powershell
npm.cmd exec -w @tali/web -- vitest run src/app/api/mandate/revoke/route.test.ts
```

Expected: FAIL because `createRevokeHandler` does not exist.

- [ ] **Step 3: Extract and authorize the revoke handler**

Add the injected handler below. Keep the existing schema immediately above it:

```ts
export function createRevokeHandler(deps: {
  revoke: () => Promise<unknown>;
  resolveIdentity: ResolveRequestIdentity;
  appOrigin: string;
  env?: EnvLike;
}) {
  return async function revokeHandler(request: Request): Promise<Response> {
    try {
      await authorizeEmployerRequest({
        request,
        appOrigin: deps.appOrigin,
        resolveIdentity: deps.resolveIdentity,
        env: deps.env,
      });

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
      }

      const parsed = revokeSchema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError('invalid_request', 400, 'A typed confirmation is required');
      }
      if (parsed.data.confirm !== parsed.data.expected) {
        throw new ServerError(
          'invalid_request',
          400,
          'The typed confirmation does not match the event name',
        );
      }

      return Response.json(await deps.revoke());
    } catch (error) {
      const { body: errorBody, status } = toApiError(error);
      return Response.json(errorBody, { status });
    }
  };
}
```

Compose production `POST` with `getRevokePort().revoke(mandateIdForRevocation())`,
`requireAppOrigin()`, and `resolveWalletIdentity({ request, auth: services.auth })`.
Import `EnvLike`, `ResolveRequestIdentity`, `authorizeEmployerRequest`,
`getBackendServices`, and `resolveWalletIdentity` from their existing server modules.

Remove `requireDemoIdentityEnabled()` from POST. Do not change the typed-confirmation
requirements or the existing revoke dependency.

- [ ] **Step 4: Run revoke and authorization tests**

```powershell
npm.cmd exec -w @tali/web -- vitest run src/app/api/mandate/revoke/route.test.ts src/server/auth/authorization.test.ts
```

Expected: PASS with zero `revoke` calls for rejected requests.

- [ ] **Step 5: Commit revocation authorization**

```powershell
git add packages/web/src/app/api/mandate/revoke/route.ts packages/web/src/app/api/mandate/revoke/route.test.ts
git commit -m "feat: authorize mandate revocation"
```

---

### Task 4: Protect safety-test broadcasts

**Files:**
- Modify: `packages/web/src/app/api/safety/attack/route.ts`
- Create: `packages/web/src/app/api/safety/attack/route.test.ts`

- [ ] **Step 1: Write the safety route tests**

Use this valid request fixture:

```ts
const attack = {
  attack: 'overspend' as const,
  amount: '1000000',
  recipient: `0x${'b'.repeat(64)}`,
};
```

Test employer success plus outsider, missing-session, wrong-origin, missing-config,
and invalid-payload failures. Assert the injected `submitAttack` function is never
called for every rejected request.

- [ ] **Step 2: Run the test and verify it fails**

```powershell
npm.cmd exec -w @tali/web -- vitest run src/app/api/safety/attack/route.test.ts
```

Expected: FAIL because the route has no injectable authorized handler.

- [ ] **Step 3: Extract and authorize the safety handler**

Add this handler, importing `SafetyAttackRequest` from `@tali/shared`:

```ts
export function createSafetyAttackHandler(deps: {
  submitAttack: (input: SafetyAttackRequest) => Promise<unknown>;
  resolveIdentity: ResolveRequestIdentity;
  appOrigin: string;
  env?: EnvLike;
}) {
  return async function safetyAttackHandler(request: Request): Promise<Response> {
    try {
      await authorizeEmployerRequest({
        request,
        appOrigin: deps.appOrigin,
        resolveIdentity: deps.resolveIdentity,
        env: deps.env,
      });

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        throw new ServerError('invalid_request', 400, 'Expected valid JSON', { cause: error });
      }

      const parsed = safetyAttackSchema.safeParse(body);
      if (!parsed.success) {
        throw new ServerError(
          'invalid_request',
          400,
          parsed.error.issues[0]?.message ?? 'Invalid attack request',
        );
      }

      return Response.json(await deps.submitAttack(parsed.data));
    } catch (error) {
      const { body: errorBody, status } = toApiError(error);
      return Response.json(errorBody, { status });
    }
  };
}
```

Compose production `POST` with `getSafetyService().attack(input)`,
`requireAppOrigin()`, and `resolveWalletIdentity({ request, auth: services.auth })`.

Remove `requireDemoIdentityEnabled()` from POST. Keep the distinction that a Move
refusal is a successful HTTP response containing the abort result.

- [ ] **Step 4: Run safety route and service tests**

```powershell
npm.cmd exec -w @tali/web -- vitest run src/app/api/safety/attack/route.test.ts src/server/safety
```

Expected: PASS; no test invokes a real Sui client.

- [ ] **Step 5: Commit safety authorization**

```powershell
git add packages/web/src/app/api/safety/attack/route.ts packages/web/src/app/api/safety/attack/route.test.ts
git commit -m "feat: authorize safety test broadcasts"
```

---

### Task 5: Enforce salary-stream ownership

**Files:**
- Modify: `packages/web/src/app/api/streams/[id]/withdraw/route.ts`
- Create: `packages/web/src/app/api/streams/[id]/withdraw/route.test.ts`

- [ ] **Step 1: Write stream-owner authorization tests**

Create a `SalaryStreamView` fixture whose `employee` is a canonical wallet. Test:

- employee success with call order `read`, then `withdraw`;
- employer and unrelated wallet 403 with `withdraw` untouched;
- wrong origin and missing session before `read`;
- missing stream ID 400;
- stream-not-found safe response; and
- existing refused-withdrawal body remains HTTP 200.

The ownership assertion should resemble:

```ts
const calls: string[] = [];
const read = vi.fn(async () => {
  calls.push('read');
  return stream;
});
const withdraw = vi.fn(async () => {
  calls.push('withdraw');
  return { ok: true as const, digest: 'digest', amount: '1000' };
});

const response = await createWithdrawHandler({
  read,
  withdraw,
  resolveIdentity: vi.fn(async () => stream.employee),
  appOrigin: origin,
})(request(), { params: Promise.resolve({ id: stream.id }) });

expect(response.status).toBe(200);
expect(calls).toEqual(['read', 'withdraw']);
```

- [ ] **Step 2: Run the stream route test and verify it fails**

```powershell
npm.cmd exec -w @tali/web -- vitest run "src/app/api/streams/[id]/withdraw/route.test.ts"
```

Expected: FAIL because the existing handler accepts only a withdrawal function and
does not authenticate or read ownership.

- [ ] **Step 3: Implement the employee-owned handler**

Change `createWithdrawHandler` to accept:

```ts
{
  read: (streamId: string) => Promise<SalaryStreamView>;
  withdraw: (streamId: string) => Promise<WithdrawEarnedResult>;
  resolveIdentity: (request: Request) => Promise<string>;
  appOrigin: string;
}
```

Inside the handler:

```ts
assertSameOrigin(request, deps.appOrigin);
const actor = await deps.resolveIdentity(request);
const { id } = await context.params;
if (!id) {
  throw new ServerError('invalid_request', 400, 'A stream id is required');
}
const stream = await deps.read(id);
assertAuthorizedWallet(actor, stream.employee);
return Response.json(await deps.withdraw(id));
```

Production composition obtains `services = getBackendServices()` and
`streams = getStreamService()`, resolves the wallet using `services.auth`, and passes
`streams.read` plus `streams.withdraw`. Remove `requireDemoIdentityEnabled()`.

- [ ] **Step 4: Run stream route and stream service tests**

```powershell
npm.cmd exec -w @tali/web -- vitest run "src/app/api/streams/[id]/withdraw/route.test.ts" src/server/streams
```

Expected: PASS; unauthorized calls never reach `withdraw`.

- [ ] **Step 5: Commit stream ownership**

```powershell
git add "packages/web/src/app/api/streams/[id]/withdraw/route.ts" "packages/web/src/app/api/streams/[id]/withdraw/route.test.ts"
git commit -m "feat: authorize salary stream withdrawals"
```

---

### Task 6: Update configuration and project documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `PROJECT_REQUIREMENTS.md`
- Modify: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Notify the group chat about the shared env/document changes**

Send: “I’m adding the empty server-only `TALI_EMPLOYER_WALLET` variable and recording
the payroll/revoke/safety/stream RBAC boundary. No secrets or frontend files will be
changed.”

- [ ] **Step 2: Add the empty environment variable**

Under the server-only payroll configuration in `.env.example`, add:

```dotenv
# Wallet authorized to run payroll, revoke mandates, and submit safety tests.
# Server-only; never prefix with NEXT_PUBLIC_.
TALI_EMPLOYER_WALLET=
```

- [ ] **Step 3: Update the documentation with exact security claims**

Record these facts without calling hosted rollout complete:

- employer wallet sessions guard payroll execution, mandate revocation, and safety
  broadcasts;
- the stream employee wallet alone may request its withdrawal;
- exact-origin checks run before authorization and mutation;
- rejected requests never reach chain-signing dependencies;
- `TALI_ALLOW_INSECURE_DEMO_IDENTITY=false` remains mandatory when hosted; and
- employer-managed rosters are the next separate increment, not part of this PR.

Also add the launch-plan AI disclosure and “what is new” text only if another teammate
has not already changed those shared sections; otherwise preserve their version and
avoid a documentation conflict.

- [ ] **Step 4: Check documentation and configuration diffs**

```powershell
git diff --check
git diff -- .env.example README.md PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md docs/PROGRESS.md
```

Expected: no whitespace errors, no secrets, and no claim that hosted verification has
already happened.

- [ ] **Step 5: Commit documentation**

```powershell
git add .env.example README.md PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md docs/PROGRESS.md
git commit -m "docs: record payroll route authorization"
```

---

### Task 7: Run the complete verification gate

**Files:**
- Verify all files changed since `origin/main`

- [ ] **Step 1: Install exactly the locked dependencies**

```powershell
npm.cmd ci
```

Expected: exit 0 and no lockfile changes.

- [ ] **Step 2: Run all application and integration tests**

```powershell
npm.cmd test
```

Expected: all Sui integration and web tests pass with zero network broadcasts.

- [ ] **Step 3: Run all TypeScript checks**

```powershell
npm.cmd run typecheck
```

Expected: exit 0 with no TypeScript diagnostics.

- [ ] **Step 4: Build the production application**

```powershell
npm.cmd run build
```

Expected: Next.js production build succeeds and all four API routes are listed.

- [ ] **Step 5: Audit production dependencies**

```powershell
npm.cmd audit --audit-level=high
```

Expected: zero high or critical vulnerabilities.

- [ ] **Step 6: Scan the branch**

```powershell
git diff --check origin/main...HEAD
rg -n "^(<<<<<<<|=======|>>>>>>>)" packages README.md PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md docs .env.example
rg -l "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AGENT_PRIVATE_KEY=[^[:space:]]+|SUPABASE_SECRET_KEY=[^[:space:]]+" . --glob '!node_modules/**' --glob '!.git/**'
git status --short
```

Expected: no conflict markers, no committed secret values, and a clean worktree.

- [ ] **Step 7: Review the requirement matrix**

Confirm from tests and diffs:

- payroll/revoke/safety require the configured employer session;
- safety is not intentionally public;
- withdrawal requires the stream employee;
- origin and authentication failures precede business operations;
- missing configuration fails closed;
- GET payroll history is unchanged;
- no frontend, Move, payroll-roster, or claims-roster scope entered the branch; and
- all mandatory project documents describe the new boundary accurately.

- [ ] **Step 8: Commit any verification-only corrections**

If verification required a correction, rerun its focused red/green test and commit
only that correction:

Inspect `git status --short`, stage each corrected file by its explicit path, rerun
the owning focused test, and commit with `fix: complete payroll RBAC verification`.
If no correction was required, do not create an empty commit.
