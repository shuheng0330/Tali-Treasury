# Hosted Demo Team Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Shu Heng and Lim Wey Cheng to the already-seeded hosted demo event so all three teammates are active members with reproducible migration history.

**Architecture:** Preserve the already-applied `20260831000000` migration exactly and add an idempotent `20260831010000` migration for the two missing members. Test the full three-person mapping on a clean local database, merge the migration before hosted deployment, apply only the additive migration, then record the verified hosted state in a follow-up documentation commit.

**Tech Stack:** PostgreSQL 17, Supabase CLI 2.116.0, pgTAP, PowerShell, npm workspaces, Vitest, TypeScript, Git, GitHub REST API.

---

## File map

- Create `supabase/migrations/20260831010000_add_demo_team_members.sql` — additive, idempotent membership data only.
- Modify `supabase/tests/database/hosted_demo_seed.test.sql` — verify all three confirmed active mappings.
- Modify `PROJECT_REQUIREMENTS.md` — record the fixed hosted demo identity mapping.
- Modify `ARCHITECTURE_AND_CODING_DESIGN.md` — record immutable seed-migration sequencing and deployment verification.
- Modify `PROJECT_STATUS.md` — separate prepared, deployed, and verified seed status.
- Modify `README.md` — keep the public project status and next action accurate.
- Modify `docs/PROGRESS.md` — keep the authoritative team checklist synchronized.

### Task 1: Add failing tests for the missing team members

**Files:**
- Modify: `supabase/tests/database/hosted_demo_seed.test.sql`

- [ ] **Step 1: Increase the pgTAP plan and add the three new assertions**

Change `select plan(6);` to `select plan(9);`, then insert the following block immediately before `select * from finish();`:

```sql
select is(
  (
    select count(*)
    from public.event_members
    where event_id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
      and wallet_address in (
        '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
        '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471',
        '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e'
      )
      and active
  ),
  3::bigint,
  'all three teammates are active demo event members'
);

select is(
  (
    select display_name
    from public.event_members
    where event_id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
      and wallet_address = '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9'
      and active
  ),
  'Shu Heng',
  'treasurer wallet maps to Shu Heng'
);

select is(
  (
    select display_name
    from public.event_members
    where event_id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
      and wallet_address = '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471'
      and active
  ),
  'Lim Wey Cheng',
  'agent wallet maps to Lim Wey Cheng'
);
```

- [ ] **Step 2: Start and reset the local Supabase database**

Run:

```powershell
npm.cmd run supabase:start
npm.cmd run supabase:reset
```

Expected: the local stack starts and both existing migrations apply successfully.

- [ ] **Step 3: Run the database tests and verify the new assertions fail**

Run:

```powershell
npm.cmd run supabase:test
```

Expected: the existing assertions pass, while the new teammate-count, Shu Heng, and Lim Wey Cheng assertions fail because only Kian Xiang is seeded.

### Task 2: Add the minimal additive migration

**Files:**
- Create: `supabase/migrations/20260831010000_add_demo_team_members.sql`
- Test: `supabase/tests/database/hosted_demo_seed.test.sql`

- [ ] **Step 1: Create the additive membership migration**

Create the file with exactly:

```sql
insert into public.event_members (
  event_id,
  wallet_address,
  display_name,
  active
)
values
  (
    'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
    '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
    'Shu Heng',
    true
  ),
  (
    'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
    '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471',
    'Lim Wey Cheng',
    true
  )
on conflict (event_id, wallet_address) do update set
  display_name = excluded.display_name,
  active = excluded.active;
```

- [ ] **Step 2: Reset the database so the new migration runs from a clean state**

Run:

```powershell
npm.cmd run supabase:reset
```

Expected: migrations `20260830000000`, `20260831000000`, and `20260831010000` apply in order.

- [ ] **Step 3: Run pgTAP and verify the red tests turn green**

Run:

```powershell
npm.cmd run supabase:test
```

Expected: both database test files pass with 42 total assertions and zero failures.

- [ ] **Step 4: Lint the local public schema**

Run:

```powershell
npm.cmd exec -- supabase db lint --local --schema public --level warning
```

Expected: no public-schema errors.

- [ ] **Step 5: Commit the tested migration**

Run:

```powershell
git add -- supabase/migrations/20260831010000_add_demo_team_members.sql supabase/tests/database/hosted_demo_seed.test.sql
git commit -m "feat: add all demo team members"
```

