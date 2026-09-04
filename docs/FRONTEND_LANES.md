# Frontend work split — two lanes, two machines

Written 4 September, to run the remaining unblocked frontend work on two laptops
at once without either of them waiting on the other.

The lanes below touch **disjoint files**. That is the whole design: neither lane
needs the other's branch, and a merge of both produces no conflict. Nothing here
depends on Shu Heng's mandate or Wey Cheng's endpoints — everything blocked on a
teammate is listed at the bottom and deliberately left out of both lanes.

## Before either lane starts

**Do not run the second laptop against the OneDrive copy of this repository.**
The working tree at `OneDrive/Documents/MUBA Hack/Tali-Treasury` includes its
`.git` directory. If both machines sync the same account they share one
repository, and two machines committing into one synced `.git` corrupts it — that
loses work rather than raising a conflict. On the second machine:

```sh
git clone https://github.com/shuheng0330/Tali-Treasury.git C:/dev/Tali-Treasury
```

Outside any synced folder. `OWNERSHIP.md` already says this about Move build
artefacts; it applies to the whole repository once two machines are involved.

**Both machines: refresh `.env.local` from `.env.example`.** Commit `82d29e2`
added the demo employee and the three statutory stand-in addresses. Locally those
four are still empty, which is why the payroll screens still show the sample
employee. `.env.local` is gitignored, so both machines set it independently and
neither can conflict with the other.

| Key | Value |
|---|---|
| `NEXT_PUBLIC_PAYROLL_EMPLOYEE` | `0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e` |
| `PAYROLL_EPF_ADDRESS` | `0x42e0941ca2f5e7aa8b7d2a0a728206459f9cde4f8f7373cf91c29fe6217f2a89` |
| `PAYROLL_SOCSO_ADDRESS` | `0x8d26d8341c6d8093b651529e8076ab0dbc42d786cebd8525aca3549c9755a6f0` |
| `PAYROLL_EIS_ADDRESS` | `0x51f0939cc9eff9a504569aa874ae1c0bd54e6639dae60a08370f00b0ab81fc81` |

These are public Testnet stand-ins, not real remittance addresses. No key goes in
this file.

---

## Lane A — the payroll screens tell the truth

