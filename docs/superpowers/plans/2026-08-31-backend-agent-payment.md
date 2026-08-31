# Backend-Agent Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pay eligible `auto_pay` claims through the existing process endpoint with a server-only Sui testnet agent while preventing duplicate signing and failing closed on uncertain submission.

**Architecture:** Extend the existing claim repository with atomic payment state transitions, add an injected `PaymentExecutor` boundary, and implement a Sui adapter that separates build/sign preparation from network submission. The process service remains the orchestrator and only the request that wins `approved -> paying` may submit a transaction.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, Supabase/PostgREST, `@mysten/sui` 2.27.1, existing `@tali/shared` and `@tali/treasury-sui` packages.

---

## File map

- Modify `packages/web/src/server/claims/ports.ts`: payment executor and repository contracts.
- Modify `packages/web/src/server/errors.ts`: stable configuration and uncertain-submission API errors.
- Modify `packages/web/src/server/supabase/claim-repository.ts`: atomic reservation and terminal payment writes.
- Modify `packages/web/src/server/supabase/claim-repository.test.ts`: exact compare-and-set coverage.
- Create `packages/web/src/server/sui/payment-executor.ts`: lazy credentials, prepare, submit, finality and result mapping.
- Create `packages/web/src/server/sui/payment-executor.test.ts`: fake-only adapter tests with no network submission.
- Modify `packages/web/src/server/claims/services.ts`: state-aware payment orchestration.
- Modify `packages/web/src/server/claims/services.test.ts`: success, failure, idempotency and concurrency tests.
- Modify `packages/web/src/server/dependencies.ts`: production executor composition.
- Modify `packages/web/src/app/api/claims/[id]/process/route.test.ts`: new safe status-code coverage.
- Modify `.env.example`: clarify testnet-only agent credential format and safety boundary.
- Modify `PROJECT_REQUIREMENTS.md`, `ARCHITECTURE_AND_CODING_DESIGN.md`, and `PROJECT_STATUS.md`: mandatory project documentation.
- Modify `README.md` and `docs/PROGRESS.md`: public status and next-step accuracy.

## Local verification note

This worktree is nested below another checkout whose Vitest config can be discovered
accidentally. During execution, keep an untracked `vitest.config.mjs` containing:

```js
export default {
  test: {
    environment: 'node',
  },
};
```

Never stage this file. Remove it before the final status and secret checks.

---

### Task 1: Add payment ports and safe error codes

**Files:**
- Modify: `packages/web/src/server/claims/ports.ts`
- Modify: `packages/web/src/server/errors.ts`
- Test: `packages/web/src/server/claims/services.test.ts`

- [ ] **Step 1: Add a compile-time failing payment dependency in the process-service test**

Update the process-service test setup to import `PaymentExecutor` and construct this
default fake:

```ts
const payments: PaymentExecutor = {
  assertReady: vi.fn(),
  execute: vi.fn(),
};

const processClaim = createProcessClaimService({
  claims,
  mandates,
  payments,
  now: () => nowMs,
});
```

Run:

```powershell
npx.cmd vitest run packages/web/src/server/claims/services.test.ts
```

Expected: TypeScript transformation fails because `PaymentExecutor` and the
`payments` dependency do not exist.

- [ ] **Step 2: Add the executor and mutation contracts**

Add these contracts to `ports.ts`:

```ts
export type TerminalPaymentState = 'paid' | 'payment_failed';

export type PaymentMutationResult =
  | { status: 'saved'; claim: Claim }
  | { status: 'lost_race'; claim: Claim };

export type PaymentExecutionResult =
  | { status: 'paid'; payment: PaymentResult }
  | { status: 'rejected'; payment: PaymentResult };

export interface PaymentExecutor {
  assertReady(): void;
  execute(input: {
    claimId: string;
    mandateId: string;
    recipient: string;
    amount: string;
    budgetBefore: string;
  }): Promise<PaymentExecutionResult>;
}
```

Extend `ClaimRepository` with:

```ts
reservePayment(claimId: string): Promise<PaymentMutationResult>;
failApprovedPayment(input: {
  claimId: string;
  payment: PaymentResult;
}): Promise<PaymentMutationResult>;
finishPayment(input: {
  claimId: string;
  state: TerminalPaymentState;
  payment: PaymentResult;
}): Promise<PaymentMutationResult>;
```

Add these `ServerErrorCode` members in `errors.ts`:

