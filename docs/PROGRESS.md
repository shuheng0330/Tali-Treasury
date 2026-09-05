# Team build progress

## 5 September — mobile judging polish

- Reframed the EPF proof as a short safety test with underpayment selected by
  default, zero-movement evidence, progressive calculation disclosure, and a
  successful treatment for abort 24.
- Condensed the expense-treasury overview and moved Sui rules/member creation
  behind accessible disclosures.
- Rebuilt review and history rows as mobile claim cards with concise outcomes,
  failed-first checks, compact quote evidence, and 48px actions.
- Responsive inspection found no horizontal overflow at 320, 375, 430, 768, or
  1280px. Fresh verification passes 48 Sui integration tests, 685 web tests with
  one intentional skip, type checking, the production build, and a
  zero-vulnerability audit.

## 5 September — registered payroll binding and live stream

- Added authenticated employer/employee registry listing without capability data.
- Bound payroll, history, proof and earnings to authorized `?payroll=` selection.
- New runs derive chain IDs and recipients from the registry, store their mandate,
  and verify capability ownership before signing.
- Opened and registered a 1 USDC stream on Testnet, displayed its accrual, and
  withdrew the full 1 USDC as the immutable employee. Withdrawal transaction
  `DHcoXyjw9PP11EQPefAfffZoHWWX3Nz3ZWACvxvmrX6H` completed at checkpoint
  `380020001`.
- Hosted migration and team Testnet end-to-end verification remain rollout work.

This is the authoritative implementation checklist. A UI phase marked complete
means the UX works against its declared data source; it does not imply that the
whole product flow is live.

**Planning deadline:** submission 5 Sep at noon MYT · pitch 6 Sep at APU. Confirm
the submission time against the organiser channel; older notes used 23:59.

### 4 September product direction

- Tali is now payroll-first. The primary employer CTA will be **Set Up Payroll**.
- Set Up Payroll creates and funds `PayrollMandate<USDC>`; it does not create a
  reimbursement mandate.
- **Create Expense Treasury** remains a separate flow backed by the existing
  `Mandate<USDC>` and the proven receipt-claim system.
- The immediate definition of done is one authorized payroll, one atomic policy
  refusal and one employee stream withdrawal on Testnet. See
  [PAYROLL_LAUNCH_PLAN.md](PAYROLL_LAUNCH_PLAN.md).
- Demo funding is fixed at an RM30 source wage with an RM50-equivalent total
  ceiling. The configured MYR/USD quote converts every amount to USDC; the app
  must never submit RM base units as though they were micro-USDC.

## Current status by subsystem

### 5 September `main` integration verification

- Integrated the 43 incoming commits through `fa490fb`, including payroll write
  RBAC, role-aware screens, expense-treasury setup, event roster APIs, the purple
  visual refresh, and the submission/deck documents.
- Consolidated the parallel payroll-registration implementations around the
  strict digest-only verifier, immutable registry and centralized
  `TALI_EMPLOYER_WALLET` authorization while retaining the latest setup UI.
- Integrated the latest role-aware navigation, treasury action gates and
  submission corrections from `main` through `c20925d`.
- Fixed the payroll preview route to use the authenticated employer session
  instead of the disabled insecure-demo identity gate, allowing the live USDC
  calculation while keeping wrong-wallet and cross-origin requests blocked.
- Fixed independent FX rounding that left the EIS transfer one micro-USDC below
  its immutable floor. The quote now adds only the required rounding difference
  to the employer contribution; the previously failing RM30 run passes a real
  Testnet simulation without broadcasting a payment.
- Created and durably registered payroll mandate `0xa04894…f1100` with a
  `12.363385 USDC` budget, then executed the first authenticated RM30 payroll.
  Transaction `HpUwPspN9QgoXBmLARh8iJDFSxEACSwZNxhzz3zXr27y` paid the employee
  and all three statutory stand-ins atomically, leaving `3.317095 USDC` with
  `run_count = 1`. [Evidence](PAYROLL_TESTNET_EVIDENCE.md).
- Safety payrolls now bypass execution preflight only when an explicit
  underpayment is requested, allowing Sui to record the failed transaction.
  Failed digests and abort codes persist and link to the explorer; normal
  payrolls retain checked preparation.
