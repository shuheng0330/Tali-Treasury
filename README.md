# Tali Treasury

Tali Treasury is a payroll-first, Sui-based treasury product. An employer funds a
payroll mandate with Circle Testnet USDC, deterministic rules enforce salary and
statutory-allocation constraints, and employees can receive or withdraw earned
funds. A separate expense-treasury flow uses receipt analysis and its own Sui
mandate for reimbursements.

The two flows deliberately use different objects and capabilities:

- **Set Up Payroll** creates a `PayrollMandate` and `PayrollCap`.
- **Create Expense Treasury** creates the existing reimbursement `Mandate`,
  `AdminCap` and `AgentCap`.

They must not be combined into one setup transaction or configuration flow.

> Testnet only. All SUI and USDC used here have no financial value.

## Project status

Status words are intentionally precise:

- **Live** — verified against Sui Testnet.
- **Hosted schema ready** — the hosted database is verified, but the web flow is
  not deployed end to end.
- **Complete locally** — implemented and testable, but not a hosted live flow.
- **Mocked** — useful UX or integration scaffolding that performs no external action.
- **Pending** — not present in the integrated repository yet.

| Area | Status | Evidence or next action |
| --- | --- | --- |
| Move treasury and 17 contract tests | **Complete locally** | `sui move test` |
| Published package | **Live** | Package `0x7be8…c523` on Testnet |
| Official Testnet USDC mandate | **Live** | 20 USDC funded; 5 USDC maximum per claim |
| Valid reimbursement | **Live** | 4 USDC total paid; 16 USDC remained after the 3 September smoke test |
| Overspend and recipient protections | **Live** | Both invalid transactions rejected on-chain |
| TypeScript Sui integration | **Complete locally** | Reads, PTB builders, amount helpers, error mapping |
| Treasurer mandate dashboard | **Live** (read-only) | Server reads the current mandate from Sui Testnet |
| Claim receipt submission UI | **Complete locally** | Authenticated analyze/create/list with one-time 15-minute drafts |
| Claim policy processing | **Complete locally** | Treasurer action invokes the server evaluator and persists the decision |
| Treasurer review actions | **Complete locally** | Real approve/reject/correction API and UI; eligible USDC approval enters the guarded testnet signer |
| Safe payment reconciliation | **Complete locally** | Digest stored before broadcast; explicit status checks never sign or resubmit |
| Payroll write-route authorization | **Complete locally** | Employer session guards payroll, revocation and safety broadcasts; stream employee guards withdrawal |
| Event-member roster API | **Complete locally** | Treasurer-only active roster GET and add-only POST; existing dashboard form uses the shared contract |
| MYR → USDC reimbursement quotes | **Live via local app** | RM6 → 1.484561 USDC browser payment verified; hosted rollout pending |
| Claim outcomes | **Complete locally** | Paid with Auto-paid / Paid after review chips; Rejected tab; correction/rejection reasons on both screens |
| Payroll Move module and integration | **Live** | Package v2, funded `PayrollMandate`, atomic RM30 payroll and `PayrollRun` event are verified on Testnet |
| Payroll MYR → USDC valuation | **Complete locally** | RM statutory calculation is converted leg-by-leg with one approved live-reference rate; hosted proof pending |
| Authenticated Set Up Payroll | **Live via local app; hosted migration pending** | Slush created and funded a verified 12.363385 USDC mandate; strict digest-only registration is ready and pages select an authorized registration by mandate |
| Registered payroll page binding | **Complete locally** | Role-aware registry views, URL selection, derived inputs, scoped history and fail-closed stream matching |
| Live payroll run and salary stream | **Payroll run live; stream pending** | RM30 payroll paid 9.046290 USDC atomically; salary-stream open/withdraw evidence remains |
| Create Expense Treasury | **Complete locally through wallet execution** | Separate reimbursement setup screen can sign against the existing package; verified event registration remains pending |
| Revoke and Safety Test interactions | **Complete locally; live proof pending** | Employer-authorized APIs can submit through the server signer; unsupported scenarios remain clearly labelled predictions |
| Gemini receipt analysis and Supabase claims | **Complete locally; rollout pending** | Private drafts, authenticated access and 141 pgTAP assertions across the current schema |
| Deterministic policy and backend agent signing | **Live via local app** | Native USDC payment/recovery and manually approved MYR reimbursement verified on Testnet |
| Wallet connection and live UI writes | **Complete locally** | Testnet connect, explicit sign-in, one-hour HTTP-only session and sign-out |
| Statutory payroll enforcement | **Live** | Employee, EPF, SOCSO and EIS legs settled atomically; an underfunded EPF leg was refused on abort 24 without moving USDC |
| Per-second salary accrual | **Published; live proof pending** | `SalaryStream` open/accrue/withdraw is published in package v2 and tested locally. A funded stream has not yet been opened |
| Web hosting | **Live** | [`tali-treasury.vercel.app`](https://tali-treasury.vercel.app) |
| Submission pack | **Complete locally; recording pending** | Written submission and six-slide deck are present; video and rehearsal remain |

The detailed team checklist lives in [`docs/PROGRESS.md`](docs/PROGRESS.md).
Member correction/resubmission is delivered; authenticated event creation is still
specified rather than built. Both are recorded in
[`docs/PRODUCT_NEXT_STEPS.md`](docs/PRODUCT_NEXT_STEPS.md).
The payroll-first release order and acceptance gate live in
[`docs/PAYROLL_LAUNCH_PLAN.md`](docs/PAYROLL_LAUNCH_PLAN.md).

## Live Testnet proof

| Item | Identifier |
| --- | --- |
| Original package v1 (expense treasury) | [`0x7be8aa…9dc523`](https://suiscan.xyz/testnet/object/0x7be8aa82872facbd01372cdeb20375a82f74011dca1512e41737664a759dc523) |
| Current package v2 (payroll + treasury) | [`0xeb973d…b97688`](https://suiscan.xyz/testnet/object/0xeb973dbac9e4e5c2ea0c31ffb6b51b4df1f34e05443f970e89a35301e6b97688) |
| Package upgrade | [`86914s…AaSfN`](https://suiscan.xyz/testnet/tx/86914sL2wFj9s7sfcMqdYx9ekST8FRU8Y1tLT5SAaSfN) |
| Payroll setup | [`85PdAX…8ne73`](https://suiscan.xyz/testnet/tx/85PdAXLeVT82SetGWUK9a98vX3UAEcrarRRtUv8ne73) |
| Payroll mandate | [`0xa04894…f1100`](https://suiscan.xyz/testnet/object/0xa04894a0d3852092d08df2476bb36e47992ec13ad78ba2a6e38cb891f77f1100) |
| Successful RM30 payroll | [`HpUwPs…Xr27y`](https://suiscan.xyz/testnet/tx/HpUwPspN9QgoXBmLARh8iJDFSxEACSwZNxhzz3zXr27y) |
| Refused deficient-EPF payroll | [`Hqw44T…gFT8V`](https://suiscan.xyz/testnet/tx/Hqw44T6qTsQKW5ooPGM8BQmN6uNgaXk6TYNvw9tgFT8V) |
| USDC mandate | [`0x16b9fd…3c7f6f`](https://suiscan.xyz/testnet/object/0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f) |
| Successful 3 USDC payment | [`Aksj8w…5yQXA`](https://suiscan.xyz/testnet/tx/Aksj8wgVoVRnbkVDyCMQ4qMKa1HfkWqDWF8Xptz5yQXA) |
| Rejected 15 USDC overspend | [`5fMDNz…2PNpU`](https://suiscan.xyz/testnet/tx/5fMDNz9dAxJFiamg5Bi5iXnPjnHv2HTUB3hv2wJ2PNpU) |
| Rejected unknown recipient | [`2htVB5…GDnk5e`](https://suiscan.xyz/testnet/tx/2htVB5NJCxhz1QXQtLGDjJ6kLVAwit6MLqzghzGDnk5e) |

The original mandate began with `20 USDC`, allows at most `5 USDC` per claim,
had paid `4 USDC`, and had `16 USDC` remaining after the 3 September payment
recovery test. Refresh on-chain state for the current balance. See the
[reconciliation evidence](docs/LOCAL_PAYMENT_RECONCILIATION_SMOKE.md).

The separate [single-wallet local demo](docs/LOCAL_SINGLE_WALLET_DEMO.md) began with
10 USDC and paid 1.484561 USDC for an RM6 receipt through the browser, leaving
8.515439 USDC. Payment: `J6fWBNa7RQXiLaVVK4ZhZSNphggNLq312HKRyhRbZQq`.
The same Slush wallet submits and reviews in this demo. This does not establish
separation of duties or completion of the hosted flow.

The payroll mandate began with `12.363385 USDC`. Its first authenticated RM30
run paid `6.129767 USDC` to the employee and `2.916523 USDC` across the EPF,
SOCSO and EIS stand-ins in one transaction, leaving `3.317095 USDC`. See the
[payroll Testnet evidence](docs/PAYROLL_TESTNET_EVIDENCE.md). A subsequent
underfunded-EPF attempt was refused on abort `24`; no USDC moved and the mandate
totals remained unchanged.

## How the pieces fit

```text
Employer wallet -> Set Up Payroll -> PayrollMandate<USDC>
                                      |-- atomic payroll + statutory allocations
                                      `-- salary stream -> employee withdrawal

Employer wallet -> Create Expense Treasury -> Mandate<USDC>
                                                |
Member receipt UI (Testnet wallet session; real analyze, create and list)
             |
             v
Gemini receipt + private one-time analysis draft + Supabase claims
             |
             v
Deterministic policy + persisted decision (complete locally)
             | USDC auto_pay
             v
Server-only testnet signer (complete locally)
             |
             v
@tali/treasury-sui (readers and unsigned transaction builders)
             |
             v
Sui Testnet Mandate<USDC> (live enforcement and audit events)

MYR receipts receive a saved live-reference quote and require explicit human
approval of the USDC amount. Other non-USDC currencies remain unsupported. Eligible
USDC review claims can be approved by the treasurer and enter the atomic payment
flow; rejection and correction are durably audited.
```

Salary streaming represents time-based accrual configured by the employer; it is
not proof of attendance or hours worked. Testnet statutory-recipient wallets are
demonstration stand-ins, not production remittance to Malaysian authorities.

The web application reads public mandate state without a key. The process API can
sign an eligible `auto_pay` claim with a server-only testnet agent after an atomic
reservation. The review API uses the same guarded executor after a human approval;
the browser never receives or uses the signing key.

## Repository structure

| Path | Purpose | Primary owner |
| --- | --- | --- |
| `contracts/tali_treasury` | Move package, tests, deployment and USDC operations | Shu Heng |
| `packages/sui-integration` | `@tali/treasury-sui` chain boundary | Shu Heng |
| `packages/shared` | JSON-safe domain types and API contracts | Shared; coordinate first |
| `packages/web` | Next.js product UI and future API routes | Ku Kian Xiang / Lim Wey Cheng |
| `docs` | Design rules, ownership, and team progress | Shared; coordinate first |

See [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md) before editing shared paths.

## Prerequisites

- Node.js 22 or a compatible current LTS release.
- npm.
- Docker Desktop for the standard local Supabase workflow, or PostgreSQL 16 for
  migration-only verification.
- Sui CLI `1.79.0` (or the current Testnet-compatible release) with the Testnet Move framework.
- A Sui Testnet client configuration for Move tests and CLI verification.

## Fresh-clone setup

```powershell
git clone https://github.com/shuheng0330/Tali-Treasury.git
cd "Tali-Treasury"
npm install
Copy-Item .env.example packages/web/.env.local
npm run build
npm test
npm run typecheck
```

The ordered root build compiles `@tali/treasury-sui`, then `@tali/shared`, then
`@tali/web`, so a fresh clone does not depend on an old untracked `dist` folder.

Run the web application:

```powershell
npm run dev
```

Then open `http://localhost:3000/treasury`. The page should say **Live from Sui
Testnet** and display the current mandate state. Connect a Sui Testnet browser
wallet, then use the separate **Sign in** action before protected APIs activate.
The treasury process API
persists real policy decisions and can run the server-only testnet signer for USDC
`auto_pay` claims. Treasurer review actions are real API writes. Revoke and Safety
Test controls remain clearly marked simulations or previews, while their server
write routes now reject any session other than the configured employer.

Run Move tests separately:

```powershell
cd contracts/tali_treasury
sui move test
```

## Environment and secrets

Copy `.env.example` to `packages/web/.env.local`. Package, mandate, capability,
wallet addresses, and transaction digests are public blockchain identifiers.
Private keys, recovery phrases, Gemini keys, and Supabase service-role keys are
secrets.

Never:

- commit a private key or recovery phrase;
- add `AGENT_PRIVATE_KEY` or a service-role key to a `NEXT_PUBLIC_` variable;
- construct Sui transactions directly in the web UI instead of using
  `@tali/treasury-sui`;
- treat a simulated digest or result as on-chain evidence.

Both treasurer and agent wallets need Testnet SUI for gas even when the mandate
holds USDC.

## Receipt backend setup

Set these server-only values in `packages/web/.env.local`:

```dotenv
SUPABASE_URL=
SUPABASE_SECRET_KEY=
SUPABASE_RECEIPT_BUCKET=receipts
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
AGENT_PRIVATE_KEY=
AGENT_CAP_ID=
SUI_NETWORK=testnet
TALI_ALLOW_INSECURE_DEMO_IDENTITY=false
TALI_APP_ORIGIN=http://localhost:3000
TALI_EMPLOYER_WALLET=
```

`SUPABASE_SERVICE_ROLE_KEY` remains a temporary fallback for an existing project,
but `SUPABASE_SECRET_KEY` is preferred. Never add either value to a
`NEXT_PUBLIC_` variable.

`TALI_APP_ORIGIN` must exactly match the browser origin. Hosted deployments must
use their HTTPS origin and keep `TALI_ALLOW_INSECURE_DEMO_IDENTITY=false`. The
compatibility identity is local-only, works only when no session cookie exists,
and never overrides an invalid or expired cookie.

`TALI_EMPLOYER_WALLET` is a server-only canonical lowercase Sui address. Its
authenticated session is required to run payroll, revoke the payroll mandate, or
submit a safety-test transaction. Salary-stream withdrawal instead requires the
authenticated wallet to match that stream's immutable employee address. Exact
origin and session checks run before request parsing or any signing dependency.

Run the local database checks:

```powershell
npm run supabase:start
npm run supabase:reset
npm run supabase:test
```

For a hosted project, authenticate and link the Supabase CLI before applying the
migration:

```powershell
npm exec supabase -- login
npm exec supabase -- link --project-ref YOUR_PROJECT_REF
npm exec supabase -- db push
```

Verify in Supabase that the `receipts` bucket is private, limited to 10 MiB, and
accepts only JPEG, PNG, and WebP. The server exposes:

- `POST /api/auth/challenge` and `POST|GET|DELETE /api/auth/session` — signed
  Sui Testnet challenge and fixed one-hour opaque session;
- `POST /api/receipts/analyze` — multipart fields `receipt` and `eventId`, returning
  extraction plus a nullable 15-minute `draftId` and never a private path;
- `POST /api/claims` — confirmed fields plus `draftId`; trusted event, wallet,
  hash, path, currency and original extraction come from the stored draft;
- `GET /api/events/:id/claims` — persisted claims with 300-second receipt URLs
  for an active member or configured treasurer;
- `GET /api/events/:id/members` — active event roster in stable creation/address
  order, restricted to the configured treasurer;
- `POST /api/events/:id/members` — exact-origin, treasurer-only insertion of a
  canonical wallet and trimmed display name;
- `POST /api/claims/:id/process` — treasurer-triggered deterministic policy and,
  for `auto_pay` only, an atomic server-agent payment attempt.
- `POST /api/claims/:id/review` — one atomic treasurer approval, rejection, or
  correction request; eligible USDC approval immediately starts testnet payment.
- `POST /api/claims/:id/reconcile` — treasurer-only observation of the stored Sui
  digest; returns pending or atomically persists a confirmed terminal result.
- `POST /api/payroll/runs`, `POST /api/mandate/revoke`, and
  `POST /api/safety/attack` — configured-employer-only writes.
- `POST /api/payroll/register` — configured-employer-only verification and
  immutable registration of an already funded payroll creation digest.
- `POST /api/streams/:id/withdraw` — stream-employee-only withdrawal request.

See [`docs/API.md`](docs/API.md) for request/response and error details. Protected
writes require the exact configured Origin header. Wallet connection alone does
not authenticate; the explicit personal-message signature creates the session.

## Integration handoff

Frontend:

- Import JSON-safe application types from `@tali/shared`.
- Import chain reads, configuration, and transaction builders from
  `@tali/treasury-sui`.
- Treat `MandateView` as the API/UI projection of the bigint-based `MandateState`.

Backend:

- Verify the API-backed claim flow after authenticated identity is available.
- Keep the agent private key server-side.
- Re-run deterministic policy checks before building and signing a payment.
- Store receipt hashes and private receipt objects outside the chain.

Immediate hosted rollout (the local payment flow is already verified):

1. Apply migration `20260901030000`, configure the hosted origin and verify both
   wallet roles manually.
2. Configure server-only Gemini and Supabase credentials in the deployment.
3. Roll out and verify [MYR quotes](docs/MYR_USDC_QUOTES.md) with the backend/UI
   teammates. Member correction/resubmission remains pending.
4. Deploy and verify the event-member roster backend; finish authoritative roster
   reload/rendering in the dashboard.
5. Apply the payroll registry migration, retry registration using the already
   funded digest, and bind pages to the selected registered configuration.
6. Configure the testnet agent key and owned `AgentCap` server-side.
7. With separate authorization, run one small funded smoke claim and record its
   real digest; automated tests intentionally never broadcast.

## AI tooling

Built with AI-assisted development across contracts, backend, and frontend —
primarily Claude (Anthropic) and Codex (OpenAI). Git history and PR descriptions
carry no AI attribution by design (see `CLAUDE.md`); that is a commit-metadata
convention, not concealment. Tool use is disclosed here as MUBA's rules require
and does not affect judging.

The submission pack — verified evidence, the three-minute demo script and the
Q and A preparation — is in [docs/SUBMISSION.md](docs/SUBMISSION.md), and the
slides that bookend the demo are in [docs/DECK.md](docs/DECK.md).

## What's new this increment

This repository continues work started earlier in the same MUBA hackathon window
(27 August – 5 September 2026); it is not a prior or external project reused
without change. The two payroll rows in the status table above — statutory
EPF/SOCSO/EIS enforcement and per-second salary accrual — are new since the
milestone recorded in `docs/PROGRESS.md`, alongside the reconciliation and
wallet-session work already listed there.

## Documentation index

- [`docs/API.md`](docs/API.md) — authenticated session, receipt draft and claim endpoint contracts.
- [`docs/MYR_USDC_QUOTES.md`](docs/MYR_USDC_QUOTES.md) — live-reference valuation, free-plan setup, safeguards and rollout.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — authoritative team status and next work.
- [`docs/PAYROLL_LAUNCH_PLAN.md`](docs/PAYROLL_LAUNCH_PLAN.md) — payroll-first scope, order and demo acceptance gate.
- [`docs/PAYROLL_TESTNET_EVIDENCE.md`](docs/PAYROLL_TESTNET_EVIDENCE.md) — verified setup, atomic RM30 payroll, recipients and remaining mandate state.
- [`docs/PRODUCT_NEXT_STEPS.md`](docs/PRODUCT_NEXT_STEPS.md) — separate Set Up Payroll and Create Expense Treasury product flows.
- [`docs/LOCAL_SINGLE_WALLET_DEMO.md`](docs/LOCAL_SINGLE_WALLET_DEMO.md) — separate demo mandate and verified browser MYR payment.
- [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) — production implementation order and acceptance criteria.
- [`docs/HOSTED_SUPABASE_VERIFICATION.md`](docs/HOSTED_SUPABASE_VERIFICATION.md) — hosted schema verification scope and reproducible checks.
- [`docs/OWNERSHIP.md`](docs/OWNERSHIP.md) — path ownership and coordination rules.
- [`docs/DESIGN.md`](docs/DESIGN.md) — binding UI design rules.
- [`contracts/tali_treasury/DEPLOYMENT.md`](contracts/tali_treasury/DEPLOYMENT.md) — authoritative deployed objects and transaction evidence.
- [`contracts/tali_treasury/USDC_SETUP.md`](contracts/tali_treasury/USDC_SETUP.md) — faucet, funding, and recreation procedure.
- [`contracts/tali_treasury/ERROR_CODES.md`](contracts/tali_treasury/ERROR_CODES.md) — Move abort-code contract.
- [`packages/sui-integration/README.md`](packages/sui-integration/README.md) — chain reader and transaction-builder usage.
