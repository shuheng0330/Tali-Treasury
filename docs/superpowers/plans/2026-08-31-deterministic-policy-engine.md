# Deterministic Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, deterministic server policy evaluator that classifies trusted claim snapshots as `auto_pay`, `review`, or `reject` and explains all nine checks.

**Architecture:** Add a focused module under `packages/web/src/server/policy` that accepts claim, event, mandate, duplicate, and time snapshots and returns the existing shared `PolicyDecision`. The evaluator performs no I/O or persistence; later process/payment orchestration will inject live snapshots and consume its result.

**Tech Stack:** TypeScript 5.9, Vitest 4, `@tali/shared` domain types, `BigInt` USDC base-unit arithmetic, Next.js server workspace.

---

## File structure

- Create `packages/web/src/server/policy/evaluate.ts`: input types, pure helpers, nine rule checks, precedence, and decision explanation.
- Create `packages/web/src/server/policy/evaluate.test.ts`: happy path, failure classification, boundary, validation, and deterministic-output tests.
- Modify `PROJECT_REQUIREMENTS.md`: add the approved policy behavior and remove deterministic evaluation from the out-of-scope list.
- Modify `ARCHITECTURE_AND_CODING_DESIGN.md`: document the policy module, trust boundary, precedence, and testing.
- Modify `PROJECT_STATUS.md`: record the evaluator as complete and distinguish the still-pending process/payment integration.

### Task 1: Establish the evaluator contract and happy path

**Files:**
- Create: `packages/web/src/server/policy/evaluate.test.ts`
- Create: `packages/web/src/server/policy/evaluate.ts`

- [ ] **Step 1: Write the failing happy-path test and reusable fixtures**

Create `packages/web/src/server/policy/evaluate.test.ts` with canonical fixtures and a test that asserts `auto_pay`, the stable nine-rule order, all passing checks, accurate on-chain flags, and injected evaluation time:

```ts
import type { Claim, ExpenseCategory, MandateView } from '@tali/shared';
import { describe, expect, it } from 'vitest';

import { evaluatePolicy, type PolicyEventSnapshot } from './evaluate';

const NOW_MS = Date.UTC(2026, 7, 31, 7, 0, 0);
const MEMBER = `0x${'a'.repeat(64)}`;

const claim: Pick<Claim, 'submitter' | 'amount' | 'receiptDate' | 'category' | 'analysis'> = {
  submitter: MEMBER,
  amount: '4500000',
  receiptDate: '2026-08-30',
  category: 'printing',
  analysis: {
    merchant: 'Campus Print Shop',
    amount: '4500000',
    currency: 'MYR',
    receiptDate: '2026-08-30',
    category: 'printing',
    confidence: 0.96,
    uncertainFields: [],
    warnings: [],
    receiptHash: 'a'.repeat(64),
    fuzzyKey: 'campus print shop|2026-08-30|4500000',
  },
};

const event: PolicyEventSnapshot = {
  allowedCategories: ['food', 'printing', 'transport'] satisfies ExpenseCategory[],
  startsAtMs: Date.UTC(2026, 7, 29),
  expiresAtMs: Date.UTC(2026, 8, 5, 23, 59, 59),
};

const mandate: MandateView = {
  id: `0x${'1'.repeat(64)}`,
  coinType: '0x2::usdc::USDC',
  initialBudget: '100000000',
  remainingBudget: '80000000',
  amountSpent: '20000000',
  maxPerClaim: '5000000',
  expiryMs: Date.UTC(2026, 8, 5, 23, 59, 59),
  revoked: false,
  approvedRecipients: [MEMBER],
  fetchedAtMs: NOW_MS,
};

const expectedRules = [
  'per_claim_max',
  'total_budget',
  'recipient_allowlist',
  'mandate_active',
  'not_expired',
  'not_duplicate',
  'category_allowed',
  'receipt_date_valid',
  'confidence_sufficient',
];

function evaluate(overrides: Partial<Parameters<typeof evaluatePolicy>[0]> = {}) {
  return evaluatePolicy({ claim, event, mandate, exactDuplicate: false, nowMs: NOW_MS, ...overrides });
}

describe('evaluatePolicy', () => {
  it('returns an explainable auto-pay decision when every rule passes', () => {
    const decision = evaluate();

    expect(decision.outcome).toBe('auto_pay');
    expect(decision.evaluatedAtMs).toBe(NOW_MS);
    expect(decision.checks.map(({ rule }) => rule)).toEqual(expectedRules);
    expect(decision.checks.every(({ passed }) => passed)).toBe(true);
    expect(decision.checks.filter(({ onChain }) => onChain).map(({ rule }) => rule)).toEqual([
      'per_claim_max',
      'total_budget',
      'recipient_allowlist',
      'mandate_active',
      'not_expired',
    ]);
    expect(decision.reason).toContain('eligible for automatic payment');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run:

```powershell
npm.cmd run test -w @tali/web -- src/server/policy/evaluate.test.ts
```

Expected: FAIL because `./evaluate` does not exist.

- [ ] **Step 3: Add the evaluator types, helpers, all checks, and outcome precedence**

Create `packages/web/src/server/policy/evaluate.ts`. Import `Claim`, `ExpenseCategory`, `MandateView`, `PolicyDecision`, `RuleCheck`, and `RuleId`, plus `ON_CHAIN_RULES` and `isAllowedRecipient` from `@tali/shared`. Define:

```ts
export interface PolicyEventSnapshot {
  allowedCategories: readonly ExpenseCategory[];
  startsAtMs: number;
  expiresAtMs: number;
}