- Verified deficient-EPF transaction
  `Hqw44T6qTsQKW5ooPGM8BQmN6uNgaXk6TYNvw9tgFT8V`: Sui refused it on abort
  `24`, charged only signer gas, moved no USDC, and left the mandate at
  `3.317095 USDC`, `run_count = 1` and `total_paid = 9.046290 USDC`.
- Fast-forwarded to `main` at `9f6a07f`; wallet sign-in now surfaces sanitized
  backend failures before applying wallet/network heuristics.
- Upgraded the Move package to Testnet version 2 with `payroll` and `treasury` at
  `0xeb973dbac9e4e5c2ea0c31ffb6b51b4df1f34e05443f970e89a35301e6b97688`.
  Upgrade transaction: `86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN`.
- Locked the demo employee plus separate EPF/SOCSO/EIS stand-ins. Funded the Slush
  employer with 9.5 USDC and 0.1 SUI; its verified balance is now 12.640845 USDC
  and 0.1 SUI, ready for authenticated mandate setup.
- Fixed Set Up Payroll to prefill the configured employee instead of silently
  copying the authenticated employer address into the immutable allowlist.
- Reconciled the replaced payroll-registry migration without resetting local
  data: the legacy registration is preserved read-only for audit, while the new
  strict registry verified the finalized setup digest against its historical
  creation-state objects and stored the current demo payroll.
- Fresh combined verification passes 42 Move tests, 48 Sui integration tests,
  692 web tests (691 passing and one intentional skip), 154 pgTAP assertions,
  root typecheck, production build and a zero-vulnerability audit.

### 4 September roster-backend verification

- Treasurer-only active roster GET and add-only POST are implemented against the
  existing `event_members` table; no migration was added for this increment.
- The dashboard add-member transport now matches the shared request/response
  contract. Authoritative roster rendering remains a frontend handoff.
- Fresh verification: 45 Sui tests passed; 535 web tests completed with 534 passing
  and one intentional skip; all 125 pgTAP assertions passed.

### 3 September local verification update (`test_main`)

- Slush zkLogin sign-in fixed and covered by regression tests.
- One authorized native 1 USDC payment and two reconciliation checks passed;
  the synthetic database-write interruption was recovered without another payment.
  Budget was 16 USDC afterward. [Evidence](LOCAL_PAYMENT_RECONCILIATION_SMOKE.md).
- [MYR live-reference quotes](MYR_USDC_QUOTES.md) are implemented locally with
  quote-bound approval, integer rounding, expiry checks and shared provider cache.
  Browser payment verified: RM6 → 1.484561 USDC to Slush, transaction
  `J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq`. The separate 10 USDC
  demo mandate had 8.515439 USDC remaining. [Demo evidence](LOCAL_SINGLE_WALLET_DEMO.md).
- Paid tab now includes Auto-paid / Paid after review chips based on recorded
  approval history; Rejected has its own tab and displays the recorded reason.
- Correction and rejection reasons are visible in Treasury and My Claims.
  Status and next action come first; policy checks and FX metadata expand on demand.
- Hosted migration/deployment and the gas-fee
  reporting correction remain pending. Historical phase notes below retain the
  earlier milestones, not a claim of current hosted completeness.

