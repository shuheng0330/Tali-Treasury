# Project status

Last updated: 31 August 2026 (MYT)

## Complete locally

- strict Gemini receipt schema and `gemini-3.5-flash-lite` default;
- SHA-256 hashing and event-scoped immutable storage paths;
- secure Supabase migration for events, active members, claims and private receipts;
- application services for analyze, create claim and list claims;
- Supabase database and storage adapters with sanitized errors;
- Next.js API routes for all three shared endpoint contracts;
- API-backed `/claim` receipt analysis, confirmation, claim creation and claim list;
- 72 passing web Vitest tests, plus 14 Sui integration tests;
- 42 passing pgTAP database assertions on a clean disposable PostgreSQL 17
  database;
- web TypeScript check passing at the API checkpoint.

## Hosted schema verified

- Supabase migration `20260830000000` was applied to project
  `mnoalwykrmueimmuyllw` on 30 August 2026.
- Seed migration `20260831000000` created demo event
  `ba7e50e2-7e7b-4a67-a505-9e3a329739ae` and its Kian Xiang membership.
- Additive membership migration `20260831010000` is applied. Shu Heng, Lim Wey
  Cheng, and Kian Xiang were verified as active members of the hosted event.
- Migration history, schema lint, RLS, grants and private receipt-bucket metadata
  were checked. The recorded scope and reproducible checks are in
  [`docs/HOSTED_SUPABASE_VERIFICATION.md`](docs/HOSTED_SUPABASE_VERIFICATION.md).

## Environment note

Docker Desktop 4.66.1 is operational after resetting its inaccessible Windows
runtime sockets and data disk. The full local Supabase stack now starts with its
optional analytics services disabled, avoiding Docker's unauthenticated TCP port
2375 while retaining Database, Auth, Storage, REST, Realtime, Edge Runtime,
Mailpit and Studio. Keep at least 20 GB free on C: and stop the stack when it is
not needed.

## Pending integration

- configure server-only Gemini and Supabase credentials in the deployment;
- add wallet-signature authentication;
- bind analysis to claim confirmation through a signed token or persisted draft;
- implement deterministic policy, review actions and backend Sui signing;
- run the hosted receipt flow end to end after authenticated identity is available.

## Known limitations

- A submitted wallet address is demo identity, not authenticated identity.
- The service-role-backed receipt APIs are disabled by default and require an
  explicit local-demo opt-in until wallet/session authentication exists.
- Analyze and create-claim are two validated calls but are not cryptographically
  bound to one another.
- The frontend is wired to the hosted receipt APIs, but Production intentionally
  disables them until authenticated identity replaces the demo address.
- No backend code in this increment can sign or broadcast a Sui transaction.
