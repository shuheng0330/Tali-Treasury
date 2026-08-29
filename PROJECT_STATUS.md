# Project status

Last updated: 30 August 2026 (MYT)

## Completed locally

- strict Gemini receipt schema and `gemini-3.5-flash-lite` default;
- SHA-256 hashing and event-scoped immutable storage paths;
- secure Supabase migration for events, active members, claims and private receipts;
- application services for analyze, create claim and list claims;
- Supabase database and storage adapters with sanitized errors;
- Next.js API routes for all three shared endpoint contracts;
- 58 passing Vitest tests;
- 30 passing pgTAP database assertions on a clean disposable PostgreSQL 16
  database;
- web TypeScript check passing at the API checkpoint.

## Environment note

Docker Desktop 4.66.1 could not start because its Windows runtime sockets were
left as inaccessible reparse points. The database suite was therefore run
unchanged against a clean disposable PostgreSQL 16 cluster with Supabase roles and
the `storage.buckets` table bootstrapped. Standard Supabase reset, database test
and lint commands still need to be rerun once Docker Desktop is healthy.

## Pending integration

- apply and verify the migration on the hosted Supabase project;
- seed the demo event and active member wallet addresses;
- configure server-only Gemini and Supabase credentials in the deployment;
- point the current mock claim UI at the implemented routes;
- add wallet-signature authentication;
- bind analysis to claim confirmation through a signed token or persisted draft;
- implement deterministic policy, review actions and backend Sui signing;
- deploy and run fresh-browser end-to-end verification.

## Known limitations

- A submitted wallet address is demo identity, not authenticated identity.
- Analyze and create-claim are two validated calls but are not cryptographically
  bound to one another.
- Receipt analysis and persistence are implemented locally but not yet exercised
  through the current frontend or hosted services.
- No backend code in this increment can sign or broadcast a Sui transaction.