| Subsystem | Status | Completed | Pending |
|---|---|---|---|
| Sui Move | ✅ Live | Package, 17 tests, USDC mandate, valid payment, two rejected safety attempts | Live revoke/withdraw evidence only if needed for the demo |
| Sui TypeScript boundary | ✅ Ready | Reads, builders, config, USDC helpers, abort mapping, backend signer and native-USDC payment/recovery smoke | Hosted end-to-end verification |
| Shared contracts | ✅ Ready | Claim, event, policy, audit, mandate and endpoint types | Evolve only with team agreement |
| Web dashboard | ✅ Complete locally; live chain data | Mandate reads, review actions, mobile card hierarchy, compact rules/FX evidence and payment evidence | Hosted verification and backend claim totals |
| Receipt and claim backend | ✅ Complete locally | Wallet sessions, one-time analysis drafts, private storage, deterministic policy, atomic review/payment states, and safe exact-digest reconciliation | Apply latest migrations and configure hosted API/origin/signer |
| Claim and review UX | ✅ Complete locally | Browser MYR reimbursement verified, readable outcomes and reasons, exact quote approval, payment-status polling | Hosted verification and member correction/resubmission |
| Payroll and treasury write RBAC | ✅ Complete locally | Employer-only payroll/revoke/safety APIs and employee-only stream withdrawal | Configure hosted employer wallet and verify both roles |
| Event-member roster backend | ✅ Complete locally | Treasurer-only active roster GET and add-only POST, safe duplicate handling, shared contracts, and dashboard transport adapter | Deploy; verify treasurer success/non-treasurer 403; render authoritative roster in Treasury UI |
| Payroll registration backend | ✅ Complete locally | Employer-only digest registration, finalized Sui object verification, immutable service-role registry and idempotent recovery | Apply migration and implement explicit registered-payroll selection |
| Payroll contract and chain boundary | ✅ Live on Testnet | Package v2, funded mandate, atomic RM30 payroll, abort-24 deficient-EPF refusal, 1 USDC stream and employee withdrawal are verified | Hosted-registry verification |
| Payroll application | ✅ Live locally and on Testnet | Authenticated setup, RM30 run, refusal, stream accrual and employee-only withdrawal use the immutable employee | Host and verify a fresh deployment |
| Authenticated Set Up Payroll | ✅ Live via local app; binding and hosted rollout pending | Slush funded `0xa04894…f1100`; its historical creation state passed strict verification and immutable, idempotent Supabase registration | Apply the hosted migration, repeat from a fresh browser and bind payroll pages to the selected record |
| Create Expense Treasury | 🟡 Screen built and able to sign | `/treasury/setup`: treasurer form, USDC funding preview, wallet-signed creation against the published package, AdminCap retained and AgentCap issued, registration retry that never refunds | Add `POST /api/events`, then event selection/routing and event-aware capability mapping |
| Safety Test UI | ✅ Complete locally | Employer-only signed deficient-EPF attempt, concise expected result, abort-24 success treatment, and failed-transaction evidence | Hosted fresh-wallet verification |
| Deployment | ✅ Live reads; auth rollout pending | Vercel production and live Sui dashboard verified | Push wallet migration, configure exact HTTPS origin, verify protected writes |
| Payroll and salary streams | ✅ Live on Testnet | Funded mandate, atomic payroll, registered 1 USDC stream, accrual and employee withdrawal are live without global stream IDs | Host and verify a fresh deployment |
| Submission | 🟡 Written, not recorded | `docs/SUBMISSION.md` (verified evidence, two demo scripts, Q and A) and `docs/DECK.md` (six slides with timings); AI tooling disclosed | Record the video, build the slides, rehearse on the projector |

## Real versus simulated

- **Real:** package, funded reimbursement and payroll mandates, dashboard reads,
  native-USDC reimbursements, the atomic RM30 payroll and its four payment legs,
  overspend rejection and unauthorized-recipient rejection.
- **Real when authenticated/demo identity and server payment credentials are
  enabled:** receipt analysis, private storage, event-scoped duplicate checks,
  claim persistence/listing, treasurer-triggered deterministic policy, and
  race-safe testnet backend payment for USDC automatic or human-approved claims. The payment code is
  covered by automated tests and the recorded local Testnet payment checks.
- **Simulated in the current UI:** revoke preview only. The payroll safety test is
  a real employer-authenticated Testnet attempt when the selected payroll and
  signer configuration are available.
- **Never simulated without a label:** digests, checkpoints, gas, finality, wallet signatures, or chain state.

## Frontend phase history

The sections below preserve UI design decisions made during the Xiang-UI work.
These notes are historical. Use the current subsystem table and dated evidence
above for today's functionality; payment and review now work locally, while
revocation and the interactive safety screens remain previews.

| # | Phase | Status | Landed |
|---|---|---|---|
| 0 | Repo, shared contracts, design tokens | ✅ Done | 29 Aug |
| 1 | Design system, app shell, status chips | ✅ Done | 29 Aug |
| 2 | Mobile claim flow — capture to submitted | ✅ Authenticated locally | 1 Sep |
| 3 | Treasurer dashboard and review queue | ✅ Real review actions complete locally | 1 Sep |
| 4 | Safety Test panel | 🟡 Mock flow; live refusals linked | 29 Aug |
| 5 | Landing page | ✅ Done, rebuilt 31 Aug | 30 Aug |
| 6 | Wire to live contract and backend | 🟡 Local browser MYR payment and reconciliation verified; hosted rollout pending | 3 Sep |
| 7 | Submission pack | 🟡 Scripts and deck written; recording pending | 4 Sep |

