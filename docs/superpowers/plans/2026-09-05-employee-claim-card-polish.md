# Employee Claim Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make employee expense-claim cards scannable on mobile and present saved FX evidence with the same compact disclosure used by Treasury.

**Architecture:** Keep `ClaimHome` as the owner of employee claim-history layout and reuse the existing `FxQuoteSummary` compact variant. No domain state or data flow changes; the work is limited to presentation classes, an explicit variant selection, regression coverage, and project documentation.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest, React server rendering.

---

### Task 1: Lock the employee-card presentation with a failing test

**Files:**
- Modify: `packages/web/src/lib/ui-polish.test.tsx`
- Test: `packages/web/src/lib/ui-polish.test.tsx`

- [ ] **Step 1: Add the source-level regression test**

Add this test inside the existing `production-ready application copy` or claim-presentation test group:

```tsx
it('uses compact FX evidence and separate cards in employee claim history', () => {
  const claimHome = source('../components/claim/ClaimHome.tsx');

  expect(claimHome).toContain('<FxQuoteSummary claim={claim} variant="compact" />');
  expect(claimHome).toContain('data-employee-claim-card="true"');
  expect(claimHome).toContain('<ul className="flex flex-col gap-4">');
  expect(claimHome).not.toContain('divide-y divide-rule overflow-hidden');
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
npm.cmd run test -w @tali/web -- src/lib/ui-polish.test.tsx
```

Expected: FAIL because `ClaimHome` still uses the default full FX variant and one divided outer panel.

- [ ] **Step 3: Commit only after the implementation makes this test green**

The red test remains uncommitted until Task 2 so the branch never contains a deliberately failing commit.

### Task 2: Reuse the compact FX summary and separate employee claim cards

**Files:**
- Modify: `packages/web/src/components/claim/ClaimHome.tsx`
- Test: `packages/web/src/lib/ui-polish.test.tsx`

- [ ] **Step 1: Replace the joined list container**

Change the claims list from:

```tsx
<ul className="flex flex-col divide-y divide-rule overflow-hidden rounded-card border border-rule bg-surface">
```

to:

```tsx
<ul className="flex flex-col gap-4">
```

- [ ] **Step 2: Give every claim an independent card boundary**

Change the claim item opening tag to:

```tsx
<li
  key={claim.id}
  data-employee-claim-card="true"
  className="flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-surface p-4"
>
```

This retains the current flexible header, status, update time, and transaction link while giving adjacent cards a 16px gap.

- [ ] **Step 3: Select the shared compact quote presentation**

Replace:

```tsx
<FxQuoteSummary claim={claim} />
```

with:

```tsx
<FxQuoteSummary claim={claim} variant="compact" />
```

The existing compact component already provides human-readable `Intl.DateTimeFormat` dates, expiry state, provider, rate, USD parity, rounding, and a semantic `Rate Details` disclosure.

- [ ] **Step 4: Run the focused test and verify green**

Run:

```powershell
npm.cmd run test -w @tali/web -- src/lib/ui-polish.test.tsx
```

Expected: PASS, including the existing compact FX evidence assertions and the new employee-card assertion.

- [ ] **Step 5: Commit the tested presentation change**

```powershell
git add packages/web/src/components/claim/ClaimHome.tsx packages/web/src/lib/ui-polish.test.tsx
git commit -m "refactor(claims): simplify employee claim cards"
```

### Task 3: Record the customer-facing requirement and delivery status

**Files:**
- Modify: `PROJECT_REQUIREMENTS.md`
- Modify: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/DESIGN.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Update product requirements**

Add this requirement under the employee expense-claim section:

```markdown
- Employee claim history uses distinct mobile-friendly cards. Saved FX evidence
  shows payout and rate first, with provider, readable timestamps, expiry,
  parity, and rounding available under `Rate Details`.
```

- [ ] **Step 2: Update architecture and design guidance**

Record the shared presentation boundary:

```markdown
- Employee and treasury claim histories share `FxQuoteSummary`'s compact
  variant. This keeps quote evidence consistent without duplicating formatting
  or changing the authoritative `Claim` contract.
```

Add to `docs/DESIGN.md`:

```markdown
- On mobile claim histories, use one bounded card per claim and keep secondary
  FX evidence inside the semantic `Rate Details` disclosure.
```

- [ ] **Step 3: Update status and progress**

Add a dated completion entry to both status documents:

```markdown
- Employee expense history now uses independent claim cards and the shared
  compact FX disclosure; claim state, payment links, calculations, and APIs are
  unchanged.
```

- [ ] **Step 4: Check documentation formatting and commit**

Run:

```powershell
git diff --check
```

Expected: exit 0.

Then commit:

```powershell
git add PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md docs/DESIGN.md docs/PROGRESS.md
git commit -m "docs: record employee claim card polish"
```

### Task 4: Verify and deliver the branch

**Files:**
- Verify all modified files; no additional production files expected.

- [ ] **Step 1: Run the complete automated suite**

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
```

Expected: all tests pass, typecheck and production build exit 0, and no high-severity vulnerability is reported.

- [ ] **Step 2: Run repository safety checks**

```powershell
git diff --check origin/main...HEAD
rg -n "^(<<<<<<<|=======|>>>>>>>)" . --glob "!node_modules/**" --glob "!.next/**" --glob "!dist/**" --glob "!.git/**"
```

Expected: diff check exits 0 and `rg` reports no conflict markers. Scan changed files for credential-assignment and private-key patterns without printing any discovered value.

- [ ] **Step 3: Inspect the employee request page at mobile width**

Run the local application with ignored environment values, open `/requests/expense`, and confirm:

```text
Merchant and original amount
Status
Payout in USDC
Rate: 1 USD = … MYR
[Rate Details]
Updated … ago
```

Confirm that opening `Rate Details` shows labelled rows and no raw ISO timestamp or repeated Testnet-payment paragraph.

- [ ] **Step 4: Push normally**

```powershell
git push -u origin codex/employee-claim-card-polish
```

Expected: the remote branch advances without a force push.