export interface PolicyEvaluationInput {
  claim: Pick<Claim, 'submitter' | 'amount' | 'receiptDate' | 'category' | 'analysis'>;
  event: PolicyEventSnapshot;
  mandate: MandateView;
  exactDuplicate: boolean;
  nowMs?: number;
}
```

Implement private helpers for strict positive/non-negative decimal parsing, safe USDC display, strict UTC calendar parsing, UTC day normalization, check construction, and failed-check labels. Construct all nine checks in the specified order. Use `Object.hasOwn(ON_CHAIN_RULES, rule)` for `onChain`. Select `reject` when any failed rule is in this hard-failure set:

```ts
const HARD_FAILURES = new Set<RuleId>([
  'per_claim_max',
  'total_budget',
  'recipient_allowlist',
  'mandate_active',
  'not_expired',
  'not_duplicate',
]);
```

Otherwise select `review` when any check fails, and `auto_pay` when none fail. Reasons must be:

```ts
const reason =
  outcome === 'auto_pay'
    ? 'Every policy rule passed. The claim is eligible for automatic payment.'
    : outcome === 'reject'
      ? `Automatic payment rejected: ${failedLabels}.`
      : `Treasurer review required: ${failedLabels}.`;
```

Use `input.nowMs ?? Date.now()` once and return it as `evaluatedAtMs` so every time-dependent rule uses one consistent timestamp.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run the same focused command. Expected: 1 passing test file with 1 passing test.

- [ ] **Step 5: Commit the contract and happy path**

```powershell
git add -- packages/web/src/server/policy/evaluate.ts packages/web/src/server/policy/evaluate.test.ts
git commit -m "feat: add deterministic policy evaluator"
```

### Task 2: Test and enforce reject-versus-review behavior

**Files:**
- Modify: `packages/web/src/server/policy/evaluate.test.ts`
- Modify: `packages/web/src/server/policy/evaluate.ts`

- [ ] **Step 1: Add table-driven tests for every hard failure**

Add a table where each case changes exactly one snapshot and expects `reject` plus the failed rule:

```ts
it.each([
  ['amount above per-claim maximum', { claim: { ...claim, amount: '5000001' } }, 'per_claim_max'],
  ['amount above remaining budget', { mandate: { ...mandate, remainingBudget: '4000000' } }, 'total_budget'],
  ['recipient not allowlisted', { mandate: { ...mandate, approvedRecipients: [] } }, 'recipient_allowlist'],
  ['revoked mandate', { mandate: { ...mandate, revoked: true } }, 'mandate_active'],
  ['expired mandate', { mandate: { ...mandate, expiryMs: NOW_MS } }, 'not_expired'],
  ['exact duplicate', { exactDuplicate: true }, 'not_duplicate'],
] as const)('rejects when %s', (_label, overrides, expectedRule) => {
  const decision = evaluate(overrides);
  expect(decision.outcome).toBe('reject');
  expect(decision.checks.find(({ rule }) => rule === expectedRule)?.passed).toBe(false);
});
```

- [ ] **Step 2: Add table-driven tests for review failures and hard-failure precedence**

Add review cases for a disallowed category, invalid receipt date, low confidence, uncertain fields, warnings, and missing analysis. Add a combined case with low confidence plus a revoked mandate and assert `reject` while both checks fail.

- [ ] **Step 3: Run the focused test and verify any missing classification behavior fails**

Run the focused command. Expected: new tests reveal any evaluator behavior that does not match the approved classification.

- [ ] **Step 4: Make the smallest evaluator corrections required by the tests**

Ensure `confidence_sufficient` requires a non-null analysis, finite confidence `>= 0.9`, empty `uncertainFields`, and empty `warnings`. Ensure hard failures take precedence independently of check order and all check results remain in the decision.

- [ ] **Step 5: Run the focused tests and commit**

Expected: all policy tests pass.

```powershell
git add -- packages/web/src/server/policy/evaluate.ts packages/web/src/server/policy/evaluate.test.ts
git commit -m "test: cover policy decision routing"
```

### Task 3: Lock down money, date, and time boundaries

**Files:**
- Modify: `packages/web/src/server/policy/evaluate.test.ts`
- Modify: `packages/web/src/server/policy/evaluate.ts`

- [ ] **Step 1: Add monetary boundary and malformed-snapshot tests**

Add assertions that an amount exactly equal to `maxPerClaim` and `remainingBudget` passes. Add `0`, `-1`, `1.5`, an empty string, and a malformed mandate amount as fail-closed cases that never produce `auto_pay` and fail the relevant monetary checks.

- [ ] **Step 2: Add strict date and expiry boundary tests**

Test an event-start date, event-expiry date, current UTC date, one day before the event, one day after the event, one day in the future, `2026-02-30`, and a noncanonical date. Test `nowMs = expiryMs - 1` passes and `nowMs = expiryMs` fails.

- [ ] **Step 3: Add the exact 90% confidence boundary test**

Use `confidence: 0.9` with no uncertainties or warnings and assert the confidence check passes and the outcome remains `auto_pay`.

- [ ] **Step 4: Run the focused tests and confirm new edge tests fail where helpers are incomplete**

Run the focused command. Expected: failures identify incomplete strict parsing or boundary handling.

- [ ] **Step 5: Complete the strict helpers**

The money parser must accept only `/^(0|[1-9]\d*)$/`, require claim amount `> 0n`, allow a zero remaining budget/cap snapshot but fail its comparison, and catch `BigInt` conversion errors. The date parser must regex `^(\d{4})-(\d{2})-(\d{2})$`, construct with `Date.UTC`, and round-trip year/month/day to reject impossible dates. Invalid event timestamps also make the receipt-date rule fail closed.

- [ ] **Step 6: Run policy tests and the whole web unit suite**

```powershell
npm.cmd run test -w @tali/web -- src/server/policy/evaluate.test.ts
npm.cmd run test -w @tali/web
```

Expected: every policy test and every existing web test passes.

- [ ] **Step 7: Commit boundary behavior**

```powershell
git add -- packages/web/src/server/policy/evaluate.ts packages/web/src/server/policy/evaluate.test.ts
git commit -m "test: enforce policy boundary behavior"
```

### Task 4: Update mandatory project documentation

**Files:**
- Modify: `PROJECT_REQUIREMENTS.md`
- Modify: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Update requirements**

Add a deterministic-policy scope describing all nine checks, 90% plus no-uncertainty confidence behavior, exact-hash duplicate semantics, hard reject versus review routing, integer base-unit comparisons, and the Sui contract as final authority. Remove deterministic policy evaluation from the out-of-scope list while keeping process persistence, review actions, signing, and payment out of scope.

- [ ] **Step 2: Update architecture and testing design**

Document `src/server/policy` as a pure I/O-free module, the trusted snapshots it accepts, the hard-failure precedence, strict UTC date validation, `BigInt` money handling, injected evaluation time, and the unit-test matrix.

- [ ] **Step 3: Update project status**

Mark the pure deterministic evaluator and its tests complete. Keep live event/mandate loading, `/process` orchestration, decision persistence, state transitions, review endpoints, signing, broadcasting, and frontend removal of mock evaluation pending.

- [ ] **Step 4: Check documentation and commit**

```powershell
git diff --check
git add -- PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md
git commit -m "docs: record policy engine implementation"
```

Expected: no whitespace errors and one documentation commit.

### Task 5: Full verification and handoff

**Files:**
- Verify only; no expected source changes.

- [ ] **Step 1: Run formatting-independent diff checks**

```powershell
git diff --check origin/main...HEAD
git status --short
```

Expected: no diff-check errors and a clean worktree.

- [ ] **Step 2: Run repository tests and type checks**

```powershell
npm.cmd test
npm.cmd run typecheck
```

Expected: all workspace tests and TypeScript checks pass.

- [ ] **Step 3: Run the production build**

```powershell
npm.cmd run build
```

Expected: Sui integration, shared package, and Next.js production builds all complete successfully.

- [ ] **Step 4: Inspect the final branch scope**

```powershell
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git status --short --branch
```

Expected: only the design, implementation plan, policy module/tests, and three mandatory documentation files differ; the worktree is clean.