**Machine:** the OneDrive laptop (its `.env.local` already has package v2 set,
which Lane A's acceptance needs).
**Branch:** `Xiang-A-payroll-truth`, cut from `origin/main`.

### A1 — one source of truth for what stage payroll is at

Three strings still tell a reader the payroll module is not on chain. It is:
package v2 was published in `86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN`.

- `app/(app)/payroll/proof/page.tsx:34` — "because the payroll module is not
  published yet"
- `app/(app)/earnings/page.tsx:23` — "the payroll module is not on chain yet"
- `components/payroll/PayrollDesk.tsx:152` — "Paying a run still needs the
  payroll module on chain"

There are three stages, not two, and the screens currently collapse them into
two. Add `lib/chain-status.ts` returning `unpublished | published | live` from
the environment, with the sentence for each, and read it in all three places.

The honest line today is **published, no funded mandate yet**. Understating what
is already on chain costs us the exact question the demo exists to answer, and a
judge who checks the explorer finds we undersold ourselves.

### A2 — gate `/payroll/setup` on the employer

`components/payroll/PayrollSetup.tsx` has no role gate. Every other action screen
runs `walletAccess()` and renders `RoleNotice`. Setup lets anyone fill the entire
form and only refuses when they press Preview, with a message that reads like a
malfunction rather than a rule.

Put the notice above the form. Keep the form readable — the gate is advisory, the
server refuses the write independently, and hiding it would make the screen look
broken to somebody who expected it.

### Lane A files — nobody else touches these

```
packages/web/src/lib/chain-status.ts            (new)
packages/web/src/lib/chain-status.test.ts       (new)
packages/web/src/lib/wallet-access.ts
packages/web/src/lib/wallet-access.test.ts
packages/web/src/app/(app)/payroll/page.tsx
packages/web/src/app/(app)/payroll/proof/page.tsx
packages/web/src/app/(app)/earnings/page.tsx
packages/web/src/components/payroll/PayrollDesk.tsx
packages/web/src/components/payroll/PayrollSetup.tsx
packages/web/src/components/RoleNotice.tsx
```

Reserved for Lane A even though A2 probably only renders `RoleNotice` unchanged.
Reserving a file costs nothing; discovering both lanes edited it does.

### Lane A acceptance

- No screen claims the module is unpublished while `PAYROLL_PACKAGE_ID` is set.
- No screen claims payroll is live while the mandate and cap are empty.
- A wallet that is not the employer is told so on `/payroll/setup` before filling
  anything, and the form still renders.
- `npm run typecheck` and the web tests pass.

---

## Lane B — evidence and navigation

**Machine:** the second laptop. Nothing in this lane needs a configured payroll
environment.
**Branch:** `Xiang-B-evidence-nav`, cut from `origin/main`.

### B1 — the landing page is missing two real transactions

`lib/evidence.ts` lists three. `SUBMISSION.md` records five. The two absent ones
are the strongest and the newest:

| What | Digest |
|---|---|
| RM6 receipt reimbursed from the browser, paid 1.484561 USDC | `J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq` |
| Published payroll module in package v2 | `86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN` |

The first is the entire claim journey proven end to end, and it is not on the page
anyone lands on.

**Constraint:** neither digest is in `taliUsdcDemo`, and
`packages/sui-integration/**` is Shu Heng's path. Declare them in `evidence.ts`
with a comment naming `docs/SUBMISSION.md` as their source. Do not edit
`packages/sui-integration/src/demo.ts`.

### B2 — the nav marks no active tab on sub-routes

`components/AppNav.tsx:24` compares `pathname === tab.href`, so `/payroll/proof`,
`/payroll/history` and `/treasury/setup` all render with nothing highlighted.
Match on path segments with the longest match winning, so `/payroll/setup` marks
Set up rather than also marking Payroll. Put the matching in `lib/nav.ts` with
tests; the component keeps rendering only.

### B3 — role-aware navigation (Phase 2 of `ROLE_UI_PLAN.md`)

Six tabs to everybody, four of which most readers cannot use.

1. Derive the viewer's roles once, as a **set** — a wallet may hold more than one.
2. Order the nav by what the viewer can actually do. Mark the rest rather than
   hiding them: a hidden tab makes the app look broken to somebody who expected
   it, whereas a visible tab reading "employer only" explains itself.
3. Every route stays reachable by URL. Navigation is a convenience and the screens
   already gate their own actions.

### Lane B files — nobody else touches these

```
packages/web/src/lib/evidence.ts
packages/web/src/lib/evidence.test.ts           (new)
packages/web/src/lib/nav.ts                     (new)
packages/web/src/lib/nav.test.ts                (new)
packages/web/src/lib/viewer-role.ts
packages/web/src/lib/viewer-role.test.ts
packages/web/src/components/AppNav.tsx
packages/web/src/components/landing/Evidence.tsx
packages/web/src/app/(app)/layout.tsx
```

`AppNav` is a client component and can read the session itself, so B3 most likely
never needs `layout.tsx`. Reserved anyway, for the reason above.

### Lane B acceptance

- The landing page lists five real transactions, each opening in an explorer.
- Every route reachable from the nav marks exactly one tab.
- An employee sees Earnings ordered first and is told plainly why Run payroll is
  not theirs. No route 404s or redirects on the basis of a role.
- `npm run typecheck` and the web tests pass.

---

## Off limits to both lanes

Editing any of these from two machines at once is how the merge breaks.

- `packages/web/src/lib/demo-config.ts` — both lanes read it, neither changes it.
- `packages/web/src/components/wallet/**` — both lanes call `useWalletSession()`;
  neither changes the provider. If a lane genuinely needs a new field on the
  session, say so in the group chat before touching it rather than adding it
  twice.
- `packages/web/src/app/globals.css` and the design tokens.
- `docs/**`, including this file. Update it after both lanes have merged.
- `packages/web/src/server/**` and `packages/web/src/app/api/**` — Wey Cheng.
- `contracts/**` and `packages/sui-integration/**` — Shu Heng.
- `packages/shared/**` and `.env.example` — group chat first.

## Merge order

Whichever lane is green first. They are independent, so there is no sequencing
requirement and neither PR should wait for the other. Rebase on `origin/main`
before opening each PR, since main is moving several times a day.

## Deliberately not in either lane

Every one of these is waiting on somebody else, and starting it now produces code
that cannot be verified:

| Work | Waiting on |
|---|---|
| Route payroll, proof, history and earnings off the registered configuration | A `findLatest` reader on `payroll_configurations` — `server/**` is Wey Cheng's — and a registration existing to read |
| Real withdrawal on `/earnings` | `DEMO_STREAM_ID`; Shu Heng opens the salary stream |
| Real run on `/payroll` | `PAYROLL_MANDATE_ID` and `PAYROLL_CAP_ID`; the funded mandate |
| Real broadcast on `/safety` | Employer authorization, Gate 4 |
| Hosted verification | Hosted Supabase migration and runtime configuration |
| Deck, demo video, projector rehearsal | The team, from `DECK.md` |

Phase 3 of `ROLE_UI_PLAN.md` — a role-appropriate entry screen — stays deferred
until after the pitch. It is a product decision, and the night before is the wrong
time to make one.
