# Architecture and coding design

## System boundary

The receipt backend is a server-only vertical slice inside the Next.js web
workspace. It reuses `@tali/shared` for domain and API contracts and does not
construct Sui transactions.

```text
Next.js API route
      |
      v
Application service
  |       |       |
  v       v       v
Gemini  Claim    Receipt
adapter repository store
          |        |
          +--- Supabase
```

## Modules

- `src/server/receipts` validates Gemini output, hashes exact bytes and converts
  displayed decimals to six-decimal base units with `BigInt` arithmetic.
- `src/server/claims` defines injected ports, validates claim confirmation input
  and coordinates analyze, persist and list use cases.
- `src/server/supabase` owns privileged client construction, database row mapping,
  private uploads and signed URLs.
- `src/server/dependencies.ts` composes production adapters lazily so importing a
  route never reads secrets.
- `src/app/api` contains thin Node.js route handlers and testable handler factories.

## Database design

- `events` stores organisation, treasurer, mandate object, allowed categories and
  lifecycle dates.
- `event_members` uses `(event_id, wallet_address)` as its primary key and records
  whether membership is active.
- `claims` stores positive integer base units, normalized receipt fields, analysis
  JSON, internal object path and optional later decision/payment JSON.
- `(event_id, receipt_sha256)` is unique. Receipt object paths are globally unique.
- A composite membership foreign key preserves ownership history, while an insert
  trigger rejects claims by inactive members without preventing later member
  deactivation.
- All three tables enable RLS without browser policies. Explicit grants are limited
  to `service_role`.

The private `receipts` bucket has a 10 MiB limit and accepts only JPEG, PNG and
WebP. Public URLs are never stored; list operations create 300-second signed URLs.

Because wallet authentication is not part of this increment, all privileged
receipt routes fail closed by default. Controlled local demos must explicitly
enable insecure demo identity mode; claim listing also requires an active member
viewer address. This is not production authentication.

## Error handling

`ServerError` carries a stable code, safe message and HTTP status. Provider errors
are retained only as an internal cause. Unknown failures become a generic
`database_failed` response and never return raw provider text.

## Testing strategy

- Vitest tests use injected Gemini, repository, storage and service boundaries.
- Receipt hashing uses real bytes and a known SHA-256 vector.
- Route tests use real `Request`, `FormData`, `File` and `Response` objects.
- pgTAP applies the migration to a clean database and checks constraints,
  privileges, RLS, storage configuration and duplicate behavior.
- Repository completion requires build, typecheck, tests, audit, secret scan and
  attribution scan.

## Deployment design

Local Supabase is the normal development target. Hosted deployment uses
`supabase login`, `supabase link` and `supabase db push`, followed by direct checks
that RLS, grants and the private bucket match the migration. Hosted verification
must be recorded separately from local completion. Migration
`20260830000000_backend_receipt_schema.sql` was applied to hosted project
`mnoalwykrmueimmuyllw` on 30 August 2026 and verified through synchronized
migration history, a clean schema lint, PostgreSQL catalog checks and storage
bucket metadata.
The non-secret verification scope and reproduction queries are recorded in
[`docs/HOSTED_SUPABASE_VERIFICATION.md`](docs/HOSTED_SUPABASE_VERIFICATION.md).

Hosted demo data uses immutable additive migrations. Migration `20260831000000`
created the fixed demo event and Kian Xiang membership; migration
`20260831010000` adds Shu Heng and Lim Wey Cheng without rewriting the applied
seed or deleting other members.

Local Logflare analytics and its Vector collector are intentionally disabled. On
Windows the collector otherwise requires Docker Desktop's unauthenticated TCP API
on port 2375, which this project does not enable. Database, Auth, Storage, REST,
Realtime, Edge Runtime, Mailpit and Studio remain available; developers inspect
local service output with `docker logs` when needed.