```ts
| 'payment_configuration_failed'
| 'payment_submission_uncertain'
```

- [ ] **Step 3: Keep non-payment tests compiling with an inert fake**

Extend the shared `createRepository` test helper with:

```ts
reservePayment: vi.fn(),
failApprovedPayment: vi.fn(),
finishPayment: vi.fn(),
```

Pass `payments` to every `createProcessClaimService` construction. Tests that must
not pay will assert:

```ts
expect(payments.assertReady).not.toHaveBeenCalled();
expect(payments.execute).not.toHaveBeenCalled();
```

- [ ] **Step 4: Run the focused type and service checks**

Run:

```powershell
npm.cmd run typecheck
npx.cmd vitest run packages/web/src/server/claims/services.test.ts
```

Expected: type-check passes and the existing process tests pass with the inert
executor.

- [ ] **Step 5: Commit the contracts**

```powershell
git add packages/web/src/server/claims/ports.ts packages/web/src/server/errors.ts packages/web/src/server/claims/services.test.ts
git commit -m "feat: define backend payment contracts"
```

---

### Task 2: Implement atomic payment persistence

**Files:**
- Modify: `packages/web/src/server/supabase/claim-repository.test.ts`
- Modify: `packages/web/src/server/supabase/claim-repository.ts`

- [ ] **Step 1: Write failing reservation and terminal-write tests**

Add a safe payment fixture:

```ts
const payment: PaymentResult = {
  ok: true,
  digest: '7LhYxDemoDigest',
  checkpoint: '123',
  gasUsed: '1200',
  finalityMs: 900,
  abortCode: null,
  abortKey: null,
  message: 'Payment confirmed on Sui testnet.',
  rawError: null,
  budgetBefore: '20000000',
  budgetAfter: '15500000',
};
const failedPayment: PaymentResult = {
  ...payment,
  ok: false,
  digest: null,
  checkpoint: null,
  gasUsed: null,
  finalityMs: null,
  abortCode: 7,
  abortKey: 'RECIPIENT_NOT_APPROVED',
  message: 'This recipient is not approved by the mandate.',
  budgetAfter: payment.budgetBefore,
};
```

Add three tests that capture updates and filters:

```ts
it('reserves only an unpaid approved claim', async () => {
  // Script a returned row with state: 'paying'.
  await repository.reservePayment(row.id);
  expect(updated).toEqual({ state: 'paying' });
  expect(filters).toContainEqual(['eq', 'state', 'approved']);
  expect(filters).toContainEqual(['is', 'payment', null]);
});

it('records preflight failure only from approved', async () => {
  await repository.failApprovedPayment({ claimId: row.id, payment: failedPayment });
  expect(updated).toEqual({ state: 'payment_failed', payment: failedPayment });
  expect(filters).toContainEqual(['eq', 'state', 'approved']);
});

it('finishes payment only from paying', async () => {
  await repository.finishPayment({ claimId: row.id, state: 'paid', payment });
  expect(updated).toEqual({ state: 'paid', payment });
  expect(filters).toContainEqual(['eq', 'state', 'paying']);
  expect(filters).toContainEqual(['is', 'payment', null]);
});
```

Run:

```powershell
npx.cmd vitest run packages/web/src/server/supabase/claim-repository.test.ts
```

Expected: FAIL because the repository methods do not exist.

- [ ] **Step 2: Add a shared atomic payment mutation helper**

In `claim-repository.ts`, add:

```ts
async function mutatePayment(input: {
  claimId: string;
  expectedState: 'approved' | 'paying';
  nextState: 'paying' | 'paid' | 'payment_failed';
  payment?: PaymentResult;
}): Promise<PaymentMutationResult> {
  const update = input.payment
    ? { state: input.nextState, payment: input.payment }
    : { state: input.nextState };
  const { data, error } = await query(client, 'claims')
    .update(update)
    .eq('id', input.claimId)
    .eq('state', input.expectedState)
    .is('payment', null)
    .select(CLAIM_COLUMNS)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw databaseFailure(error);
  if (data) return { status: 'saved', claim: mapClaimRow(data).claim };

  const current = await getProcessContext(input.claimId);
  return { status: 'lost_race', claim: current.claim };
}
```

Expose the three repository methods by calling this helper with exact expected and
next states.

- [ ] **Step 3: Add zero-row race tests**

