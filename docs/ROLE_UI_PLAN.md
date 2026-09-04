# Role-aware interface plan

Written 4 September, after the payroll RBAC increment landed. The server now
enforces four distinct actors. The interface does not yet reflect them, and no
existing plan covers it — `2026-09-03-payroll-rbac-design.md` scopes itself to
server authorization and defers its second increment to claim membership.

## What the server already enforces

| Actor | Identified by | Authorised for |
|---|---|---|
| Employer | `TALI_EMPLOYER_WALLET` (one global wallet) | `POST /api/payroll/runs`, `POST /api/mandate/revoke`, `POST /api/safety/attack` |
| Employee | `employee` on the salary stream object | `POST /api/streams/:id/withdraw` |
| Treasurer | `events.treasurer_wallet` (per event, in the database) | Event members, claim review |
| Member | Row in `event_members` | Submitting claims |

Employer is global and comes from the environment. Treasurer is per event and
comes from the database. They are different authorities with different scopes,
and one wallet may hold both. **Do not merge them into a single role**: the
person who runs an orientation-week budget should not thereby be able to run
company payroll.

## What the interface does today

`viewerRole()` returns treasurer, employer or member, and `walletAccess()` gates
the payroll, earnings and safety actions. Both are advisory only — the server
independently refuses an unauthorised write — but both currently disagree with
it in ways that will produce wrong screens.

### Defect 1 — the client and server read different employer values

`viewerRole` and every payroll gate read `NEXT_PUBLIC_PAYROLL_EMPLOYER`. The
server reads `TALI_EMPLOYER_WALLET`. Nothing keeps them in step, so a deployment
that sets one and not the other offers a button the server refuses, or hides one
it would allow. Both are empty today, which is the only reason this has not
surfaced.

### Defect 2 — the treasurer is read from a constant, not the event

`DEMO_TREASURER` comes from `taliUsdcDemo.treasurer` in `@tali/treasury-sui`. The
authority is `events.treasurer_wallet`. They agree for the seeded event by
coincidence — both are `0x010bcab9…`. Any event created with a different
treasurer will have its real treasurer labelled a member and shown no treasurer
controls.

### Defect 3 — the configured demo event is missing locally

`NEXT_PUBLIC_DEMO_EVENT_ID` is `223d1aa1-2c95-449d-94b3-36083c83016c`. The local
database contains only `ba7e50e2-7e7b-4a67-a505-9e3a329739ae`. The claim flow
points at an event that is not there.

## Phase 1 — make the interface agree with the server

Small, and it removes the chance of the demo contradicting itself on stage.

1. Add `NEXT_PUBLIC_EMPLOYER_WALLET`, mirroring `TALI_EMPLOYER_WALLET`, and read
   it everywhere the payroll and safety gates currently read
   `NEXT_PUBLIC_PAYROLL_EMPLOYER`. Retire the old name in `.env.example` with a
   comment saying which server variable it must match.
2. Have the treasury page pass the event's `treasurer_wallet` down, and take
   `viewerRole`'s treasurer answer from that rather than from `taliUsdcDemo`.
   Fall back to the constant only when no event has been read, and label it.
3. Point `NEXT_PUBLIC_DEMO_EVENT_ID` at an event that exists in the target
   database, or seed `223d1aa1…` locally. One or the other, not both.

**Acceptance:** with the employer wallet configured, every payroll control is
enabled for exactly the wallet the server would accept and disabled for every
other, and the treasurer controls follow the event rather than a constant.

## Phase 2 — role-aware navigation

The nav shows six tabs to everybody, four of which most readers cannot use.

1. Derive the viewer's roles once, from the wallet session plus the event and
   stream on screen. A wallet may hold more than one; model it as a set, not a
   single value.
2. Order the nav by what the viewer can actually do, and mark the rest rather
   than hiding them. Hiding a tab makes the app look broken to somebody who
   expected it; a visible tab that says "employer only" explains itself.
3. Keep every route reachable by URL. Navigation is a convenience, and the
   screens already gate their own actions.

**Acceptance:** an employee sees Earnings first and is told plainly why Run
payroll is not theirs; a treasurer sees Treasury and Claims first. No route
404s or redirects based on role.

## Phase 3 — a role-appropriate entry screen — done

Brought forward once Phase 1 landed and Lane A finished early.

1. ✅ `/start` names the four ways in and marks the ones the connected wallet
   holds. It answers with `walletAccess` against the employer wallet, the
   event's treasurer and the stream's employee — **not** `viewerRole`, which
   Lane B is reshaping into a role set. One primitive, no second role model to
   drift.
2. ✅ A wallet holding no role is told so plainly and pointed at the parts that
   need no permission: the enforcement proof, the safety test and the testnet
   transactions on the overview.
3. ✅ The landing header's "Open the app" now goes to `/start` rather than
   `/payroll/setup`. The hero's button keeps its direct link, because it is
   labelled "Set up payroll" and going there is what it says it does.

A stream that has not been opened reports a placeholder employee. Comparing a
real wallet against it would answer "not yours" to everybody with the
confidence of a real check, so a non-canonical address is treated as
unconfigured and `walletAccess` explains that it cannot tell.

**Left for Lane B:** `/start` is reachable from the landing header and by URL,
but has no nav tab — `AppNav` belongs to Lane B and adding one here would
collide with B2 and B3. Worth a tab once that lands.

## Recommendation on sequencing

**Phase 1 before the pitch. Phase 2 only if there is time. Phase 3 after.**

*Superseded 4 September: Phase 1 and Phase 3 are both done. Phase 2 is Lane B's
B3 and is the only one outstanding.*

Phase 1 is a correctness fix — it stops the interface disagreeing with the
contract, which is the one thing this product cannot afford to do in front of
judges. Phase 2 is polish that helps a demo driven by more than one wallet;
since the demo is driven by one person on one wallet, it changes little on the
day. Phase 3 is a product decision that should not be made the night before.
