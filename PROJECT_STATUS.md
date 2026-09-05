# Project status

Last updated: 5 September 2026 (MYT)

## Latest integrated verification

The current branch integrates `origin/main` through `c390cd5`. Authenticated
configuration listing, URL selection, configuration-scoped preview/run/history,
per-run mandate persistence, signer/cap-owner validation and fail-closed
salary-stream binding are complete locally.

Parallel setup implementations were consolidated around one strict digest-only
verifier, one immutable registry migration and the canonical
`POST /api/payroll/register` handler while preserving the latest setup UI. The
post-merge checks pass: 42 Move tests, 48 Sui integration tests, 692 web tests
(691 passing and one intentional skip), 154 pgTAP assertions, root typecheck,
production build and a zero-vulnerability audit. A forward migration preserves
the old local registration read-only and installs the strict registry without a
database reset. The existing setup digest has been re-verified against its
historical creation-state objects and stored in that registry. Payroll package
v2, setup, one successful run and one abort-24 refusal are live. Registered
stream opening and persistence are live on Testnet. Employer inspection is
separate from employee-only withdrawal; withdrawal evidence and hosted-registry
verification remain pending.

## Complete locally

- registered payroll selection across payroll, history, proof and earnings;
- capability-free employer/employee configuration views;
- registry-derived employee/statutory execution inputs and mandate-filtered runs;
- stream wallet, employee, mandate, package and signer checks before signing;
- employer-only stream creation from an authorized payroll, exact created-object
  verification, immutable registry persistence and registry-backed earnings lookup;
- employer-or-employee stream inspection with employee-only withdrawal authority;

- strict Gemini receipt schema and `gemini-3.5-flash-lite` default;
- SHA-256 hashing and event-scoped immutable storage paths;
- secure Supabase migration for events, active members, claims and private receipts;
- application services for analyze, create claim and list claims;
- Supabase database and storage adapters with sanitized errors;
- Next.js API routes for all three shared endpoint contracts;
- API-backed `/claim` receipt analysis, confirmation, claim creation and claim list;
- pure deterministic policy evaluation across all nine shared rules, with
  explainable `auto_pay`, `review` and `reject` outcomes;
- treasurer-only `POST /api/claims/:id/process` integration with live read-only Sui
  mandate snapshots, idempotent decisions and atomic Supabase state transitions;
- live treasury queue action for invoking the server policy endpoint and rendering
  its persisted decision instead of a browser-side duplicate;
- real treasurer approve, reject, and request-correction actions with guarded
  persistence, durable audit metadata, replay handling, and conflict safety;
- human approval for eligible USDC review claims, including fresh mandate policy
  checks and immediate testnet payment through the single-winner signer path;
- a shared confirmation dialog with required reasons, payment consequence copy,
  action-specific pending/errors, queue reloads, and mandate refresh after payment;
- non-USDC receipts fail closed to review until an explicit USDC quote exists;
- testnet-only backend-agent payment execution for `auto_pay` claims, including a
  fresh policy preflight, atomic `approved -> paying` reservation, confirmed
  terminal persistence and reconciliation-safe uncertain submissions;
- lazy server-only Ed25519 and `AgentCap` configuration with preparation separated
  from submission and fake-operation verification that never broadcasts;
- 295 web Vitest tests and 45 Sui integration tests passing after merging PR #17,
  including review,
  audit mapping, malformed input, concurrency, sanitization and idempotency;
- all 58 pgTAP assertions pass after replaying the complete local migration chain,
  including the 16 review persistence, constraint, RLS, grant and trigger checks;
- web TypeScript check passing at the API checkpoint.
- Testnet browser-wallet connection plus explicit signed authentication using
  `@mysten/dapp-kit-react@2.1.23` and `SuiGrpcClient`;
- five-minute single-use challenges, one-hour opaque HTTP-only sessions, exact
  origin enforcement, logout/account-change invalidation and safe expiry states;
- 15-minute private analysis drafts consumed atomically into one claim, with
  original extraction retained and no private paths exposed by public APIs;
- authenticated member/treasurer route identity, invalid-cookie precedence and
  local-only no-cookie demo compatibility;
- 324 web tests, 45 Sui integration tests and 91 pgTAP assertions passing at the
  wallet-session checkpoint.
- safe on-demand reconciliation for uncertain `paying` claims: digest persistence
  before broadcast, exact-digest Testnet lookup, terminal compare-and-set updates,
  idempotent replay, and no signing or resubmission during reconciliation;
- authenticated `POST /api/claims/:id/reconcile` plus treasury digest display,
  explorer links, explicit bounded polling, and reconcile-on-refresh behavior;