Add scripted reload cases asserting:

```ts
await expect(repository.reservePayment(row.id)).resolves.toEqual({
  status: 'lost_race',
  claim: expect.objectContaining({ state: 'paying' }),
});

await expect(
  repository.finishPayment({ claimId: row.id, state: 'paid', payment }),
).resolves.toEqual({
  status: 'lost_race',
  claim: expect.objectContaining({ state: 'paid', payment }),
});
```

Also assert a database error never includes the scripted raw database message.

- [ ] **Step 4: Run repository tests and type-check**

```powershell
npx.cmd vitest run packages/web/src/server/supabase/claim-repository.test.ts
npm.cmd run typecheck
```

Expected: all repository tests and type-check pass.

- [ ] **Step 5: Commit persistence**

```powershell
git add packages/web/src/server/supabase/claim-repository.ts packages/web/src/server/supabase/claim-repository.test.ts
git commit -m "feat: reserve and finish claim payments atomically"
```

---

### Task 3: Implement lazy Sui payment preparation

**Files:**
- Create: `packages/web/src/server/sui/payment-executor.test.ts`
- Create: `packages/web/src/server/sui/payment-executor.ts`

- [ ] **Step 1: Write failing readiness tests**

Use generated test credentials, never a literal key:

```ts
const testKeypair = Ed25519Keypair.generate();
const testEnv = {
  AGENT_PRIVATE_KEY: testKeypair.getSecretKey(),
  AGENT_CAP_ID: `0x${'3'.repeat(64)}`,
  SUI_NETWORK: 'testnet',
};
const operations = {
  prepare: vi.fn(),
  submit: vi.fn(),
  readBudget: vi.fn(),
};

it('validates credentials lazily', () => {
  const executor = createSuiPaymentExecutor({ env: {} });
  expect(() => executor).not.toThrow();
  expect(() => executor.assertReady()).toThrow(PaymentConfigurationError);
});

it('accepts a generated Ed25519 test key and canonical AgentCap', () => {
  const executor = createSuiPaymentExecutor({ env: testEnv, operations });
  expect(() => executor.assertReady()).not.toThrow();
});

it('rejects non-testnet configuration without echoing the key', () => {
  const executor = createSuiPaymentExecutor({
    env: { ...testEnv, SUI_NETWORK: 'mainnet' },
    operations,
  });
  expect(() => executor.assertReady()).toThrow('testnet');
  expect(() => executor.assertReady()).not.toThrow(testEnv.AGENT_PRIVATE_KEY);
});
```

Run:

```powershell
npx.cmd vitest run packages/web/src/server/sui/payment-executor.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 2: Add internal preparation and uncertainty errors**

Create safe internal errors:

```ts
export class PaymentConfigurationError extends Error {
  constructor() {
    super('Backend payment configuration is unavailable');
    this.name = 'PaymentConfigurationError';
  }
}

export class PaymentSubmissionUncertainError extends Error {
  constructor(options?: ErrorOptions) {
    super('Sui payment submission status is uncertain', options);
    this.name = 'PaymentSubmissionUncertainError';
  }
}
```

Neither message contains environment values or provider text.

- [ ] **Step 3: Define an injectable operations boundary**

Use this internal shape so tests never access the network:

```ts
interface PreparedPayment {
  bytes: Uint8Array;
  signature: string;
}

interface ConfirmedPayment {
  digest: string;
  checkpoint: string | null;
  status: { success: true; error: null } | { success: false; error: unknown };
  gasUsed: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    nonRefundableStorageFee: string;
  };
}

