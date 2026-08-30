# Team build progress

This is the authoritative implementation checklist. A UI phase marked complete
means the UX works against its declared data source; it does not imply that the
whole product flow is live.

**Deadline:** submission 5 Sep 23:59 MYT · pitch 6 Sep at APU.

## Current status by subsystem

| Subsystem | Status | Completed | Pending |
|---|---|---|---|
| Sui Move | ✅ Live | Package, 17 tests, USDC mandate, valid payment, two rejected safety attempts | Live revoke/withdraw evidence only if needed for the demo |
| Sui TypeScript boundary | ✅ Ready | Reads, builders, config, USDC helpers, abort mapping | Backend signer integration |
| Shared contracts | ✅ Ready | Claim, event, policy, audit, mandate and endpoint types | Evolve only with team agreement |
| Web dashboard | ✅ Live read-only | Current mandate state comes from Sui Testnet | Signed actions and backend claim totals |
| Receipt and claim backend | ✅ Complete locally | Gemini validation, private storage adapter, persistence, duplicate checks, guarded API routes, 69 backend tests and 33 database assertions | Hosted migration, seed data and signed identity verification |
| Claim and review UX | 🟡 Mocked | Capture, confirmation, rule display and queue UI | Replace mock calls with the receipt/claim APIs; payment orchestration remains pending |
| Safety Test UI | 🟡 Mocked with live evidence links | Local preview plus links to two real rejected transactions | Interactive signed attempts and revocation scenario |
| Deployment | ⬜ Pending | Local production build | Hosted URL and fresh-browser verification |
| Submission | ⬜ Pending | — | Landing content, videos, deck, disclosure and rehearsal |

## Real versus simulated

- **Real:** package, USDC mandate, live read-only dashboard, one payment, overspend rejection, unauthorized-recipient rejection.
- **Locally implemented but not hosted:** receipt analysis, private receipt storage,
  event-scoped duplicate checks, claim persistence and claim listing.
- **Simulated in the current UI:** receipt analysis, claim persistence, policy
  orchestration, review actions, payment result screens, revoke preview and
  interactive safety controls.
- **Never simulated without a label:** digests, checkpoints, gas, finality, wallet signatures, or chain state.

## Frontend phase history

The sections below preserve UI design decisions made during the Xiang-UI work.
References to signing, payment, gas, or chain outcomes describe the intended
live experience, not current functionality. The integrated app labels those
interactions as simulations and links separately to genuine Testnet evidence.

| # | Phase | Status | Landed |
|---|---|---|---|
| 0 | Repo, shared contracts, design tokens | ✅ Done | 29 Aug |
| 1 | Design system, app shell, status chips | ✅ Done | 29 Aug |
| 2 | Mobile claim flow — capture to paid | 🟡 Mock complete | 29 Aug |
| 3 | Treasurer dashboard and review queue | 🟡 Mixed: live mandate, mock claims | 29 Aug |
| 4 | Safety Test panel | 🟡 Mock complete; live evidence linked | 29 Aug |
| 5 | Landing page | ⬜ Not started | — |
| 6 | Wire to live contract and backend | 🟡 Live reads complete; writes/backend pending | 29 Aug |
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

Verified: build passes, all routes serve 200, claim page renders end to end.

## Phase 3 — Treasurer dashboard and review queue ✅

`/treasury`. Mandate header, budget meter, stat strip, tabbed queue, revoke.

- **Rows are decidable without opening them.** Amount right-aligned in tabular figures,
  submitter and category, then the full rule-fit table with the real comparison on each
  line — `340.00 vs 200.00`, not "over limit". A verifiable comparison is what makes the
  verdict checkable rather than assertable.
- **A failed rule and an uncertain agent are different reviewer tasks**, so they carry
  different glyphs. A red wedge means a rule failed; an amber circle means every rule
  passes but the agent is unsure. Merging them into one badge would hide the distinction
  that decides what the reviewer actually does.
- **The agent's note is typographically separate** from the rule table — italic, prefixed,
  muted. The table is fact; the note is judgement. Letting them share a treatment is the
  most dangerous thing an agentic finance UI can do.
- **Approve and Reject are not mirror images.** Filled primary against a ghost outline,
  with a gutter between them, per NN/g on consequential options sitting near benign ones.
- **Revoke needs type-to-confirm on the event name** and names its collateral damage
  ("3 claims are awaiting review. They will be cancelled."). Approving is reversible;
  revoking is not, so only one of them gets a modal.
- **The empty state is evidence of work done**, not a celebration: how many the agent
  paid and how many it escalated, plus the route into the safety test.

## Phase 4 — Safety Test panel ✅

`/safety`. The differentiator, and the reason the product exists.

- **The judge sets the amount and the recipient.** Four presets — overspend, unknown
  recipient, after revocation, drain budget — plus a custom field with a free address.
  A locked preset list invites "yeah but it's rigged"; an open field kills that.
- **The dry run predicts the abort before firing**, with the reason stated on screen:
  we show you this *before* firing so you can check we did not fake it afterwards.
  Committing to an outcome in advance is far more persuasive than a bare result.
- **The bypass toggle is real, not decorative.** With it off, the app refuses the send
  and says so plainly: *a client-side check is a convenience, not a guarantee — we wrote
  it, so we could remove it.* Tick bypass, fire the identical transaction, and the
  contract refuses it instead. That two-step is the strongest sequence in the demo.
- **The reveal is staged, the outcome is not.** Signed → broadcast → executing, with the
  **digest appearing before the result**, so the judge holds a verifiable handle to a
  transaction whose outcome is still unknown. The treasury figure sits on screen
  throughout, labelled unchanged.
- **A rejection is drawn as enforcement, not failure.** Shield rather than a cross,
  "Blocked by your rules" rather than "Transaction failed", and the mandate as the
  grammatical subject: *the mandate refused a 9,000.00 transfer. Nothing left your
  treasury.* Nobody is blamed and the non-effect is stated out loud.
- **Rules that passed are shown too.** A blanket refusal proves nothing; a granular one
  proves the check is real. Where more than one rule would have stopped it, the panel
  says so.
- **Gas burned is on screen** — a fake rejection costs nothing, a real on-chain abort
  costs gas. It is the cheapest proof available.
- **The counterfactual is one button.** A system that rejects everything is broken, not
  safe, so the first thing offered after a block is the same path with a valid amount:
  *same contract, same agent, same code path.*
- **Abort codes come from `treasuryErrorFromCode`** in Shuheng's package, so the message
  on screen is the contract's own error text rather than a paraphrase. The abort order
  follows the assert order in `treasury.move`, so the predicted code is the one the chain
  would actually raise first.

Routes now: `/` landing · `/claim` · `/treasury` · `/safety` · `/system`.

Verified: build passes, all five routes serve 200 with expected content.

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
