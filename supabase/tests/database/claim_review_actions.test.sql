begin;

select plan(16);

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

select has_column('public', 'claims', 'review_action', 'claims stores the review action');
select has_column('public', 'claims', 'reviewer_wallet', 'claims stores the reviewer');
select has_column('public', 'claims', 'review_reason', 'claims stores the reason');
select has_column('public', 'claims', 'reviewed_at', 'claims stores the review timestamp');
select has_table('public', 'claim_review_events', 'review audit table exists');
select ok(
  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.claim_review_events')), false),
  'review audit table has RLS enabled'
);
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'claim_review_events'),
  0::bigint,
  'review audit table exposes no browser policies'
);
select ok(
  not has_table_privilege('anon', 'public.claim_review_events', 'select')
  and not has_table_privilege('authenticated', 'public.claim_review_events', 'select'),
  'browser roles cannot read review audit events'
);
select ok(
  has_table_privilege('service_role', 'public.claim_review_events', 'select')
  and not has_table_privilege('service_role', 'public.claim_review_events', 'update,delete'),
  'service role can read but cannot rewrite review audit events'
);

insert into public.events (
  id, name, organisation, mandate_object_id, treasurer_wallet,
  allowed_categories, starts_at, expires_at
) values (
  '11111111-1111-4111-8111-111111111111', 'Review Test', 'Tali',
  '0x1111111111111111111111111111111111111111111111111111111111111111',
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  array['printing'], '2026-08-30T00:00:00Z', '2026-09-03T00:00:00Z'
);

insert into public.event_members (event_id, wallet_address, display_name)
values (
  '11111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Lim Wey Cheng'
);

insert into public.claims (
  id, event_id, submitter_wallet, receipt_object_path, receipt_sha256,
  fuzzy_key, state, amount, merchant, currency, receipt_date, category,
  description, receipt_analysis, decision
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'review-test/receipt.png', repeat('a', 64), 'shop|2026-08-31|1000000',
  'awaiting_review', 1000000, 'Shop', 'USDC', '2026-08-31', 'printing', '',
  jsonb_build_object('receiptHash', repeat('a', 64), 'currency', 'USDC'),
  jsonb_build_object('outcome', 'review')
);

select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims set
      review_action = 'reject',
      reviewer_wallet = '0x1234',
      review_reason = 'Invalid receipt',
      reviewed_at = now(),
      state = 'rejected'
    where id = '22222222-2222-4222-8222-222222222222'
  $sql$),
  '23514',
  'reviewer addresses must be canonical'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims set
      review_action = 'reject',
      reviewer_wallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      review_reason = null,
      reviewed_at = now(),
      state = 'rejected'
    where id = '22222222-2222-4222-8222-222222222222'
  $sql$),
  '23514',
  'reject requires a reason'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims set
      review_action = 'request_correction',
      reviewer_wallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      review_reason = ' padded ',
      reviewed_at = now(),
      state = 'needs_correction'
    where id = '22222222-2222-4222-8222-222222222222'
  $sql$),
  '23514',
  'review reasons must already be trimmed'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims set
      review_action = 'unknown',
      reviewer_wallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      review_reason = null,
      reviewed_at = now()
    where id = '22222222-2222-4222-8222-222222222222'
  $sql$),
  '23514',
  'only contract review actions are accepted'
);

update public.claims set
  review_action = 'request_correction',
  reviewer_wallet = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  review_reason = 'Upload the complete receipt',
  reviewed_at = '2026-09-01T12:00:00Z',
  state = 'needs_correction'
where id = '22222222-2222-4222-8222-222222222222';

select is(
  (select count(*)::bigint from public.claim_review_events where claim_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'review transition creates exactly one audit event'
);
select is(
  (select action || '|' || reviewer_wallet || '|' || reason from public.claim_review_events where claim_id = '22222222-2222-4222-8222-222222222222'),
  'request_correction|0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|Upload the complete receipt',
  'audit event preserves the review metadata'
);

update public.claims
set description = 'idempotent replay did not alter review metadata'
where id = '22222222-2222-4222-8222-222222222222';

select is(
  (select count(*)::bigint from public.claim_review_events where claim_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'later updates do not duplicate the review event'
);

select * from finish();
rollback;
