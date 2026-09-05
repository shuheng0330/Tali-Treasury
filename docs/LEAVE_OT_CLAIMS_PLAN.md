# Leave, overtime, and how claims sit beside payroll

Written 5 September, answering three questions: add unpaid leave so a day not
worked is not a day paid; make overtime work with payroll; and make the claim
system align with payroll.

The short version: **leave and overtime are wage-input problems, not contract
problems.** Claims are already aligned, and the alignment is that they are kept
apart. One of the three can be built and demonstrated today; the other two
cannot, for a reason that is about a funded object rather than about effort.

## Why leave needs no contract change

`run_payroll` is handed the amounts. The mandate holds rules *about* them:

| Rule | Shape | Behaviour when the wage drops |
|---|---|---|
| `floors` | basis points **of the wage** | scales down with it |
| `netMinBps` | minimum share of gross the worker keeps | scales down with it |
| `maxPerRun` | absolute ceiling | unaffected; a smaller run is further inside it |
| `budget` | absolute pool | a smaller run costs less of it |
| `approvedEmployees` | allowlist | unchanged |

Every rule that could have objected to a reduced wage is proportional. So unpaid
leave is: compute the reduced gross, then run the existing calculation on it.
Nothing in `payroll.move` has to know that leave exists.

The statutory arithmetic already handles it correctly, which is the part worth
checking rather than assuming. `computeStatutory` is **band-aware**: EPF follows
the Third Schedule, which is not a percentage of the wage but a fixed ringgit
figure per band. A wage reduced by leave can fall into a lower band, and the
existing `epfWageBand` picks it up. SOCSO and EIS keep their RM6,000 ceiling.
A naive "multiply everything by 0.9" would have got all three wrong.

### The proration rule

`daily = monthly / 26`, deducted per day of unpaid leave. Twenty-six is the
ordinary rate of pay under the Employment Act, and it is the convention a
Malaysian payroll clerk would recognise. It is a convention, not a universal
truth — a monthly-rated employee on a different contract may be prorated on
calendar days — so the screen says which rule it used rather than presenting a
figure that appears to be law.

## Why overtime cannot be demonstrated, and it is not about code

Overtime is the same mechanism in the other direction: it raises the gross, and
the same proportional rules accommodate it. The obstacle is the funded object.

- The demo mandate holds **3.317095 USDC**. One RM30 payroll cost **9.046290**.
- `maxPerRun` is **12.363385 USDC** and is **immutable** — fixed when the
  mandate was created and funded.
- Budget top-ups are in `PROGRESS.md` under "already cut and not coming back".

So an overtime run is a larger run against a mandate that cannot afford an
ordinary one, with a ceiling that cannot be raised. It would abort — correctly,
and on a rule we would be pointing at while it happened.

**Recommendation: do not add overtime before the pitch.** Say the mechanism is
the same and the mandate was funded for one demonstration, which is true and
better than an abort nobody planned. Building it needs a second funded mandate
with headroom, which is a Testnet funding task rather than a frontend one.

Note also that overtime is listed under **Explicitly deferred** in
[PAYROLL_LAUNCH_PLAN.md](PAYROLL_LAUNCH_PLAN.md), together with attendance
verification. Attendance is the harder half: overtime that anyone can enter is
a number, not a verified fact, and a payroll product that lets an employer type
any overtime figure has not solved the problem it claims to.

## Claims are already aligned, by being separate

The instinct that they should be joined is worth taking seriously and then
declining. `PAYROLL_LAUNCH_PLAN.md` is explicit:

> The two mandate types must not share a creation wizard, capability or backend
> configuration.

The reason is capability blast radius. Expense reimbursement splits an
`AdminCap` from an `AgentCap` so an agent can pay within rules it cannot change.
Payroll has a single `PayrollCap` whose holder can both run and revoke. Merging
them puts salary and statutory money behind the same key as receipt
reimbursement, and an agent compromised on the expense side would reach payroll.

They are also different money with different rules. A claim is bounded by a
per-claim cap and an allowlist. A payroll run is bounded by statutory floors and
a minimum net share. Neither set of rules is meaningful applied to the other.

**Where they should meet is reporting, not custody.** One person can be an
employee on a payroll mandate and a member of an event treasury, and no screen
today shows both. That is the real gap: not a merged mandate, but a view that
says what one person received this month and from which authority. `/start`
already knows a wallet can hold several roles, so the shape exists.

**Recommendation: do not merge. Build the combined view after the pitch.**

## What is being built today

Only the first, and only in the frontend:

- An unpaid-leave input on the payroll desk that reduces the gross before the
  existing preview is requested. No new endpoint, no shared type, no contract
  change, no teammate's path touched.
- The screen states the proration rule and shows the reduced gross next to the
  full one, so a reader can see what leave cost.
- The statutory split then recomputes through the existing server calculation,
  including its band behaviour.

It is honest about being a preview: a run signed with a leave-reduced wage is a
real payroll run, but the demo mandate's remaining budget means whether one is
broadcast on the day is a separate decision from whether the figures are right.

## After the pitch

1. Verified attendance before overtime is accepted. Without it, overtime is an
   employer-entered number and the product's central claim weakens.
2. A second payroll mandate funded with headroom, so overtime and leave can both
   be demonstrated against real objects.
3. Paid leave entitlement and balances, which need durable per-employee state
   and are a different problem from unpaid leave's arithmetic.
4. The combined per-person view across payroll and claims.
