# Team progress and next steps

Status update: 3 September 2026 (MYT)

The percentage estimates below are a historical 1 September snapshot, not current
completion claims. The local browser flow now paid RM6 as 1.484561 Testnet USDC;
wallet auth, live quotes, backend signing and reconciliation have been verified.
Paid/rejected tabs, review reasons and compact claim summaries are implemented.
Use [PROGRESS.md](PROGRESS.md) for current status and
[PRODUCT_NEXT_STEPS.md](PRODUCT_NEXT_STEPS.md) for correction/resubmission,
authenticated Create event, hosted verification and submission tasks.

## Historical 1 September assessment

This report is based on the latest reviewed `origin/main` commit, `e839c66`.
Percentages estimate completion of each teammate's owned hackathon scope. They are
rounded to the nearest 5% and are not based on commit count. A feature counts as
complete only when it is implemented, integrated, tested and usable in the intended
demo flow.

## Progress summary

| Teammate | Primary responsibility | Progress | Current position |
|---|---|---:|---|
| Shu Heng | Sui Move and blockchain integration | **85%** | Core contract and USDC evidence are live; backend-agent smoke payment and operational safety actions remain |
| Ku Kian Xiang | Frontend and product experience | **75%** | Main journeys and design system are built; important review, FX and payment interactions are not fully live |
| Lim Wey Cheng | AI, backend, policy and payment orchestration | **80%** | Core receipt, policy and payment services are implemented; authentication, FX, reconciliation and hosted configuration remain |
| **Overall team** | End-to-end hackathon product | **80%** | Strong components exist, but they still need one complete MYR-receipt-to-USDC-payment journey |

These percentages measure different scopes, so they should be used for planning,
not for comparing individual effort.

## Shu Heng — 85%

### Completed

- Built the Sui Move treasury package and spending controls.
- Added secure withdrawal behavior and Move tests.
- Deployed the package to Sui Testnet.
- Created and funded the official Testnet USDC mandate.
- Recorded one successful 3 USDC reimbursement.
- Recorded real overspend and unknown-recipient rejections.
- Built the TypeScript Sui integration wrapper, readers and transaction builders.
- Hardened the claim flow and prepared it for real USDC reimbursement.

### Required to reach 100%

- Configure and fund the backend agent wallet with Testnet SUI for gas.
- Confirm that the backend signer owns the correct `AgentCap`.
- Execute and record one small payment through the new backend payment endpoint.
- Support payment reconciliation so an uncertain submission cannot pay twice.
- Record live revoke or withdrawal evidence if it is included in the final demo.

## Ku Kian Xiang — 75%

### Completed

- Built the design system, application shell and responsive navigation.
- Built the member receipt and claim journey.
- Built the treasurer dashboard and review queue.
- Built the Safety Test experience and linked real Testnet evidence.
- Rebuilt and polished the landing page.
- Improved accessibility, contrast, focus behavior and reduced-motion support.
- Connected claim and receipt screens to backend data.
- Corrected currency labels so extracted amounts are not silently treated as USDC.

### Required to reach 100%

- Show a clear `MYR original -> USDC payout` quotation before confirmation.
- Add wallet or authenticated-session states to the member and treasurer journeys.
- Replace mocked approve, reject and request-correction controls with real actions.
- Display persisted `paying`, `paid` and `payment_failed` states.
- Link successful payments to their real Sui explorer transaction.
- Refresh treasury balances and claim states after finality.
- Polish and record the final member-flow demonstration.

## Lim Wey Cheng — 80%

### Completed

- Built Gemini receipt extraction with strict validation.
- Built the Supabase schema, private storage and claim repository.
- Added receipt analysis, claim creation and claim-listing APIs.
- Added duplicate-receipt, authorization and sanitized-error protections.
- Built the deterministic nine-rule policy evaluator.
- Integrated treasurer-triggered claim processing with live mandate reads.
- Added atomic and idempotent claim-state transitions.
- Built the server-only Sui Testnet payment executor.
- Added single-winner payment reservation and safe uncertain-submission behavior.
- Added broad service, payment, repository and database test coverage.

### Required to reach 100%

- Add wallet-challenge verification and an HTTP-only authenticated session.
- Bind receipt analysis to claim creation with an expiring, one-time draft.
- Add a trusted MYR-to-USDC quote service and persisted quote information.
- Add approve, reject and request-correction endpoints with audit events.
- Add automatic reconciliation for claims left in `paying`.
- Configure Gemini, Supabase and signer credentials in the hosted environment.
- Verify the complete hosted journey from receipt upload to confirmed payment.

## What is complete across the team

- Live Sui Testnet treasury contract and official Testnet USDC mandate.
- Real successful reimbursement and two real contract safety rejections.
- Receipt analysis, private storage and claim persistence.
- API-backed member claim flow and treasurer queue.
- Deterministic and explainable policy decisions.
- Testnet-only backend-agent payment implementation.
- Race-safe reservation, idempotency and sanitized failure handling.
- Live read-only treasury dashboard and deployed web application.

## What is still incomplete

- Authenticated member and treasurer identity.
- One-time binding between receipt analysis and claim confirmation.
- Trusted MYR-to-USDC conversion and expiry handling.
- Real treasurer review actions.
- A live payment made through the newly integrated backend signer.
- Automatic reconciliation of uncertain payment submissions.
- Complete hosted end-to-end verification.
- Interactive safety demonstration and final submission materials.

## Prioritized next steps

| Priority | Work | Lead | Support | Completion evidence |
|---:|---|---|---|---|
| 1 | Implement and persist MYR-to-USDC quotes | Lim Wey Cheng | Ku Kian Xiang | UI shows original MYR, rate, expiry and integer USDC payout; expired or missing quotes cannot auto-pay |
| 2 | Add wallet/session authentication | Lim Wey Cheng | Ku Kian Xiang | Replayed challenges fail and users cannot act as another address |
| 3 | Bind analysis to claim confirmation | Lim Wey Cheng | Ku Kian Xiang | An expiring draft is consumed once and corrections remain auditable |
| 4 | Implement real treasurer review actions | Lim Wey Cheng | Ku Kian Xiang | Approve, reject and correction actions persist with reasons and audit events |
| 5 | Run one live backend-agent USDC payment | Shu Heng | Lim Wey Cheng | Real digest, checkpoint, gas, finality and changed mandate balance are recorded |
| 6 | Reconcile uncertain submissions | Lim Wey Cheng | Shu Heng | A `paying` claim is recovered safely without creating a duplicate payment |
| 7 | Present real payment states in the UI | Ku Kian Xiang | Lim Wey Cheng | Queue displays final states, explorer link and refreshed treasury balance |
| 8 | Run the hosted flow from a fresh browser | All teammates | — | MYR receipt reaches a confirmed Testnet USDC payment without manual database edits |
| 9 | Finish videos, deck, disclosure and rehearsal | All teammates | — | Every visible digest is real, simulations are labelled and the demo is repeatable |

## Recommended final demo story

> A student submits an ordinary MYR receipt. Tali extracts and verifies it,
> presents a transparent USDC payout quote, and routes it through explainable
> policy checks. The backend agent can initiate reimbursement, while the Sui
> mandate independently enforces the budget, claim limit and recipient rules.

This is stronger than presenting Tali as a generic AI receipt scanner: the product
connects local-currency usability, explainable automation and enforceable on-chain
treasury safety in one verifiable journey.