Legend: ✅ done · 🟡 in progress · ⬜ not started · ⛔ cut

---

## Current remaining gaps

Updated 4 September. See [payroll launch plan](PAYROLL_LAUNCH_PLAN.md) and
[product next steps](PRODUCT_NEXT_STEPS.md) for acceptance criteria:

1. ✅ Lock one employee wallet and separate Testnet statutory stand-ins; fund the
   employer for the RM50-equivalent mandate. Employee class and stream timing still
   need to be confirmed in the setup preview.
2. ✅ Configure package v2, create and strictly register the funded mandate, and
   record mandate, capability, recipient and live stream identifiers.
3. Apply the single payroll-configuration migration to hosted Supabase and verify
   authenticated **Set Up Payroll** from a fresh browser. Local verification and
   idempotent registration are complete.
4. ✅ Replace `sampleStaff` and global payroll/stream assumptions with an explicitly
   selected registered payroll; employer and employee write authorization is enforced.
5. ✅ Verify one successful payroll, one deficient-contribution refusal, and one
   accrued-salary withdrawal from the registered employee wallet.
6. Preserve the working expense-claim demo. Add protected registration and
   selection behind the separate **Create Expense Treasury** screen.
7. Deploy and verify the event-member roster API, including one new member who can
   sign in, analyze, create, and list a claim; complete authoritative roster UI.
8. Update evidence, record a backup video, complete disclosures and rehearse.

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

The original member journey at `/claim` was built against `src/lib/mock/`. The current
flow replaces that path with the real receipt and claim APIs:
**list → capture → Gemini reading → confirm → submit**. Policy and backend payment
now exist behind the treasurer-triggered process endpoint, but the member screen does
not present them as browser-completed actions.

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
- **1 September review milestone:** Approve, reject, and request correction now
  call the real guarded API. Approval clearly warns that it starts a Sui Testnet
  USDC payment; rejection and correction require an audited reason. Non-USDC and
  failed on-chain checks cannot be approved, successful writes reload the queue,
  and correction requests remain visible only in claim history.
- **2 September reconciliation milestone:** signed transaction bytes are hashed to
  their Sui digest and persisted before broadcast. A treasurer can inspect only
  that digest, poll for up to 20 seconds, and settle confirmed success or rejection
  without another signature or submission. Chain refresh performs one such lookup
  for visible in-flight claims.

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

**Then the real ones went on.** Shuheng had already executed three transactions against
the deployed package and recorded them in `contracts/tali_treasury/DEPLOYMENT.md` — one
allowed reimbursement, one refused on abort 5, one refused on abort 7 — so no keypair and
no new signing were needed. They now sit on the landing page directly beneath the
illustration, each linked to two explorers, with the aftermath stated: the mandate held
the same balance afterwards, neither refusal emitted `PaymentMade`, and the agent still
burned gas being turned down. A refusal that costs nothing did not happen on a chain. The
two refusals are linked from the safety panel's banner as well, since that is where the
objection actually arises. `lib/evidence.ts` writes those amounts out as strings rather
than passing them through `toDisplay`, because they are SUI at 9 decimals and
`COIN_DECIMALS` is 6 — the very bug recorded below.

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
`DEPLOYMENT.md` calls the SUI mandate a smoke test "before integrating official testnet
USDC", and USDC is 6 decimals, so the plan of record already points at USDC — it just
has not been carried out.

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
mandate policies and budget top-ups.

## Standing rules

### 5 September — production-facing copy pass

- Removed development-stage wording from the landing, application footer, role
  selection, claims, treasury, payroll setup, salary stream, earnings, overtime,
  and safety experiences.
- Retained Sui Testnet labels where they identify a signing or transaction
  boundary, and kept package and transaction evidence available to verify.
- Standardized unavailable fallback presentation as preview data with live-only
  actions unavailable; no API, authorization, calculation, storage, or signing
  behavior changed.
- Added focused copy regression coverage. Verification completed with 967 web
  tests passing and one intentional skip, 48 Sui-integration tests passing,
  successful typecheck and production build, and zero dependency vulnerabilities.

- Screens ship with hover, `focus-visible`, empty and loading states. Judges click things.
- Nothing below 18px above the fold; the demo is projected 3–8m away.
- Feature freeze **3 Sep**. After that: README, two videos, deck, rehearsal.
- Submit **5 Sep by noon**, not 23:59.
