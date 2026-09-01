# Project status

Last updated: 1 September 2026 (MYT)

## Complete locally

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

## Environment note

Docker Desktop 4.66.1 is operational after backing up its inaccessible transient
Windows runtime sockets and explicitly disabling the unused Model Runner feature.
No images, volumes or project data were removed. The local Supabase stack is
running and has replayed all migrations through
`20260901020000_claim_review_actions.sql`. Keep at least 20 GB free on C: and stop
the stack when it is not needed.

## Pending integration

- configure server-only Gemini and Supabase credentials in the deployment;
- configure a funded testnet backend signer and its owned `AgentCap`, then run one
  separately authorized small live smoke payment;
- add wallet-signature authentication;
- bind analysis to claim confirmation through a signed token or persisted draft;
- add trusted MYR-to-USDC quote capture, expiry and converted payout storage;
- add automatic reconciliation for uncertain payment submissions;
- add member correction and resubmission after a correction request;
- run the hosted receipt flow end to end after authenticated identity is available.

## Known limitations

- A submitted wallet address is demo identity, not authenticated identity.
- The service-role-backed receipt APIs are disabled by default and require an
  explicit local-demo opt-in until wallet/session authentication exists.
- Analyze and create-claim are two validated calls but are not cryptographically
  bound to one another.
- The frontend is wired to the hosted receipt APIs, but Production intentionally
  disables them until authenticated identity replaces the demo address.
- Reject and correction return `payment: null`; eligible human approval enters the
  same guarded backend payment executor as automatic approval.
- MYR and other non-USDC receipts are preserved but cannot auto-pay until the
  conversion-quote increment is implemented.
- Payment code can prepare and submit on Sui Testnet when valid server credentials
  are supplied, but no real transaction was broadcast during this increment.
- A claim left in `paying` requires manual reconciliation before retry; automatic
  digest recovery is not implemented.
- Mainnet signing and real-value payments remain out of scope.
