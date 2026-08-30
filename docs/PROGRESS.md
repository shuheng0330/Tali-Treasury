# Build progress

Frontend track (`Xiang-UI`). Updated as phases land.

**Deadline:** submission 5 Sep 23:59 MYT · pitch 6 Sep at APU.

## Phases

| # | Phase | Status | Landed |
|---|---|---|---|
| 0 | Repo, shared contracts, design tokens | ✅ Done | 29 Aug |
| 1 | Design system, app shell, status chips | ✅ Done | 29 Aug |
| 2 | Mobile claim flow — capture to paid | ✅ Done | 29 Aug |
| 3 | Treasurer dashboard and review queue | ✅ Done | 29 Aug |
| 4 | Safety Test panel | ✅ Done | 29 Aug |
| 5 | Landing page | ✅ Done | 30 Aug |
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

## Phase 5 — Landing page ✅

`/`. Hero, the rule apparatus, the objection, why Move, and an honest scope note.

- **The apparatus is the argument.** A claim travels a wire through four gates. The
  refused claim runs **first** and holds longest, because it is the only one of the two
  that demonstrates anything — three consecutive successes before a failure is the order
  for a product tour, not for a claim under scrutiny.
- **The verdict is 28px, not 14px.** "Over the 200.00 cap. Nothing moved." carries the
  message; the 12.5px rule table is detail for whoever is close enough to read it. The
  amount is struck through when refused.
- **Gate order and abort codes are the contract's.** Verified line by line against
  `treasury.move`: 9 → 5 → 6 → 7 is the true relative assert order, and a claim breaking
  both the cap and the budget aborts on 5, which is what the panel predicts.
- **The panel says it is four of seven.** The hero says `spend()` holds seven checks and
  the wire draws four, so the wire names the three it omits rather than leaving a judge to
  find the discrepancy.
- **Amounts carry a unit.** A money product with bare numbers invites "so an RM 84 receipt
  pays 84 SUI?" and has no answer. Every amount is now denominated, and the panel states
  that testnet SUI stands in for a ringgit stablecoin.
- **The QR is 128px**, generated client-side from `window.location.origin`, so it works on
  localhost and on the deployed origin without configuration. Always dark-on-white
  regardless of theme — scanners cope badly with inverted codes.

**Honesty pass.** The first cut of this page presented fabricated evidence: hardcoded
base58 digests, invented latencies ("Paid in 412 milliseconds"), and copy promising
"you get the digest either way, so you can look it up without us". None of it was true —
nothing in the app touches the network yet. All of it is gone. What replaced it:

- The apparatus is labelled **"Illustration — not a live transaction"** in amber at
  readable size, not 11px grey in a corner.
- `/safety` carries a banner saying the panel mirrors the deployed contract's rules and
  abort codes exactly, but does not yet submit to the network.
- The footer states the split plainly: contract live on testnet, app on sample data,
  wiring the safety test is next.

This is a product about not having to trust us. One judge pasting an invented digest into
SuiVision would have ended the competition.

**Rhythm.** Ten sentences on the first draft shared one metre — setup clause, then a terse
three-word punch. That uniformity is itself the AI tell, more than any single word choice
is. Three of them are now deliberately plain or over-long.

## Defects found and fixed this phase

Found by review of the deployed contract against the UI, not by testing the happy path.

- **`/system` linked the package ID as if it were the mandate object.** A local constant
  shadowed the shared one, so `/system` and `/treasury` disagreed about the mandate, and
  the explorer link resolved to a package.
- **`MANDATE_ID` in the mock was the package ID.** An object ID and a package ID cannot be
  the same value.
- **`MEMBER` and `TREASURER` were 65 hex characters.** Sui addresses are 32 bytes. Both
  would have been rejected by `normalizeAddress` the moment Phase 6 touched them.
- **`STRANGER` shared 62 characters with `MEMBER`**, so every truncated display of the two
  was identical — during the unknown-recipient attack the screen read as the agent paying
  itself. Given an unrelated prefix.
- **The raw abort string named the mandate where Sui names the package.** It only ever
  looked right because the two IDs were accidentally equal.
- **`total_budget` was marked on-chain while comparing against `remainingBudget − COMMITTED`.**
  The contract checks its own balance and has no notion of our committed-but-unsettled
  claims. The on-chain rule now compares against the balance; the reserve is stated
  separately.
- **The drain-budget attack could never abort on its own guard.** With a 200 cap and 1,408
  available, any amount large enough to exhaust the budget breaks the cap first, so the
  card promised `total_budget` while the dry run predicted `AMOUNT_ABOVE_LIMIT`. It now
  spends the mandate down below the cap first, which is the only state where the budget
  rule is the one that has to catch it.
- **Amounts were labelled USDC in three screens and SUI in another.** Now one unit
  everywhere.

Found by a second pass over the landing code and the token set:

- **`:focus-visible` set `border-radius: 2px` and was unlayered**, so it beat every
  `rounded-*` utility in `@layer utilities`. Tabbing to any button visibly squared its
  corners from 8px to 2px. Browsers already curve the outline to the element's own radius,
  so the line was doing nothing but damage.
- **`--ink-3` failed WCAG AA everywhere it was used** — 4.06:1 on white, 3.72:1 on canvas,
  3.32:1 on a failed row. Now 96 105 116 in light and 119 129 140 in dark, which clears
  4.5:1 against all three backgrounds in both themes.
- **Rule pass/fail was invisible to screen readers.** Every state signal — the rail, the
  glyphs — was `aria-hidden`, and the row text carried no state word, so the outcome
  reached sighted users through colour and shape and reached everyone else not at all.
  Each row now carries an `sr-only` verdict.
- **The live region announced on every auto-advance**, roughly every five seconds, forever.
  It now fills only when someone picks a claim themselves.
- **`prefers-reduced-motion` was honoured by the CSS and ignored by the loop**, which left
  those users with content still swapping every 600ms and a dot that teleported instead of
  easing. The loop now starts paused for them.
- **`truncate` on the rule label clipped it below ~448px** — "Inside the rem…" on every
  phone in portrait. It wraps instead.
- **The verdict hardcoded the cap**, so a budget failure would have read "Over the 200.00
  cap" and claimed rules 3 and 4 were skipped when rule 3 was the one that failed. Both
  strings derive from the failing gate now.
- **The QR had a 2.7-module quiet zone** against the 4 the spec requires, which is exactly
  the kind of thing that works on a desk and fails in a dark room.
- Re-selecting the already-current claim left a stale timer, because none of the effect's
  dependencies changed. Harmless with two runs of differing length; silently broken the
  moment a third is added. `index` is now a dependency.

## Known issue carried into Phase 6

`COIN_DECIMALS` is **6** while `mandate.coinType` is `0x2::sui::SUI`, which has **9**.
Nothing renders wrong today because every mock figure is minted and displayed through the
same constant, but the moment real chain data arrives, `toMandateView` copies raw MIST
straight through and the deployed mandate's 450000000 MIST renders as "450.00" instead of
0.45. Gas in `AttackResult` has the same fault today. **Decide before wiring:** either
switch to testnet USDC and keep 6, or keep SUI and move to a per-coin decimals lookup.

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