### Task 3: Document the prepared deployment and run repository verification

**Files:**
- Modify: `PROJECT_REQUIREMENTS.md`
- Modify: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Modify: `PROJECT_STATUS.md`
- Modify: `README.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Record the fixed demo mapping in requirements**

Add this section before `## Explicitly out of scope for this increment` in `PROJECT_REQUIREMENTS.md`:

```markdown
## Hosted demo configuration

- Demo event `ba7e50e2-7e7b-4a67-a505-9e3a329739ae` uses the official USDC mandate.
- Shu Heng, Lim Wey Cheng, and Kian Xiang must each be active event members under
  their confirmed canonical Sui wallet addresses.
- Demo membership migrations must be idempotent and must not delete unrelated
  event members.
```

- [ ] **Step 2: Record the migration sequence in architecture**

Append this paragraph to `## Deployment design` in `ARCHITECTURE_AND_CODING_DESIGN.md`:

```markdown
Hosted demo data uses immutable additive migrations. Migration `20260831000000`
created the fixed demo event and Kian Xiang membership; migration
`20260831010000` adds Shu Heng and Lim Wey Cheng without rewriting the applied
seed or deleting other members.
```

- [ ] **Step 3: Keep pre-deployment status truthful**

In `PROJECT_STATUS.md`, set `Last updated` to `31 August 2026 (MYT)`, record under
`## Hosted schema verified` that migration `20260831000000` seeded the event and
Kian Xiang, and replace the pending seed bullet with:

```markdown
- apply and verify additive migration `20260831010000` for Shu Heng and Lim Wey
  Cheng;
```

In `README.md` and `docs/PROGRESS.md`, state that the event and Kian Xiang are
hosted while the two-member additive migration is prepared but not yet applied.
Do not claim that all three hosted members are verified at this stage.

- [ ] **Step 4: Create a temporary no-import Vitest config for this nested worktree**

Create `.codex-vitest.config.mjs` with:

```javascript
export default {
  test: {
    environment: 'node',
  },
};
```

This file is verification-only and must be deleted before committing.

- [ ] **Step 5: Run application tests with the explicit worktree config**

Run:

```powershell
npm.cmd exec -w @tali/treasury-sui -- vitest run src --config "C:\Users\User\Downloads\MUBAHackathon\.worktrees\pr3-docker-fix\.codex-vitest.config.mjs"
npm.cmd exec -w @tali/web -- vitest run src/server src/app/api --config "C:\Users\User\Downloads\MUBAHackathon\.worktrees\pr3-docker-fix\.codex-vitest.config.mjs"
```

Expected: 14 Sui integration tests and 69 backend tests pass.

- [ ] **Step 6: Run build, type checks, audit, and diff checks**

Run:

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd audit --audit-level=high
git diff --check
```

Expected: every command exits zero and npm reports zero high-or-greater vulnerabilities.

- [ ] **Step 7: Delete the temporary Vitest config and commit documentation**

Delete `.codex-vitest.config.mjs`, confirm it is absent from `git status`, then run:

```powershell
git add -- PROJECT_REQUIREMENTS.md ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md README.md docs/PROGRESS.md
git commit -m "docs: prepare hosted team seed deployment"
```

### Task 4: Merge the migration pull request before hosted deployment

**Files:**
- No file changes.

- [ ] **Step 1: Confirm the branch contains only the intended commits and files**

Run:

```powershell
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: a clean worktree; the original seed commit, design/plan commits,
additive migration/test commit, and documentation commit; no unrelated files.

- [ ] **Step 2: Push the feature branch without updating `origin/Shuheng`**

Run:

```powershell
git push -u origin codex/seed-all-demo-members
```

Expected: remote branch `codex/seed-all-demo-members` is created.

- [ ] **Step 3: Create and merge a pull request to `main`**

Use the authenticated GitHub REST API with the Git Credential Manager token kept
only in memory. Create a pull request titled `feat: add all hosted demo team
members`, head `codex/seed-all-demo-members`, base `main`, and include the local
and hosted preflight results. Merge it only after GitHub reports it mergeable.
Never print the credential value.

Expected: the API returns `merged: true` and a merge commit SHA.

- [ ] **Step 4: Verify the merge is on `origin/main`**

Run:

```powershell
git fetch origin
git merge-base --is-ancestor HEAD origin/main
```

Expected: exit code zero.

