# Hosted Supabase verification

This record separates hosted database readiness from deployment of the Tali web
application. It contains no credentials or private data.

## Recorded result

- Verified by the backend teammate on 30 August 2026.
- Supabase project reference: `mnoalwykrmueimmuyllw`.
- Applied migrations:
  - `20260830000000_backend_receipt_schema.sql`;
  - `20260831000000_seed_demo_event.sql`.
- The demo seed was applied and remote migration history was synchronized on
  31 August 2026. A linked hosted schema lint returned no errors.
- Reported checks: synchronized migration history, clean schema lint, enabled RLS,
  restricted table grants, and private receipt-bucket metadata.

This proves that the database schema and demo event/member seed are hosted. It
does not prove that the web API is deployed, configured with production secrets,
authenticated, or tested end to end.

## Reproduce the non-secret checks

An authorized teammate can link the Supabase CLI and compare migration history:

```powershell
npm exec supabase -- login
npm exec supabase -- link --project-ref mnoalwykrmueimmuyllw
npm exec supabase -- migration list --linked
npm exec supabase -- db lint --linked --schema public --level warning --fail-on warning
```

Run the following read-only SQL in the hosted Supabase SQL editor:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('events', 'event_members', 'claims')
order by c.relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('events', 'event_members', 'claims')
order by grantee, table_name, privilege_type;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'receipts';
```

Expected results:

- RLS is enabled on all three application tables.
- `anon` and `authenticated` have no application-table privileges.
- `service_role` has the privileges required by the server adapters.
- `receipts` is private, limited to 10 MiB, and accepts only JPEG, PNG and WebP.

Do not paste CLI tokens, secret keys, service-role keys, receipt URLs, or customer
data into this file or a pull request.
