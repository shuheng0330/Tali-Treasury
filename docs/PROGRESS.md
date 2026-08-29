# Build progress

Frontend track (`Xiang-UI`). Updated as phases land.

**Deadline:** submission 5 Sep 23:59 MYT · pitch 6 Sep at APU.

## Phases

| # | Phase | Status | Landed |
|---|---|---|---|
| 0 | Repo, shared contracts, design tokens | ✅ Done | 29 Aug |
| 1 | Design system, app shell, status chips | ✅ Done | 29 Aug |
| 2 | Mobile claim flow — capture to paid | ✅ Done | 29 Aug |
| 3 | Treasurer dashboard and review queue | ⬜ Not started | — |
| 4 | Safety Test panel | ⬜ Not started | — |
| 5 | Landing page | ⬜ Not started | — |
| 6 | Wire to live contract and backend | ⬜ Not started | — |
| 7 | Submission pack | ⬜ Not started | — |

Legend: ✅ done · 🟡 in progress · ⬜ not started · ⛔ cut

---

## Phase 0 — Repo, shared contracts, design tokens ✅

Branched `Xiang-UI` from `Shuheng`, which already carries the deployed Move package.

- `packages/shared` — `@tali/shared`. Claim, event, policy, audit and API types.
  Deliberately does not duplicate the chain layer: `MandateView` is the JSON-safe
  projection of `@tali/treasury-sui`'s `MandateState`, which uses `bigint`.
- Amounts are base-unit decimal strings end to end. No float touches money.
- `CLAUDE.md`, `docs/DESIGN.md`, `docs/OWNERSHIP.md`.
- Attribution suppressed at harness level; every commit authored by a human.

**Corrections against the original plan.** Shuheng's deployed contract is the source of
truth, so two earlier decisions were reversed:

- Abort codes are **0–11** (his), not the 1–9 originally drafted.
- His `AgentCap` has `store`, so it is transferable. Not worth republishing: revocation
  lives on the `Mandate`, so a transferred cap still cannot spend past a revoke.

## Phase 1 — Design system, app shell, status chips ✅

- Token set wired through Tailwind v4 `@theme`, so dark mode is a real palette rather
  than an inversion.
- `StatusChip` — every status pairs a glyph **shape** with its colour, so it survives
  greyscale and a bad projector. **Revoked is dashed**; every other status is solid.
- `Money` — tabular figures, unit smaller and lighter than the value, `struck` variant.
- `BudgetMeter` — bullet graph with settled / committed / available against a cap
  marker. Exposed as an ARIA `meter`, not a `progressbar`, because it reports a value
  in a range rather than task completion.

Next 15.5.4 was swapped for 16.3.3 — the former carries a published CVE and judges run
`npm audit`.

## Phase 2 — Mobile claim flow ✅

The member journey at `/claim`, built against `src/lib/mock/` so it never blocks on the
backend. Six steps: **list → capture → reading → confirm → rule check → paid**, with a
held path off the rule check.

Decisions taken from the research, each one deliberate:

- **Native camera** via `<input type="file" capture="environment">` rather than a custom
  camera with edge detection. Saves around six hours, and the native camera is better
  than anything we would build in that time.
- **The confirm screen asserts the extraction as fact.** Source image pinned above the
  fields and tappable to zoom; merchant, amount and date editable with amount largest;
  only genuinely uncertain fields are boxed and marked "not sure". **No confidence
  percentage anywhere** — no product in the category shows one.
- **Retake lives in the confirm header**, not on a separate preview step. One screen
  fewer, and confirm is the better place to notice a bad photo because you can see what
  it produced.
- **Rule check reveals one rule at a time**, 180ms apart, with on-chain rules labelled.
  The stagger is the demo: this is the only screen that shows the chain doing anything.
- **Paid shows three timestamps** — submitted, approved, confirmed — because "41 ms"
  only means something if the clock is visible. Digest, checkpoint, both explorers.
- **Extraction failure is a flat sentence** with empty fields, not a dialog:
  *"Couldn't read this receipt. Enter the details manually."*
- **Held is not an error.** It names the rule that stopped it, states the non-effect
  ("nothing was paid and nothing left the treasury"), and offers a route forward.

The mock decides pass or hold by comparing the confirmed amount against the mandate's
per-claim cap, so **both demo paths are reachable by typing a different number** — no
code change, no hidden toggle. Cap is 200; 84 pays, 340 is held.

Routes now: `/` landing · `/claim` member flow · `/system` design reference.

Verified: build passes, all routes serve 200, claim page renders end to end.

---

## Cut list

Agreed in advance so nothing is argued about at 2am. Cut in this order if hours run out.

1. zkLogin — replaced by walletless reads; only submitting needs a key
2. Sponsored transactions
3. Public transparency page
4. Duplicate-review resolution UI — the check stays, the resolution screen goes
5. Languages beyond English and Bahasa Malaysia
6. On-chain category check — stays off-chain policy

Already cut and not coming back: Gonka track, mainnet, real funds, Walrus, editable
mandate policies, budget top-ups, currency conversion.

## Standing rules

- Screens ship with hover, `focus-visible`, empty and loading states. Judges click things.
- Nothing below 18px above the fold; the demo is projected 3–8m away.
- Feature freeze **3 Sep**. After that: README, two videos, deck, rehearsal.
- Submit **5 Sep by noon**, not 23:59.
