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

select has_table('public', 'wallet_auth_challenges', 'wallet challenges table exists');
select has_table('public', 'wallet_sessions', 'wallet sessions table exists');
select has_table('public', 'receipt_analysis_drafts', 'analysis drafts table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.wallet_auth_challenges'::regclass), 'challenge RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.wallet_sessions'::regclass), 'session RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.receipt_analysis_drafts'::regclass), 'draft RLS enabled');
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename in ('wallet_auth_challenges', 'wallet_sessions', 'receipt_analysis_drafts')),
  0::bigint,
  'auth tables expose no browser policies'
);
select ok(
  not has_table_privilege('anon', 'public.wallet_sessions', 'select')
  and not has_table_privilege('authenticated', 'public.wallet_sessions', 'select'),
  'browser roles cannot read sessions'
);
select ok(
  has_table_privilege('service_role', 'public.wallet_auth_challenges', 'select,insert,update')
  and has_table_privilege('service_role', 'public.wallet_sessions', 'select,insert,update')
  and has_table_privilege('service_role', 'public.receipt_analysis_drafts', 'select,insert,update'),
  'service role can manage auth persistence'
);
select has_function(
  'public',
  'create_wallet_session_from_challenge',
  array['uuid', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone'],
  'atomic challenge consumption function exists'
);
select has_function(
  'public',
  'create_claim_from_analysis_draft',
  array['uuid', 'text', 'numeric', 'text', 'date', 'text', 'text', 'timestamp with time zone'],
  'atomic draft consumption function exists'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.wallet_auth_challenges (wallet_address, message, expires_at)
    values ('0x1234', 'bad', now() + interval '5 minutes')
  $sql$),
  '23514',
  'challenge wallets must be canonical'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.wallet_sessions (token_hash, wallet_address, expires_at)
    values ('short', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now() + interval '1 hour')
  $sql$),
  '23514',
  'session tokens must be SHA-256 hashes'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.wallet_auth_challenges (wallet_address, message, expires_at, created_at)
    values ('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bad expiry', '2026-09-01T12:00:00Z', '2026-09-01T12:00:00Z')
  $sql$),
  '23514',
  'challenge expiry must be after creation'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.wallet_sessions (token_hash, wallet_address, expires_at, created_at)
    values (repeat('8', 64), '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '2026-09-01T12:00:00Z', '2026-09-01T12:00:00Z')
  $sql$),
  '23514',
  'session expiry must be after creation'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.wallet_sessions (token_hash, wallet_address, expires_at)
    values (repeat('7', 64), '0x1234', now() + interval '1 hour')
  $sql$),
  '23514',
  'session wallets must be canonical'
);

insert into public.events (
  id, name, organisation, mandate_object_id, treasurer_wallet,
  allowed_categories, starts_at, expires_at
) values (
  '31111111-1111-4111-8111-111111111111', 'Wallet Auth Test', 'Tali',
  '0x1111111111111111111111111111111111111111111111111111111111111111',
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  array['printing'], '2026-08-30T00:00:00Z', '2026-09-03T00:00:00Z'
);

insert into public.event_members (event_id, wallet_address, display_name)
values (
  '31111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Lim Wey Cheng'
);

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.receipt_analysis_drafts (event_id, wallet_address, receipt_object_path, receipt_sha256, analysis, expires_at)
    values ('31111111-1111-4111-8111-111111111111', '0x1234', 'bad-wallet.png', repeat('6', 64), '{}'::jsonb, now() + interval '15 minutes')
  $sql$),
  '23514',
  'draft wallets must be canonical'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.receipt_analysis_drafts (event_id, wallet_address, receipt_object_path, receipt_sha256, analysis, expires_at, created_at)
    values ('31111111-1111-4111-8111-111111111111', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bad-expiry.png', repeat('5', 64), '{}'::jsonb, '2026-09-01T12:00:00Z', '2026-09-01T12:00:00Z')
  $sql$),
  '23514',
  'draft expiry must be after creation'
);

insert into public.wallet_auth_challenges (
  id, wallet_address, message, expires_at, created_at
) values (
  '32222222-2222-4222-8222-222222222222',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Tali Treasury wallet sign-in',
  '2026-09-01T12:05:00Z',
  '2026-09-01T11:59:00Z'
);

select is(
  (
    select wallet_address
    from public.create_wallet_session_from_challenge(
      '32222222-2222-4222-8222-222222222222',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      repeat('c', 64),
      '2026-09-01T13:00:00Z',
      '2026-09-01T12:00:00Z'
    )
  ),
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'valid challenge creates a session for its wallet'
);
select isnt(
  (select consumed_at from public.wallet_auth_challenges where id = '32222222-2222-4222-8222-222222222222'),
  null,
  'session creation consumes the challenge'
);
select is(
  (select count(*)::bigint from public.wallet_sessions where token_hash = repeat('c', 64)),
  1::bigint,
  'only the session token hash is persisted'
);
select is(
  pg_temp.capture_sqlstate($sql$
    select * from public.create_wallet_session_from_challenge(
      '32222222-2222-4222-8222-222222222222',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      repeat('d', 64),
      '2026-09-01T13:00:00Z',
      '2026-09-01T12:00:01Z'
    )
  $sql$),
  'PT401',
  'a challenge cannot be replayed'
);

