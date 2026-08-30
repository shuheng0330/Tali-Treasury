begin;

select plan(33);

create or replace function pg_temp.capture_sqlstate(statement text)
returns text
language plpgsql
as $$
begin
  execute statement;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select has_table('public', 'events', 'events table exists');
select has_table('public', 'event_members', 'event_members table exists');
select has_table('public', 'claims', 'claims table exists');

select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.events')), false),
  'events has RLS enabled'
);
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.event_members')), false),
  'event_members has RLS enabled'
);
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.claims')), false),
  'claims has RLS enabled'
);
select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and tablename in ('events', 'event_members', 'claims')
  ),
  0::bigint,
  'application tables expose no browser policies'
);
select ok(
  not has_table_privilege('anon', 'public.events', 'select'),
  'anon cannot read events'
);
select ok(
  not has_table_privilege('authenticated', 'public.claims', 'select'),
  'authenticated cannot read claims'
);
select ok(
  has_table_privilege('service_role', 'public.events', 'select,insert,update,delete'),
  'service role can manage events'
);
select ok(
  has_table_privilege('service_role', 'public.event_members', 'select,insert,update,delete'),
  'service role can manage event members'
);
select ok(
  has_table_privilege('service_role', 'public.claims', 'select,insert,update,delete'),
  'service role can manage claims'
);

select is(
  (select public from storage.buckets where id = 'receipts'),
  false,
  'receipts bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'receipts'),
  10485760::bigint,
  'receipts bucket is limited to 10 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'receipts'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'receipts bucket accepts only supported image types'
);

create temporary table test_context (
  event_one uuid,
  event_two uuid
);

insert into public.events (
  name,
  organisation,
  mandate_object_id,
  treasurer_wallet,
  allowed_categories,
  starts_at,
  expires_at
)
values (
  'MUBA Hackathon',
  'Multimedia University',
  '0x1111111111111111111111111111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222222222222222222222222222',
  array['food', 'printing', 'transport'],
  '2026-08-30T00:00:00Z',
  '2026-09-02T00:00:00Z'
), (
  'Second Event',
  'Multimedia University',
  '0x3333333333333333333333333333333333333333333333333333333333333333',
  '0x4444444444444444444444444444444444444444444444444444444444444444',
  array['printing'],
  '2026-08-30T00:00:00Z',
  '2026-09-02T00:00:00Z'
);

insert into test_context (event_one, event_two)
select
  (select id from public.events where name = 'MUBA Hackathon'),
  (select id from public.events where name = 'Second Event');

insert into public.event_members (event_id, wallet_address, display_name)
select event_one,
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Lim Wey Cheng'
from test_context;

insert into public.event_members (event_id, wallet_address, display_name)
select event_two,
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Lim Wey Cheng'
from test_context;

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.events (
      name, organisation, mandate_object_id, treasurer_wallet,
      allowed_categories, starts_at, expires_at
    ) values (
      ' Bad Name ', 'Organisation',
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      array['food'], '2026-08-30T00:00:00Z', '2026-09-02T00:00:00Z'
    )
  $sql$),
  '23514',
  'event text must already be trimmed'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.events (
      name, organisation, mandate_object_id, treasurer_wallet,
      allowed_categories, starts_at, expires_at
    ) values (
      'Bad Wallet', 'Organisation', '0x1234',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      array['food'], '2026-08-30T00:00:00Z', '2026-09-02T00:00:00Z'
    )
  $sql$),
  '23514',
  'Sui addresses and object IDs must be canonical'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.events (
      name, organisation, mandate_object_id, treasurer_wallet,
      allowed_categories, starts_at, expires_at
    ) values (
      'Bad Category', 'Organisation',
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      array['luxury'], '2026-08-30T00:00:00Z', '2026-09-02T00:00:00Z'
    )
  $sql$),
  '23514',
  'allowed categories match the shared contract'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.event_members (event_id, wallet_address, display_name)
    select event_one,
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ' Bad Name '
    from test_context
  $sql$),
  '23514',
  'member display names must already be trimmed'
);

insert into public.event_members (event_id, wallet_address, display_name, active)
select event_one,
  '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'Inactive Member',
  false
from test_context;

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      event_one || '/inactive.png', repeat('3', 64), 'inactive',
      'submitted', 1, 'Shop', 'MYR', '2026-08-30', 'printing', '',
      jsonb_build_object('receiptHash', repeat('3', 64))
    from test_context
  $sql$),
  '23514',
  'inactive members cannot submit claims'
);

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      event_one || '/outsider.png', repeat('b', 64), 'shop|2026-08-30|4500000',
      'submitted', 4500000, 'Shop', 'MYR', '2026-08-30', 'printing', '',
      jsonb_build_object('receiptHash', repeat('b', 64))
    from test_context
  $sql$),
  '23503',
  'only event members can own claims'
);