### Task 5: Apply and verify only the additive hosted migration

**Files:**
- No repository changes before verification completes.

- [ ] **Step 1: Recheck hosted migration history sequentially**

Run:

```powershell
npm.cmd exec -- supabase migration list --linked
```

Expected: `20260830000000` and `20260831000000` match locally and remotely;
`20260831010000` is local-only.

- [ ] **Step 2: Dry-run the hosted push**

Run:

```powershell
npm.cmd exec -- supabase db push --linked --dry-run --skip-vault
```

Expected: the only pending file is
`20260831010000_add_demo_team_members.sql`; seeds and roles are empty.

- [ ] **Step 3: Apply the reviewed migration**

Run:

```powershell
npm.cmd exec -- supabase db push --linked --skip-vault --yes
```

Expected: `20260831010000_add_demo_team_members.sql` applies successfully with
no seed, role, or vault changes.

- [ ] **Step 4: Verify remote history and idempotent completion**

Run sequentially:

```powershell
npm.cmd exec -- supabase migration list --linked
npm.cmd exec -- supabase db push --linked --dry-run --skip-vault
npm.cmd exec -- supabase db lint --linked --schema public --level warning
```

Expected: local and remote history match through `20260831010000`, the dry-run
reports `upToDate: true`, and lint reports no schema errors.

- [ ] **Step 5: Verify hosted rows using a read-only Management API query**

Use the Supabase CLI access token from Windows Credential Manager only in memory
and call the read-only database query endpoint. Execute:

```sql
select
  e.id,
  e.mandate_object_id,
  e.treasurer_wallet,
  e.allowed_categories,
  e.starts_at,
  e.expires_at,
  json_agg(
    json_build_object(
      'display_name', m.display_name,
      'wallet_address', m.wallet_address,
      'active', m.active
    ) order by m.display_name
  ) filter (
    where m.wallet_address in (
      '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
      '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471',
      '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e'
    )
  ) as confirmed_members
from public.events e
join public.event_members m on m.event_id = e.id
where e.id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
group by e.id;
```

Expected: the event identifiers and configuration match the original seed, and
the result contains the three exact active name-to-wallet mappings. Do not print
or persist the access token.

### Task 6: Record hosted verification and merge the documentation follow-up

**Files:**
- Modify: `ARCHITECTURE_AND_CODING_DESIGN.md`
- Modify: `PROJECT_STATUS.md`
- Modify: `README.md`
- Modify: `docs/PROGRESS.md`
- Check: `PROJECT_REQUIREMENTS.md`

- [ ] **Step 1: Start a clean documentation branch from the merged main branch**

Run:

```powershell
git switch -c codex/verify-hosted-demo-members origin/main
```

- [ ] **Step 2: Record the verified deployment**

Update the deployment paragraph in `ARCHITECTURE_AND_CODING_DESIGN.md` to state
that `20260831010000` was applied and catalog-verified on 31 August 2026.

In `PROJECT_STATUS.md`, add under hosted verification:

```markdown
- Seed migration `20260831000000` and additive membership migration
  `20260831010000` are applied.
- Demo event `ba7e50e2-7e7b-4a67-a505-9e3a329739ae` contains Shu Heng, Lim Wey
  Cheng, and Kian Xiang as verified active members.
```

Remove the additive migration from pending integration. Update `README.md` and
`docs/PROGRESS.md` so the next action is deployed API configuration and UI wiring,
not seed data. Confirm `PROJECT_REQUIREMENTS.md` still matches the verified data.

- [ ] **Step 3: Verify and commit the documentation**

Run:

```powershell
git diff --check
git status --short
git add -- ARCHITECTURE_AND_CODING_DESIGN.md PROJECT_STATUS.md README.md docs/PROGRESS.md
git commit -m "docs: record hosted demo team verification"
```

- [ ] **Step 4: Push, create, and merge the documentation pull request**

Run:

```powershell
git push -u origin codex/verify-hosted-demo-members
```

Use the authenticated GitHub REST API without printing credentials to create a
pull request titled `docs: record hosted demo team verification` to `main`, then
merge it after GitHub reports it mergeable.

- [ ] **Step 5: Stop local Supabase and perform the final state check**

Run:

```powershell
npm.cmd run supabase:stop
git fetch origin
git status --short --branch
```

Expected: local Supabase stops with its backup preserved, the documentation
worktree is clean, and the final documentation commit is present on
`origin/main`.