interface PaymentOperations {
  prepare(input: {
    agentCapId: string;
    mandateId: string;
    recipient: string;
    amount: bigint;
  }): Promise<PreparedPayment>;
  submit(input: PreparedPayment): Promise<ConfirmedPayment>;
  readBudget(mandateId: string): Promise<string>;
}
```

The default operations implementation must:

```ts
const transaction = buildSpendTransaction(config, input);
transaction.setSenderIfNotSet(keypair.toSuiAddress());
const bytes = await transaction.build({ client });
const { signature } = await keypair.signTransaction(bytes);
```

Submission must call `client.executeTransaction` followed by
`client.waitForTransaction`, both requesting effects.

- [ ] **Step 4: Implement lazy readiness**

`createSuiPaymentExecutor` accepts optional `env`, `operations`, `config` and `now`.
When no operations are injected, `assertReady` parses:

```ts
const keypair = Ed25519Keypair.fromSecretKey(privateKey);
const agentCapId = normalizeAddress(capId, 'AgentCap ID');
```

It refuses `SUI_NETWORK` values other than `testnet`. Cache the validated runtime in
the executor closure so module import does not read the key.

- [ ] **Step 5: Run readiness tests**

```powershell
npx.cmd vitest run packages/web/src/server/sui/payment-executor.test.ts
```

Expected: readiness, secret-sanitization and testnet-only tests pass.

- [ ] **Step 6: Commit preparation**

```powershell
git add packages/web/src/server/sui/payment-executor.ts packages/web/src/server/sui/payment-executor.test.ts
git commit -m "feat: prepare backend Sui payments securely"
```

---

### Task 4: Map confirmed Sui outcomes without broadcasting in tests

**Files:**
- Modify: `packages/web/src/server/sui/payment-executor.test.ts`
- Modify: `packages/web/src/server/sui/payment-executor.ts`

- [ ] **Step 1: Write a failing confirmed-success test**

Use fake operations:

```ts
const input = {
  claimId,
  mandateId,
  recipient,
  amount: '4500000',
  budgetBefore: '20000000',
};
const confirmed = {
  digest: '7LhYxDemoDigest',
  checkpoint: '123',
  status: { success: true as const, error: null },
  gasUsed: {
    computationCost: '1000',
    storageCost: '400',
    storageRebate: '300',
    nonRefundableStorageFee: '100',
  },
};
const operations = {
  prepare: vi.fn(async () => ({ bytes: new Uint8Array([1, 2]), signature: 'test-signature' })),
  submit: vi.fn(async () => confirmed),
  readBudget: vi.fn(async () => '15500000'),
};
const executor = createSuiPaymentExecutor({ env: testEnv, operations });

beforeEach(() => {
  vi.clearAllMocks();
});

await expect(executor.execute(input)).resolves.toEqual({
  status: 'paid',
  payment: expect.objectContaining({
    ok: true,
    digest: '7LhYxDemoDigest',
    checkpoint: '123',
    gasUsed: '1200',
    budgetBefore: '20000000',
    budgetAfter: '15500000',
    rawError: null,
  }),
});
```

Run the file and expect FAIL because `execute` is incomplete.

- [ ] **Step 2: Implement success mapping**

Calculate net gas with `BigInt`:

```ts
const netGas =
  BigInt(gas.computationCost) +
  BigInt(gas.storageCost) +
  BigInt(gas.nonRefundableStorageFee) -
  BigInt(gas.storageRebate);
const gasUsed = (netGas < 0n ? 0n : netGas).toString();
```

Measure finality using injected `now`, then read and persist the post-finality budget.

- [ ] **Step 3: Write confirmed-rejection and uncertainty tests**

Add:

```ts
it('returns a sanitized confirmed Move rejection', async () => {
  operations.submit.mockResolvedValueOnce({
    ...confirmed,
    status: {
      success: false,
      error: { $kind: 'MoveAbort', MoveAbort: { abortCode: '7' } },
    },
  });
  const result = await executor.execute(input);
  expect(result).toEqual({
    status: 'rejected',
    payment: expect.objectContaining({
      ok: false,
      abortCode: 7,
      abortKey: 'RECIPIENT_NOT_APPROVED',
      rawError: null,
    }),
  });
});

it('classifies submit transport errors as uncertain', async () => {
  operations.submit.mockRejectedValueOnce(new Error('private RPC hostname'));
  const result = executor.execute(input);
  await expect(result).rejects.toBeInstanceOf(PaymentSubmissionUncertainError);
  await expect(result).rejects.not.toThrow('private RPC hostname');
});