select lives_ok($sql$
  insert into public.claims (
    event_id, submitter_wallet, receipt_object_path, receipt_sha256,
    fuzzy_key, state, amount, merchant, currency, receipt_date,
    category, description, receipt_analysis
  )
  select event_one,
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    event_one || '/receipt.png', repeat('a', 64), 'campus print shop|2026-08-30|4500000',
    'submitted', 4500000, 'Campus Print Shop', 'MYR', '2026-08-30', 'printing', '',
    jsonb_build_object('receiptHash', repeat('a', 64))
  from test_context
$sql$, 'an active member can submit a valid claim');

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/duplicate.png', repeat('a', 64), 'duplicate',
      'submitted', 4500000, 'Shop', 'MYR', '2026-08-30', 'printing', '',
      jsonb_build_object('receiptHash', repeat('a', 64))
    from test_context
  $sql$),
  '23505',
  'a receipt cannot repeat within one event'
);

select lives_ok($sql$
  insert into public.claims (
    event_id, submitter_wallet, receipt_object_path, receipt_sha256,
    fuzzy_key, state, amount, merchant, currency, receipt_date,
    category, description, receipt_analysis
  )
  select event_two,
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    event_two || '/receipt.png', repeat('a', 64), 'campus print shop|2026-08-30|4500000',
    'submitted', 4500000, 'Campus Print Shop', 'MYR', '2026-08-30', 'printing', '',
    jsonb_build_object('receiptHash', repeat('a', 64))
  from test_context
$sql$, 'the same receipt can appear in a different event');

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/bad-amount.png', repeat('c', 64), 'bad amount',
      'submitted', 1.5, 'Shop', 'MYR', '2026-08-30', 'printing', '',
      jsonb_build_object('receiptHash', repeat('c', 64))
    from test_context
  $sql$),
  '23514',
  'claim amounts are positive integer base units'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/bad-hash.png', 'ABC', 'bad hash',
      'submitted', 1, 'Shop', 'MYR', '2026-08-30', 'printing', '', '{}'::jsonb
    from test_context
  $sql$),
  '23514',
  'receipt hash must be lowercase SHA-256 hex'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/bad-merchant.png', repeat('d', 64), 'bad merchant',
      'submitted', 1, ' Shop ', 'MYR', '2026-08-30', 'printing', '',
      jsonb_build_object('receiptHash', repeat('d', 64))
    from test_context
  $sql$),
  '23514',
  'claim merchant must already be trimmed'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/bad-category.png', repeat('e', 64), 'bad category',
      'submitted', 1, 'Shop', 'MYR', '2026-08-30', 'luxury', '',
      jsonb_build_object('receiptHash', repeat('e', 64))
    from test_context
  $sql$),
  '23514',
  'claim category matches the shared contract'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/bad-state.png', repeat('f', 64), 'bad state',
      'unknown', 1, 'Shop', 'MYR', '2026-08-30', 'printing', '',
      jsonb_build_object('receiptHash', repeat('f', 64))
    from test_context
  $sql$),
  '23514',
  'claim state matches the shared contract'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/bad-analysis.png', repeat('0', 64), 'bad analysis',
      'submitted', 1, 'Shop', 'MYR', '2026-08-30', 'printing', '', '[]'::jsonb
    from test_context
  $sql$),
  '23514',
  'receipt analysis must be a JSON object'
);

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.claims (
      event_id, submitter_wallet, receipt_object_path, receipt_sha256,
      fuzzy_key, state, amount, merchant, currency, receipt_date,
      category, description, receipt_analysis
    )
    select event_one,
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      event_one || '/missing-analysis-hash.png', repeat('4', 64), 'missing hash',
      'submitted', 1, 'Shop', 'MYR', '2026-08-30', 'printing', '', '{}'::jsonb
    from test_context
  $sql$),
  '23514',
  'receipt analysis must contain the matching hash'
);

select lives_ok($sql$
  update public.event_members
  set active = false
  where event_id = (select event_one from test_context)
    and wallet_address =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$sql$, 'members can be deactivated without deleting claim history');

create temporary table timestamp_context (before_update timestamptz);
insert into timestamp_context
select updated_at from public.claims order by created_at limit 1;

update public.claims
set description = 'updated', updated_at = '2000-01-01T00:00:00Z'
where id = (select id from public.claims order by created_at limit 1);

select ok(
  (
    select claims.updated_at > timestamp_context.before_update
    from public.claims cross join timestamp_context
    where claims.description = 'updated'
  ),
  'claim updates refresh updated_at'
);

select * from finish();
rollback;
