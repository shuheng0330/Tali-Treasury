begin;

select plan(11);

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

select has_column('public', 'claims', 'payment_attempt_digest', 'claims stores the prepared digest');
select has_column('public', 'claims', 'payment_attempt_budget_before', 'claims stores the pre-submission budget');
select has_column('public', 'claims', 'payment_attempt_prepared_at', 'claims stores the preparation time');
select has_column('public', 'claims', 'payment_attempt_last_checked_at', 'claims stores the last reconciliation check');

insert into public.events (
  id, name, organisation, mandate_object_id, treasurer_wallet,
  allowed_categories, starts_at, expires_at
) values (
  '41111111-1111-4111-8111-111111111111', 'Reconciliation Test', 'Tali',
  '0x1111111111111111111111111111111111111111111111111111111111111111',
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  array['printing'], '2026-08-30T00:00:00Z', '2026-09-05T00:00:00Z'
);

insert into public.event_members (event_id, wallet_address, display_name)
values (
  '41111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Lim Wey Cheng'
);

insert into public.claims (
  id, event_id, submitter_wallet, receipt_object_path, receipt_sha256,
  fuzzy_key, state, amount, merchant, currency, receipt_date, category,
  description, receipt_analysis, decision
) values (
  '42222222-2222-4222-8222-222222222222',
  '41111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'reconciliation/receipt.png', repeat('a', 64), 'shop|2026-09-01|1000000',
  'paying', 1000000, 'Shop', 'USDC', '2026-09-01', 'printing', '',
  jsonb_build_object('receiptHash', repeat('a', 64), 'currency', 'USDC'),
  jsonb_build_object('outcome', 'auto_pay')
);

select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims
    set payment_attempt_digest = 'not-a-sui-digest',
        payment_attempt_budget_before = 20000000,
        payment_attempt_prepared_at = '2026-09-02T12:00:00Z'
    where id = '42222222-2222-4222-8222-222222222222'
  $sql$),
  '23514',
  'payment attempt digest must be canonical base58'
);

select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims
    set payment_attempt_digest = repeat('4', 44)
    where id = '42222222-2222-4222-8222-222222222222'
  $sql$),
  '23514',
  'digest and prepared timestamp must be stored together'
);

update public.claims
set payment_attempt_digest = repeat('4', 44),
    payment_attempt_budget_before = 20000000,
    payment_attempt_prepared_at = '2026-09-02T12:00:00Z'
where id = '42222222-2222-4222-8222-222222222222';

select is(
  (select payment_attempt_digest from public.claims where id = '42222222-2222-4222-8222-222222222222'),
  repeat('4', 44),
  'a paying claim stores one prepared transaction digest'
);

select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims
    set payment_attempt_last_checked_at = '2026-09-02T11:59:59Z'
    where id = '42222222-2222-4222-8222-222222222222'
  $sql$),
  '23514',
  'last check cannot precede transaction preparation'
);

update public.claims
set payment_attempt_last_checked_at = '2026-09-02T12:00:03Z'
where id = '42222222-2222-4222-8222-222222222222';

select is(
  (select payment_attempt_last_checked_at from public.claims where id = '42222222-2222-4222-8222-222222222222'),
  '2026-09-02T12:00:03Z'::timestamptz,
  'reconciliation records the last check time'
);

insert into public.claims (
  id, event_id, submitter_wallet, receipt_object_path, receipt_sha256,
  fuzzy_key, state, amount, merchant, currency, receipt_date, category,
  description, receipt_analysis, decision
) values (
  '43333333-3333-4333-8333-333333333333',
  '41111111-1111-4111-8111-111111111111',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'reconciliation/second.png', repeat('b', 64), 'second|2026-09-01|1000000',
  'paying', 1000000, 'Second', 'USDC', '2026-09-01', 'printing', '',
  jsonb_build_object('receiptHash', repeat('b', 64), 'currency', 'USDC'),
  jsonb_build_object('outcome', 'auto_pay')
);

select is(
  pg_temp.capture_sqlstate($sql$
    update public.claims
    set payment_attempt_digest = repeat('4', 44),
        payment_attempt_budget_before = 20000000,
        payment_attempt_prepared_at = '2026-09-02T12:00:00Z'
    where id = '43333333-3333-4333-8333-333333333333'
  $sql$),
  '23505',
  'one Sui digest cannot be attached to two claims'
);

select ok(
  has_table_privilege('service_role', 'public.claims', 'select,update'),
  'service role can persist and reconcile payment attempts'
);

select * from finish();
rollback;