it('returns a definite failure when preparation fails before submission', async () => {
  operations.prepare.mockRejectedValueOnce(new Error('invalid transaction input'));
  const result = await executor.execute(input);
  expect(result.status).toBe('rejected');
  expect(result.payment.rawError).toBeNull();
  expect(operations.submit).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Implement rejection and uncertainty mapping**

Use `treasuryErrorFromCode` for structural Move abort codes and
`parseTreasuryError` for confirmed error messages without persisting
`TreasuryError.rawMessage`. Catch only submission/finality transport failures as
`PaymentSubmissionUncertainError`; preparation failures are definite non-submissions.

- [ ] **Step 5: Run adapter and Sui-builder tests**

```powershell
npx.cmd vitest run packages/web/src/server/sui/payment-executor.test.ts packages/sui-integration/src/transactions.test.ts packages/sui-integration/src/errors.test.ts
```

Expected: all tests pass and fake `submit` is the only submission path exercised.

- [ ] **Step 6: Commit outcome mapping**

```powershell
git add packages/web/src/server/sui/payment-executor.ts packages/web/src/server/sui/payment-executor.test.ts
git commit -m "feat: map confirmed Sui payment outcomes"
```

---

### Task 5: Orchestrate safe payment from claim processing

**Files:**
- Modify: `packages/web/src/server/claims/services.test.ts`
- Modify: `packages/web/src/server/claims/services.ts`

- [ ] **Step 1: Replace the old auto-pay expectation with a failing payment-flow test**

Use an auto-pay decision saved as approved, a second mandate read, a saved reservation,
and a successful executor:

```ts
const approvedDecision: PolicyDecision = {
  outcome: 'auto_pay',
  checks: [],
  reason: 'Every policy rule passed.',
  evaluatedAtMs: nowMs,
};
const approvedClaim: Claim = {
  ...claim,
  state: 'approved',
  decision: approvedDecision,
};
const payment: PaymentResult = {
  ok: true,
  digest: '7LhYxDemoDigest',
  checkpoint: '123',
  gasUsed: '1200',
  finalityMs: 900,
  abortCode: null,
  abortKey: null,
  message: 'Payment confirmed on Sui testnet.',
  rawError: null,
  budgetBefore: '20000000',
  budgetAfter: '15500000',
};

it('pays an auto-pay claim only after readiness, preflight and reservation', async () => {
  const paidClaim = { ...approvedClaim, state: 'paid' as const, payment };
  const saveDecision = vi.fn(async () => ({
    status: 'saved' as const,
    claim: approvedClaim,
  }));
  const reservePayment = vi.fn(async () => ({
    status: 'saved',
    claim: { ...approvedClaim, state: 'paying' as const },
  } as const));
  const finishPayment = vi.fn(async () => ({
    status: 'saved' as const,
    claim: paidClaim,
  }));
  const claims = createRepository({ saveDecision, reservePayment, finishPayment });
  const mandates = { read: vi.fn(async () => mandate) };
  const payments = createPaymentExecutor({
    execute: vi.fn(async () => ({ status: 'paid' as const, payment })),
  });
  const processClaim = createProcessClaimService({
    claims,
    mandates,
    payments,
    now: () => nowMs,
  });

  await expect(processClaim({ claimId: claim.id, processor: treasurer })).resolves.toEqual({
    claim: paidClaim,
    decision: approvedClaim.decision,
    payment,
  });
  expect(mandates.read).toHaveBeenCalledTimes(2);
  expect(payments.assertReady).toHaveBeenCalledOnce();
  expect(reservePayment).toHaveBeenCalledWith(claim.id);
  expect(payments.execute).toHaveBeenCalledWith({
    claimId: claim.id,
    mandateId,
    recipient: claim.submitter,
    amount: claim.amount,
    budgetBefore: mandate.remainingBudget,
  });
});
```

Run the focused test and expect FAIL because the service still returns
`payment: null`.

- [ ] **Step 2: Refactor state-aware idempotency**

At the start of processing, handle stored decisions as follows:

```ts
if (claim.decision?.outcome !== 'auto_pay') {
  if (!claim.decision) {
    throw new ServerError('processing_conflict', 409, 'Claim is not available for processing');
  }
  return { claim, decision: claim.decision, payment: null };
}
if (claim.state === 'paid' || claim.state === 'payment_failed') {
  if (!claim.payment) {
    throw new ServerError('processing_conflict', 409, 'Claim payment state is inconsistent');
  }
  return { claim, decision: claim.decision, payment: claim.payment };
}
if (claim.state === 'paying') {
  throw new ServerError(
    'processing_conflict',
    409,
    'Payment requires reconciliation before retrying',
  );
}
if (claim.state !== 'approved' && claim.state !== 'submitted') {
  throw new ServerError('processing_conflict', 409, 'Claim is not available for processing');
}
```

Do not read Sui or load agent configuration for terminal review/reject/paid/failed
responses.

- [ ] **Step 3: Implement readiness, preflight and reservation**

After obtaining an approved auto-pay claim:

```ts
try {
  deps.payments.assertReady();
} catch (error) {
  throw new ServerError(
    'payment_configuration_failed',
    503,
    'Backend payment configuration is unavailable',
    { cause: error },
  );
}

let currentMandate;
try {
  currentMandate = await deps.mandates.read(context.event.mandateId);
  if (currentMandate.id.toLowerCase() !== context.event.mandateId.toLowerCase()) {
    throw new Error('Mandate object ID does not match the event');
  }
} catch (error) {
  throw new ServerError(
    'mandate_read_failed',
    502,
    'The current Sui mandate could not be read',
    { cause: error },
  );
}
const currentDecision = evaluatePolicy({
  claim: approvedClaim,
  event: context.event,
  mandate: currentMandate,
  exactDuplicate: false,
  nowMs: deps.now?.() ?? Date.now(),
});
```

If the current outcome is no longer auto-pay, build a sanitized failed
`PaymentResult`, call `failApprovedPayment`, and return the stored terminal result.
Otherwise call `reservePayment`. Only `status: 'saved'` may proceed to execute.

Use this exact preflight result shape:

```ts
const payment: PaymentResult = {
  ok: false,
  digest: null,
  checkpoint: null,
  gasUsed: null,
  finalityMs: null,
  abortCode: null,
  abortKey: 'POLICY_CHANGED',
  message: 'The live mandate no longer permits automatic payment.',
  rawError: null,
  budgetBefore: currentMandate.remainingBudget,
  budgetAfter: currentMandate.remainingBudget,
};
```

- [ ] **Step 4: Implement terminal execution handling**

Map executor results:

```ts
const execution = await deps.payments.execute({
  claimId: approvedClaim.id,
  mandateId: context.event.mandateId,
  recipient: approvedClaim.submitter,
  amount: approvedClaim.amount,
  budgetBefore: currentMandate.remainingBudget,
});
const state = execution.status === 'paid' ? 'paid' : 'payment_failed';
const finished = await deps.claims.finishPayment({
  claimId: approvedClaim.id,
  state,
  payment: execution.payment,
});
```

If the executor throws `PaymentSubmissionUncertainError`, return:

```ts
throw new ServerError(
  'payment_submission_uncertain',
  502,
  'Payment submission requires reconciliation before retrying',
  { cause: error },
);
```

Do not write a terminal payment in that branch.

- [ ] **Step 5: Add idempotency and failure tests**

Add explicit tests asserting:

```ts
function createPaymentExecutor(
  overrides: Partial<PaymentExecutor> = {},
): PaymentExecutor {
  return {
    assertReady: vi.fn(),
    execute: vi.fn(),
    ...overrides,
  };
}

it('returns stored paid result without Sui or signing', async () => {
  const paidClaim = { ...approvedClaim, state: 'paid' as const, payment };
  const claims = createRepository({
    getProcessContext: vi.fn(async () => ({ ...processContext, claim: paidClaim })),
  });
  const payments = createPaymentExecutor();
  const mandates = { read: vi.fn() };
  const processClaim = createProcessClaimService({ claims, mandates, payments });
  await expect(
    processClaim({ claimId: claim.id, processor: treasurer }),
  ).resolves.toEqual({ claim: paidClaim, decision: approvedDecision, payment });
  expect(mandates.read).not.toHaveBeenCalled();
  expect(payments.execute).not.toHaveBeenCalled();
});

it('blocks retries while reconciliation is required', async () => {
  const claims = createRepository({
    getProcessContext: vi.fn(async () => ({
      ...processContext,
      claim: { ...approvedClaim, state: 'paying' as const },
    })),
  });
  const payments = createPaymentExecutor();
  const processClaim = createProcessClaimService({
    claims,
    mandates: { read: vi.fn() },
    payments,
  });
  await expect(
    processClaim({ claimId: claim.id, processor: treasurer }),
  ).rejects.toMatchObject({
    code: 'processing_conflict',
    status: 409,
  });
  expect(payments.execute).not.toHaveBeenCalled();
});

it('leaves approved state untouched when configuration is missing', async () => {
  const claims = createRepository({
    getProcessContext: vi.fn(async () => ({ ...processContext, claim: approvedClaim })),
  });
  const payments = createPaymentExecutor({
    assertReady: () => { throw new PaymentConfigurationError(); },
  });
  const processClaim = createProcessClaimService({
    claims,
    mandates: { read: vi.fn() },
    payments,
  });
  await expect(
    processClaim({ claimId: claim.id, processor: treasurer }),
  ).rejects.toMatchObject({
    code: 'payment_configuration_failed',
    status: 503,
  });
  expect(claims.reservePayment).not.toHaveBeenCalled();
});

it('does not sign when another request wins reservation', async () => {
  const claims = createRepository({
    getProcessContext: vi.fn(async () => ({ ...processContext, claim: approvedClaim })),
    reservePayment: vi.fn(async () => ({
      status: 'lost_race' as const,
      claim: { ...approvedClaim, state: 'paying' as const },
    })),
  });
  const payments = createPaymentExecutor();
  const processClaim = createProcessClaimService({
    claims,
    mandates: { read: vi.fn(async () => mandate) },
    payments,
    now: () => nowMs,
  });
  await expect(
    processClaim({ claimId: claim.id, processor: treasurer }),
  ).rejects.toMatchObject({ status: 409 });
  expect(payments.execute).not.toHaveBeenCalled();
});

it('leaves paying for uncertain submission', async () => {
  const claims = createRepository({
    getProcessContext: vi.fn(async () => ({ ...processContext, claim: approvedClaim })),
    reservePayment: vi.fn(async () => ({
      status: 'saved' as const,
      claim: { ...approvedClaim, state: 'paying' as const },
    })),
  });
  const payments = createPaymentExecutor({
    execute: vi.fn(async () => { throw new PaymentSubmissionUncertainError(); }),
  });
  const processClaim = createProcessClaimService({
    claims,
    mandates: { read: vi.fn(async () => mandate) },
    payments,
    now: () => nowMs,
  });
  await expect(
    processClaim({ claimId: claim.id, processor: treasurer }),
  ).rejects.toMatchObject({
    code: 'payment_submission_uncertain',
    status: 502,
  });
  expect(claims.finishPayment).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run service tests and type-check**

```powershell
npx.cmd vitest run packages/web/src/server/claims/services.test.ts
npm.cmd run typecheck
```

Expected: all claim-service tests and type-check pass.

- [ ] **Step 7: Commit orchestration**

```powershell
git add packages/web/src/server/claims/services.ts packages/web/src/server/claims/services.test.ts
git commit -m "feat: pay eligible claims through the backend agent"
```

---

### Task 6: Compose the executor and verify safe API errors

**Files:**
- Modify: `packages/web/src/server/dependencies.ts`
- Modify: `packages/web/src/app/api/claims/[id]/process/route.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add failing route error tests**

Add:

```ts
it.each([
  ['payment_configuration_failed', 503, 'Backend payment configuration is unavailable'],
  ['payment_submission_uncertain', 502, 'Payment submission requires reconciliation before retrying'],
] as const)('maps %s safely', async (code, status, message) => {
  const handler = createProcessClaimHandler(async () => {
    throw new ServerError(code, status, message, {
      cause: new Error('private provider detail'),
    });
  });
  const result = await handler(request(JSON.stringify({ processor })), context);
  expect(result.status).toBe(status);
  const responseText = await result.text();
  expect(JSON.parse(responseText)).toEqual({ error: code, message });
  expect(responseText).not.toContain('private provider detail');
});
```

Run the route test. Expected: it passes once Task 1 error codes exist and confirms
the current route serializer is sufficient.

- [ ] **Step 2: Compose the production executor lazily**

In `dependencies.ts`:

```ts
import { createSuiPaymentExecutor } from './sui/payment-executor';

const payments = createSuiPaymentExecutor();

services = {
  analyzeReceipt: createAnalyzeReceiptService({ analyzer, claims, receipts }),
  createClaim: createClaimService({ claims }),
  listClaims: createListClaimsService({ claims, receipts }),
  processClaim: createProcessClaimService({ claims, mandates, payments }),
};
```

The factory itself must not read `AGENT_PRIVATE_KEY`; only `assertReady` may do so.

- [ ] **Step 3: Clarify environment safety**

Keep values empty and add comments:

```dotenv
# Testnet backend signer only. Use a Sui suiprivkey value; never commit it and never
# prefix it with NEXT_PUBLIC_. Automated tests do not read or broadcast with this key.
AGENT_PRIVATE_KEY=
# Owned AgentCap object for the derived backend signer address.
AGENT_CAP_ID=
```

- [ ] **Step 4: Run route, dependency and build checks**

```powershell
npx.cmd vitest run packages/web/src/app/api/claims/[id]/process/route.test.ts packages/web/src/server/sui/payment-executor.test.ts
npm.cmd run typecheck
npm.cmd run build
```

Expected: route tests pass, imports remain lazy, type-check passes and the production
build succeeds without an agent key.

- [ ] **Step 5: Commit composition**

```powershell
git add packages/web/src/server/dependencies.ts packages/web/src/app/api/claims/[id]/process/route.test.ts .env.example
git commit -m "feat: compose testnet backend payment executor"
```

---

### Task 7: Update project documentation and run complete verification

**Files:**
- Modify: `PROJECT_REQUIREMENTS.md`
- Modify: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Modify: `PROJECT_STATUS.md`
- Modify: `README.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Update requirements**

Move testnet server signing out of the current increment's out-of-scope list and
record these exact guarantees:

- auto-pay only;
- treasurer-triggered process endpoint;
- atomic `approved -> paying` reservation;
- terminal `paid` or `payment_failed` persistence;
- idempotent terminal responses;
- uncertain submission remains `paying`; and
- testnet-only, server-only credentials.

Keep real wallet authentication, review actions, automatic reconciliation and
mainnet explicitly out of scope.

- [ ] **Step 2: Update architecture and status**

Document the `PaymentExecutor`, lazy credentials, prepare/submit boundary, atomic
repository transitions and sanitized errors. In `PROJECT_STATUS.md`, mark code and
fake-client verification complete but state clearly that no real transaction was
broadcast in this increment and a funded live smoke test remains pending.

- [ ] **Step 3: Update public progress docs**

Change README and progress wording from “backend signing pending” to “backend
testnet signing implemented and verified without broadcast.” Keep real payment
evidence pending until a separately authorized smoke test succeeds.

- [ ] **Step 4: Run clean installation and full verification**

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
git diff --check origin/main...HEAD
```

Expected:

- clean install succeeds;
- every Vitest test passes;
- type-check and production build succeed;
- audit reports zero high-severity vulnerabilities; and
- diff check emits no errors.

- [ ] **Step 5: Run safety scans**

Scan changed files without printing matched values. Confirm:

```text
credential-like changed-file matches=0
real-network calls from payment tests=0
tracked vitest.config.mjs=0
```

Use:

```powershell
$changed = @(git diff --name-only origin/main...HEAD | Where-Object {
  Test-Path -LiteralPath $_
})
$secretPatterns = '(AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|service_role\s*[=:]\s*["''][^"'']+)'
$secretHits = @($changed | ForEach-Object {
  Select-String -LiteralPath $_ -Pattern $secretPatterns -AllMatches -ErrorAction SilentlyContinue
})
Write-Output "credential-like changed-file matches=$($secretHits.Count)"

$networkHits = @(Select-String -Path 'packages/web/src/server/sui/payment-executor.test.ts' -Pattern 'fullnode\.testnet|https://|createTestnetClient\(' -AllMatches)
Write-Output "real-network calls from payment tests=$($networkHits.Count)"

$trackedGuard = @(git ls-files vitest.config.mjs)
Write-Output "tracked vitest.config.mjs=$($trackedGuard.Count)"
```

Also verify all mandatory documents exist:

```powershell
Get-Item PROJECT_REQUIREMENTS.md, ARCHITECTURE_AND_CODING_DESIGN.md, PROJECT_STATUS.md
```

- [ ] **Step 6: Remove the local Vitest guard and commit documentation**

Delete the untracked `vitest.config.mjs`, confirm a clean diff check, then commit:

```powershell
git diff --check
git diff --check origin/main...HEAD
git add PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md README.md docs/PROGRESS.md
git commit -m "docs: record backend payment safety boundary"
```

- [ ] **Step 7: Verify branch state and push**

```powershell
git status --short --branch
git log --oneline origin/codex/consolidated-claim-processing..HEAD
git push origin codex/consolidated-claim-processing
```

Expected: the branch is clean, only reviewed payment commits are ahead before the
push, and the remote consolidated branch advances to the verified local commit.

## Completion boundary

Completion means the code can safely prepare and submit a testnet agent payment when
valid server credentials are later supplied, but all automated verification remains
fake-only. A real transaction requires a separate explicit instruction and must use a
small approved testnet claim.