insert into public.receipt_analysis_drafts (
  id, event_id, wallet_address, receipt_object_path, receipt_sha256,
  analysis, expires_at, created_at
) values (
  '33333333-3333-4333-8333-333333333333',
  '31111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'wallet-auth/receipt.png', repeat('e', 64),
  jsonb_build_object(
    'merchant', 'Extracted Shop', 'amount', '1000000', 'currency', 'USDC',
    'receiptDate', '2026-08-31', 'category', 'printing', 'confidence', 0.99,
    'uncertainFields', jsonb_build_array(), 'warnings', jsonb_build_array(),
    'receiptHash', repeat('e', 64), 'fuzzyKey', 'extracted shop|2026-08-31|1000000'
  ),
  '2026-09-01T12:15:00Z',
  '2026-09-01T12:00:00Z'
);

select is(
  (
    select merchant
    from public.create_claim_from_analysis_draft(
      '33333333-3333-4333-8333-333333333333',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1250000, 'Confirmed Shop', '2026-08-31', 'printing', 'Team printing',
      '2026-09-01T12:05:00Z'
    )
  ),
  'Confirmed Shop',
  'valid draft creates a claim from confirmed fields'
);
select isnt(
  (select consumed_at from public.receipt_analysis_drafts where id = '33333333-3333-4333-8333-333333333333'),
  null,
  'claim creation consumes the draft'
);
select is(
  (select receipt_analysis->>'merchant' from public.claims where receipt_sha256 = repeat('e', 64)),
  'Extracted Shop',
  'claim preserves the original extraction'
);
select is(
  (select submitter_wallet from public.claims where receipt_sha256 = repeat('e', 64)),
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'claim identity comes from the authenticated draft owner'
);
select is(
  pg_temp.capture_sqlstate($sql$
    select * from public.create_claim_from_analysis_draft(
      '33333333-3333-4333-8333-333333333333',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1250000, 'Confirmed Shop', '2026-08-31', 'printing', 'Team printing',
      '2026-09-01T12:06:00Z'
    )
  $sql$),
  'PT409',
  'a consumed draft cannot create another claim'
);

insert into public.receipt_analysis_drafts (
  id, event_id, wallet_address, receipt_object_path, receipt_sha256, analysis, expires_at, created_at
) values (
  '34444444-4444-4444-8444-444444444444',
  '31111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'wallet-auth/expired.png', repeat('f', 64),
  jsonb_build_object('merchant', 'Old', 'amount', '1', 'currency', 'USDC', 'receiptDate', '2026-08-31', 'category', 'printing', 'confidence', 1, 'uncertainFields', jsonb_build_array(), 'warnings', jsonb_build_array(), 'receiptHash', repeat('f', 64), 'fuzzyKey', 'old|2026-08-31|1'),
  '2026-09-01T12:00:00Z',
  '2026-09-01T11:45:00Z'
);

select is(
  pg_temp.capture_sqlstate($sql$
    select * from public.create_claim_from_analysis_draft(
      '34444444-4444-4444-8444-444444444444',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1, 'Old', '2026-08-31', 'printing', '', '2026-09-01T12:01:00Z'
    )
  $sql$),
  'PT410',
  'expired drafts fail closed'
);
select is(
  pg_temp.capture_sqlstate($sql$
    select * from public.create_claim_from_analysis_draft(
      '34444444-4444-4444-8444-444444444444',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      1, 'Old', '2026-08-31', 'printing', '', '2026-09-01T11:59:00Z'
    )
  $sql$),
  'PT409',
  'draft ownership cannot be changed by the caller'
);

insert into public.receipt_analysis_drafts (
  id, event_id, wallet_address, receipt_object_path, receipt_sha256, analysis, expires_at, created_at
) values (
  '35555555-5555-4555-8555-555555555555',
  '31111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'wallet-auth/rollback.png', repeat('9', 64),
  jsonb_build_object('merchant', 'Rollback', 'amount', '1', 'currency', 'USDC', 'receiptDate', '2026-08-31', 'category', 'printing', 'confidence', 1, 'uncertainFields', jsonb_build_array(), 'warnings', jsonb_build_array(), 'receiptHash', repeat('9', 64), 'fuzzyKey', 'rollback|2026-08-31|1'),
  '2026-09-01T12:15:00Z',
  '2026-09-01T12:00:00Z'
);
select is(
  pg_temp.capture_sqlstate($sql$
    select * from public.create_claim_from_analysis_draft(
      '35555555-5555-4555-8555-555555555555',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1, 'Rollback', '2026-08-31', 'not-a-category', '', '2026-09-01T12:01:00Z'
    )
  $sql$),
  '23514',
  'claim constraint failure aborts the atomic consume function'
);
select is(
  (select consumed_at from public.receipt_analysis_drafts where id = '35555555-5555-4555-8555-555555555555'),
  null,
  'failed claim insertion rolls back draft consumption'
);
select is(
  (select count(*)::bigint from public.claims where receipt_sha256 = repeat('9', 64)),
  0::bigint,
  'failed claim insertion leaves no partial claim'
);
select ok(
  not has_function_privilege('anon', 'public.create_wallet_session_from_challenge(uuid,text,text,timestamptz,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_claim_from_analysis_draft(uuid,text,numeric,text,date,text,text,timestamptz)', 'execute'),
  'browser roles cannot execute privileged auth functions'
);

select * from finish();
rollback;
