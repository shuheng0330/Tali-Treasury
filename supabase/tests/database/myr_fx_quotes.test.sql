begin;
select no_plan();
create function pg_temp.fx_sqlstate(statement text) returns text language plpgsql as $$
begin execute statement; return null; exception when others then return sqlstate; end; $$;

select has_column('public', 'claims', 'fx_quote', 'claim stores its exact quote');
select ok(not has_function_privilege('anon', 'public.read_myr_rate()', 'execute'), 'anonymous users cannot read rate cache RPC');
select ok(not has_function_privilege('authenticated', 'public.acquire_myr_rate_refresh(uuid)', 'execute'), 'browser cannot spend provider quota');
select ok(not has_table_privilege('service_role', 'public.claim_fx_quote_history', 'update'), 'quote history is append-only to the application');

update public.myr_rate_cache set rate = null, lease_token = null, lease_until = '-infinity', next_refresh_at = '-infinity';
select ok(public.acquire_myr_rate_refresh('11111111-1111-4111-8111-111111111111'), 'first instance acquires cache refresh');
select ok(not public.acquire_myr_rate_refresh('22222222-2222-4222-8222-222222222222'), 'second instance cannot also fetch rates');
select ok(not public.save_myr_rate('22222222-2222-4222-8222-222222222222', '{}'::jsonb), 'non-owner cannot publish cache');
select ok(public.save_myr_rate('11111111-1111-4111-8111-111111111111', '{"myrPerUsd":"4"}'::jsonb), 'owner publishes cache');
select is(public.read_myr_rate()->>'myrPerUsd', '4', 'shared cache returns stored rate');
select ok(not public.acquire_myr_rate_refresh('22222222-2222-4222-8222-222222222222'), 'successful fetch throttled for one hour');

insert into public.events(id, name, organisation, mandate_object_id, treasurer_wallet, allowed_categories, starts_at, expires_at)
values ('51111111-1111-4111-8111-111111111111', 'FX Test', 'Tali', '0x' || repeat('1',64), '0x' || repeat('b',64),
  array['printing'], now() - interval '1 day', now() + interval '1 day');
insert into public.event_members(event_id, wallet_address, display_name)
values ('51111111-1111-4111-8111-111111111111', '0x' || repeat('a',64), 'FX test member');
insert into public.claims(id, event_id, submitter_wallet, receipt_object_path, receipt_sha256, fuzzy_key,
  state, amount, merchant, currency, receipt_date, category, description, receipt_analysis)
values ('52222222-2222-4222-8222-222222222222', '51111111-1111-4111-8111-111111111111', '0x' || repeat('a',64),
  'fx-test/receipt.png', repeat('a',64), 'fx-test', 'submitted', 17250000, 'FX test', 'MYR', current_date,
  'printing', '', jsonb_build_object('currency', 'MYR', 'receiptHash', repeat('a',64)));

create temp table fx_test_quote as select jsonb_build_object(
  'id', '53333333-3333-4333-8333-333333333333',
  'claimId', '52222222-2222-4222-8222-222222222222', 'eventId', '51111111-1111-4111-8111-111111111111',
  'recipient', '0x' || repeat('a',64), 'mandateId', '0x' || repeat('1',64), 'provider', 'open_exchange_rates',
  'sourceCurrency', 'MYR', 'targetCurrency', 'USDC', 'sourceAmount', '17250000', 'targetAmount', '4312500',
  'myrPerUsd', '4', 'rateTimestampMs', floor(extract(epoch from now()) * 1000),
  'fetchedAtMs', floor(extract(epoch from now()) * 1000), 'createdAtMs', floor(extract(epoch from now()) * 1000),
  'expiresAtMs', floor(extract(epoch from now()) * 1000) + 900000,
  'valuation', 'USDC_USD_PARITY', 'rounding', 'HALF_UP_6DP') as q;

select is(pg_temp.fx_sqlstate($sql$
  update public.claims set state = 'approved' where id = '52222222-2222-4222-8222-222222222222'
$sql$), '23514', 'unquoted MYR cannot enter payment');
select is(pg_temp.fx_sqlstate($sql$
  update public.claims set fx_quote = (select q || '{"targetAmount":"5000000"}'::jsonb from fx_test_quote)
  where id = '52222222-2222-4222-8222-222222222222'
$sql$), '23514', 'quote cannot invent the payout amount');
select is(pg_temp.fx_sqlstate($sql$
  update public.claims set fx_quote = (select q || '{"targetAmount":null}'::jsonb from fx_test_quote)
  where id = '52222222-2222-4222-8222-222222222222'
$sql$), '23514', 'JSON null cannot bypass quote checks');
select is(pg_temp.fx_sqlstate($sql$
  update public.claims set fx_quote = (select q || jsonb_build_object('expiresAtMs', 1) from fx_test_quote)
  where id = '52222222-2222-4222-8222-222222222222'
$sql$), '23514', 'cannot save expired quotes');

update public.claims set fx_quote = (select q from fx_test_quote) where id = '52222222-2222-4222-8222-222222222222';
select is((select amount from public.claims where id = '52222222-2222-4222-8222-222222222222'), 17250000::numeric, 'original MYR preserved');
select is((select count(*) from public.claim_fx_quote_history where claim_id = '52222222-2222-4222-8222-222222222222'), 1::bigint, 'quote snapshot audited');
select is(pg_temp.fx_sqlstate($sql$
  update public.claims set amount = 1000000 where id = '52222222-2222-4222-8222-222222222222'
$sql$), '23514', 'quoted source amount cannot change');

update public.claims set state = 'awaiting_review', decision = '{"outcome":"review"}'::jsonb
where id = '52222222-2222-4222-8222-222222222222';
update public.claims set state = 'paying', review_action = 'approve', reviewer_wallet = '0x' || repeat('b',64), reviewed_at = now()
where id = '52222222-2222-4222-8222-222222222222' and fx_quote->>'id' = '54444444-4444-4444-8444-444444444444';
select is((select state from public.claims where id = '52222222-2222-4222-8222-222222222222'), 'awaiting_review', 'stale quote comparison prevents approval');
update public.claims set state = 'paying', review_action = 'approve', reviewer_wallet = '0x' || repeat('b',64), reviewed_at = now()
where id = '52222222-2222-4222-8222-222222222222' and fx_quote->>'id' = '53333333-3333-4333-8333-333333333333';
select is((select state from public.claims where id = '52222222-2222-4222-8222-222222222222'), 'paying', 'matching quote can enter approved payment');
select is(pg_temp.fx_sqlstate($sql$
  update public.claims set fx_quote = null where id = '52222222-2222-4222-8222-222222222222'
$sql$), '23514', 'payment quote is immutable');
select * from finish();
rollback;