- 349 web tests passing at the reconciliation checkpoint. The new migration and
  pgTAP assertions are authored; their local replay remains pending Docker startup.
- employer-session authorization for payroll execution, mandate revocation, and
  safety-test broadcasts, with exact-origin checks before parsing or mutation;
- employee-session ownership enforcement for salary-stream withdrawals, including
  read-before-withdraw ordering and safe denial without signing;
- treasurer-only event-member roster services and `GET`/`POST
  `/api/events/:id/members`, with active-only stable listing, exact-origin writes,
  strict address/name validation, duplicate conflicts, and sanitized errors;
- the existing Treasury add-member transport now uses the shared
  `{ address, displayName }` and `{ member }` contracts;
- authenticated payroll registration with exact-origin employer authorization,
  finalized-transaction discovery, package/coin/template/ownership verification,
  immutable Supabase snapshots, exact replay and collision-safe concurrency;
- `/payroll/setup` reaches the real registration endpoint using only the funded
  digest and preserves that digest for registration-only retries;
- statutory payroll and salary-stream enforcement (`payroll.move`, 29 contract
  tests), the EPF/SOCSO/EIS calculator, and the PayrollDesk/earnings UI — complete
  locally, not yet published to Testnet. See `docs/PAYROLL_LAUNCH_PLAN.md` for the
  remaining publish work before the pitch;
- 535 web tests (534 passing, one intentional skip), 45 Sui integration tests,
  and 125 pgTAP assertions passing after the roster integration.
- 594 web tests passing with one intentional skip, 48 Sui integration tests and
  141 pgTAP assertions passing at the payroll-registration checkpoint.

## Hosted schema verified

- Supabase migration `20260830000000` was applied to project
  `mnoalwykrmueimmuyllw` on 30 August 2026.
- Seed migration `20260831000000` created demo event
  `ba7e50e2-7e7b-4a67-a505-9e3a329739ae` and its Kian Xiang membership.
- Additive membership migration `20260831010000` is applied. Shu Heng, Lim Wey
  Cheng, and Kian Xiang were verified as active members of the hosted demo event.
- Migration history, schema lint, RLS, grants and private receipt-bucket metadata
  were checked. The recorded scope and reproducible checks are in
  [`docs/HOSTED_SUPABASE_VERIFICATION.md`](docs/HOSTED_SUPABASE_VERIFICATION.md).

## Local verification environment

Docker Desktop and the local Supabase stack are available. The complete migration
chain through `20260904020000_payroll_configurations.sql` was replayed from a reset
on 4 September; all 141 pgTAP assertions then passed. No hosted migration or hosted
data was changed by this verification.

## Pending integration

- configure server-only Gemini and Supabase credentials in the deployment;
- configure a funded testnet backend signer and its owned `AgentCap`, then run one
  separately authorized small live smoke payment;
- apply the wallet-auth/draft migration to hosted Supabase and configure
  `TALI_APP_ORIGIN` to the deployed HTTPS origin;
- manually verify member analyze/create/list and treasurer process/review with
  browser Testnet wallets;
- roll out and verify the merged MYR-to-USDC quote capture, expiry, and converted
  payout path in the hosted environment;
- add member correction and resubmission after a correction request;
- deploy and verify the event-member roster API, then let the Treasury UI reload
  and render the authoritative roster after additions;
- apply the payroll-registry migration, register an already funded creation
  digest, then bind payroll, proof and earnings to an explicitly selected record;
- sign in as the registered employee and record one accrued stream withdrawal;
- run the hosted receipt flow end to end after authenticated identity is available.

## Known limitations

- The hosted environment remains on its previous schema until migration
  `20260901030000` is applied; local implementation and tests are complete.
- The local insecure identity fallback remains for compatibility only when no
  cookie exists and the explicit flag is true; it is prohibited in hosted config.
- Reject and correction return `payment: null`; eligible human approval enters the
  same guarded backend payment executor as automatic approval.
- MYR and other non-USDC receipts are preserved but cannot auto-pay until the
  conversion-quote increment is implemented.
- Payment code can prepare and submit on Sui Testnet when valid server credentials
  are supplied, but no real transaction was broadcast during this increment.
- A legacy `paying` claim created before durable attempt metadata cannot be safely
  reconciled or retried automatically; it fails closed for manual investigation.
- Reconciliation is deliberately treasurer-triggered and on demand; no scheduled
  background job is included in the hackathon scope.
- Event membership is add-only in this increment; rename, deactivate, reactivate,
  and payroll Move roster mutation are deferred.
- Registered payroll selection and page/API binding remain the next development
  increment; registration deliberately does not overwrite global payroll IDs.
- Mainnet signing and real-value payments remain out of scope.
