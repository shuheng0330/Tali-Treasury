# Submission pack

For the Devfolio entry and the 6 September pitch. Every figure here was checked
against the repository or an explorer; nothing in this file is aspirational.
Anything not yet true is in [Not live yet](#not-live-yet) rather than omitted.

## One line

Tali pays a salary and its statutory contributions in a single Sui transaction,
and the contract refuses to settle one without the others.

## The problem

Unpaid EPF is the quietest way a Malaysian payroll goes wrong. The salary lands,
the statutory contribution does not, and nobody finds out for months — by which
point the money is gone and the worker's retirement account is short. The same
gap exists in expense reimbursement: an approval and a payment are two separate
acts, and only the second one moves money.

Existing payroll software records the obligation. It does not enforce it, because
the software answers to the employer.

## What Tali does

A `PayrollMandate` is funded on chain with rules fixed at creation: which wallet
may be paid, a minimum share of gross the worker must keep, and a basis-point
floor for each statutory body measured against the wage. `run_payroll` pays the
worker and EPF, SOCSO and EIS in one transaction. Underpay any one of them and
the whole run aborts on code 24 — the wage does not go out and get corrected
later.

Unpaid leave reduces the wage before the split is computed rather than scaling a
finished one. That ordering is the point: EPF follows the Third Schedule, which
states a ringgit figure per band rather than a percentage, so a reduced wage can
fall into a lower band. No contract change was needed — every mandate rule that
could object to a smaller wage is proportional, so leave is a wage input.

Expense reimbursement is a separate `Mandate` with its own cap and allowlist. A
member photographs a receipt, an agent reads it, and payment is bounded by rules
the agent cannot exceed even holding a valid capability. It is kept separate on
purpose: payroll's single `PayrollCap` can both run and revoke, and merging the
two would put salary behind the same key as receipt reimbursement.

## Live right now

Deployed at **https://tali-treasury.vercel.app**. The original expense package is
`0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523`;
package v2 with `payroll` and `treasury` is
`0xeb973dbac9e4e5c2ea0c31ffb6b51b4df1f34e05443f970e89a35301e6b97688`
on Sui Testnet.

Every digest below opens in a public explorer.

| What | Result | Transaction |
|---|---|---|
| Paid 3 USDC to an approved member | Allowed | `Aksj8wgVoVRnbkVDyCMQ4qMKa1HfkWqDWF8Xptz5yQXA` |
| Asked for 15 USDC against a 5 USDC cap | Refused, abort 5 | `5fMDNz9dAxJFiamg5Bi5iXnPjnHv2HTUB3hv2wJ2PNpU` |
| Asked to pay an address not on the allowlist | Refused, abort 7 | `2htVB5NJCxhz1QXQtLGDjJ6kLVAwit6MLqzghzGDnk5e` |
| RM6 receipt reimbursed from the browser | Paid 1.484561 USDC | `J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq` |
| Published payroll module in package v2 | Published | `86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN` |
| Paid an RM30 salary and EPF, SOCSO and EIS in one transaction | Allowed | `HpUwPspN9QgoXBmLARh8iJDFSxEACSwZNxhzz3zXr27y` |
| Same run with EPF one micro-USDC under the floor | Refused, abort 24 | `Hqw44T6qTsQKW5ooPGM8BQmN6uNgaXk6TYNvw9tgFT8V` |

The payroll mandate `0xa04894a0d3852092d08df2476bb36e47992ec13ad78ba2a6e38cb891f77f1100`
was created and funded by the employer's own wallet in
`85PdAXLeVT82SetGWUK9a98vX3UAEcrarRRtUv8ne73`, and the backend verified finality,
sender, package, coin type, mandate fields and `PayrollCap` owner before
registering it. Full figures in
[PAYROLL_TESTNET_EVIDENCE.md](PAYROLL_TESTNET_EVIDENCE.md).

Both refusals were signed by the agent's real capability. The mandate refused
them anyway, burning 0.002095 SUI in gas and moving no USDC. Budget after:
17 USDC remaining of 20, 3 spent.

The RM6 reimbursement converted at a saved Open Exchange Rates quote of
1 USD = 4.0416 MYR, with USDC valued at USD parity and the treasurer approving
the exact payout before it was sent.

## Not live yet

Say this plainly if asked; it is the honest half of the story.

- **No salary stream has been opened yet.** `SalaryStream` is published and
  tested, and the earnings screen says plainly that its accrual is computed with
  the contract's arithmetic rather than read from chain. An employee withdrawal
  is the one piece of the payroll story with no Testnet proof behind it.
- **Set Up Payroll was run locally, not hosted.** The mandate above was created
  and registered through the authenticated local application; the hosted
  payroll-registration migration and runtime configuration are still unverified.
- **Interactive safety attempts fall back to a local prediction**, labelled as
  one. The two refusals in the table above are real and are what the screen
  links to.
- **Hosted protected writes are not verified.** The browser reimbursement above
  was performed locally.

The interface never presents a simulation as chain state. Digests, gas, finality
and wallet signatures are never invented, and no screen claims an authority it
does not have: every control that writes is gated on the wallet the server
would actually accept — the employer for payroll, the event's treasurer for
review and revocation, the stream's employee for withdrawal — and says whose it
is when it is not yours. `/start` names the four ways in and marks the ones the
connected wallet holds. Nothing is hidden by role; every route stays reachable
by URL, because the screens check themselves.

## Tech

Sui Move contracts; TypeScript throughout. Next.js 16 App Router, React 19,
Tailwind v4. Supabase with row-level security for claims and audit. Circle
Testnet USDC. Gemini for receipt reading. Open Exchange Rates for MYR quotes.
Wallet sign-in over a signed challenge, including Slush zkLogin.

**Tests:** 42 Move contract tests (25 payroll, 17 treasury), 48 Sui integration
tests, and 663 web tests (662 passing, one intentional skip) on the current
`main`. The local database suite has 141 passing pgTAP assertions.

## AI tooling disclosure

MUBA requires declaring the AI tools used. This project used AI coding
assistants throughout — **Claude (Anthropic)** and **Codex (OpenAI)** — for
implementation, review and documentation, under human direction and review.

Commits and pull requests carry no AI attribution by design, which is a
commit-metadata convention and not a claim about authorship. Both obligations
are met separately: the history is clean, and the tooling is declared here and
in the README.

## Demo script — 3 minutes

**A is now the script.** The funded mandate, the `PayrollCap`, a real atomic
payroll and a real abort-24 refusal all exist as of 5 September. The single gap
is the salary stream, so A's `/earnings` step is the one to soften — show the
accrual and say the withdrawal has no Testnet proof yet, or drop the step and
give the time back to the refusal.

Keep B below as the fallback if the room's network cannot reach an explorer.

#### The mandate cannot fund another run

The funded mandate holds **3.317095 USDC**. One RM30 run costs **9.046290**, and
the smallest wage the app accepts, RM20, costs **6.030860**. There is no payroll
run left in it, and its rules are immutable, so this is not something to fix on
the day.

This does not weaken the demo, because of the order `run_payroll` checks things
in: the statutory floors are verified in the payment loop, and the budget only
afterwards. A deliberately deficient run therefore still aborts on **24**, the
code the whole pitch turns on, and never reaches the budget guard. A *valid*
run would clear the floors and then abort on **26**.

So: the refusal is live, the successful run is a recorded digest. Say which is
which — it is a better answer than being caught by it.

### A — payroll published

| Time | Screen | Say and do |
|---|---|---|
| 0:00–0:20 | Landing | "Unpaid EPF is the quietest way a payroll goes wrong." Read the headline. |
| 0:20–0:50 | `/payroll/setup` | The screen that created the funded mandate. Point at the rules fixed at creation — do not sign a second one live; the mandate has 3.317095 USDC left and a run costs 9.046290. |
| 0:50–1:40 | `/payroll` | **Do not run a payroll live — it will abort on 26.** Show the split, then open the recorded run `HpUwPs…`: four payments, one transaction. See [the budget note](#the-mandate-cannot-fund-another-run) below. |
| 1:40–2:20 | `/safety/payroll` | **This one you can run live.** Underpay EPF; the contract aborts on 24 before it ever looks at the budget. Show that no balance moved. |
| 2:20–2:45 | `/payroll` | Enter unpaid leave days. The wage drops and the split recomputes on the reduced wage rather than being scaled, so EPF can fall into a lower Third Schedule band. Stronger than `/earnings`, whose withdrawal has no Testnet proof. |
| 2:45–3:00 | Close | "Wages and EPF leave together, or neither does. That is a contract, not a policy." |

### B — fallback when the room cannot reach an explorer

Everything A shows is still true here; the difference is that you read the
digests off the screen instead of opening them. Do not say anything in B about
a mandate not existing — one is funded and it has both a paid run and a refusal
against it.

| Time | Screen | Say and do |
|---|---|---|
| 0:00–0:20 | Landing | Same opening. |
| 0:20–0:55 | Landing evidence | Seven real Testnet transactions: three allowed, three refused, one package publication. Read the two payroll digests aloud rather than opening them. Stress that the agent held a valid capability and was refused anyway. |
| 0:55–1:45 | `/claim` | Photograph an RM receipt. Agent reads it, quotes MYR to USDC, treasurer approves the exact payout. Show the payment digest. |
| 1:45–2:25 | `/payroll` + `/safety/payroll` | The statutory split against the EPF Third Schedule, and the refusal that already happened on chain: budget and total-paid unchanged after abort 24. |
| 2:25–2:45 | `/payroll` | Enter unpaid leave days. The wage drops, and the split recomputes on the reduced wage rather than being scaled — EPF can fall into a lower Third Schedule band. |
| 2:45–3:00 | Close | Same close. |

Rehearse on the projector resolution and on a phone. Keep status, reason and
next action visible without scrolling.

## Q&A — likely questions

**"What stops an employer just not paying EPF?"**
The mandate holds a basis-point floor per body, fixed at creation and measured
against the wage. `run_payroll` checks every leg before it moves anything. A
short EPF payment aborts on 24 and the wage does not leave either.

**"Why does this need a blockchain?"**
Because the enforcement has to survive the employer. Payroll software answers to
whoever runs it. A funded mandate with immutable rules can refuse the person who
created it, and a third party can verify the refusal without our cooperation.

**"Is any of this on mainnet?"**
No. Testnet only, no real funds. Mainnet use during the hacking period is a
disqualification under MUBA rules.

**"What is real and what is mocked?"**
Point at the table above and at the on-screen labels. The claims contract,
mandate, payments and both refusals are real. Payroll code is published in package
v2, but its funded mandate and execution evidence are not yet created, and every
screen must say so where it matters.

**"Who holds the keys?"**
Expense reimbursement splits an `AdminCap`, held by the treasurer, from an
`AgentCap`, held by the backend signer, so the agent can pay within the rules
but cannot change them. Payroll has a single `PayrollCap` — whoever holds it can
both run and revoke — and the setup screen says so before it is handed over.

**"Which AI tools did you use?"**
Claude and Codex, throughout, under human review. Declared in the submission and
in the README.
