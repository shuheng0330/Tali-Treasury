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

select has_table('public', 'payroll_configurations', 'payroll configuration registry exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payroll_configurations'::regclass),
  'payroll configuration RLS is enabled'
);
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'payroll_configurations'),
  0::bigint,
  'registry exposes no browser policies'
);
select ok(
  not has_table_privilege('anon', 'public.payroll_configurations', 'select')
  and not has_table_privilege('authenticated', 'public.payroll_configurations', 'select'),
  'browser roles cannot read payroll configurations'
);
select ok(
  has_table_privilege('service_role', 'public.payroll_configurations', 'select,insert')
  and not has_table_privilege('service_role', 'public.payroll_configurations', 'update,delete'),
  'service role can append and read but cannot mutate registrations'
);

insert into public.payroll_configurations (
  creation_digest, package_id, coin_type, mandate_id, cap_id,
  employer_wallet, cap_owner_wallet, approved_employees, statutory_terms,
  net_min_bps, initial_budget, max_per_run, expiry_ms
) values (
  repeat('4', 44), '0x' || repeat('1', 64),
  '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC',
  '0x' || repeat('3', 64), '0x' || repeat('4', 64), '0x' || repeat('5', 64),
  '0x' || repeat('6', 64), jsonb_build_array('0x' || repeat('7', 64)),
  jsonb_build_array(
    jsonb_build_object('recipient', '0x' || repeat('8', 64), 'minBps', '2300', 'wageCap', '0'),
    jsonb_build_object('recipient', '0x' || repeat('9', 64), 'minBps', '225', 'wageCap', '6000000000'),
    jsonb_build_object('recipient', '0x' || repeat('a', 64), 'minBps', '40', 'wageCap', '6000000000')
  ),
  '7000', '100000000000', '10000000000', '4102444800000'
);

select is(
  (select count(*)::bigint from public.payroll_configurations where creation_digest = repeat('4', 44)),
  1::bigint,
  'valid snapshot is stored'
);

insert into public.payroll_configurations (
  creation_digest, package_id, coin_type, mandate_id, cap_id,
  employer_wallet, cap_owner_wallet, approved_employees, statutory_terms,
  net_min_bps, initial_budget, max_per_run, expiry_ms
) select
  repeat('5', 44), package_id, coin_type, '0x' || repeat('b', 64), '0x' || repeat('c', 64),
  employer_wallet, cap_owner_wallet, approved_employees, statutory_terms,
  net_min_bps, initial_budget, max_per_run, expiry_ms
from public.payroll_configurations
where creation_digest = repeat('4', 44);

select is(
  (select count(*)::bigint from public.payroll_configurations where employer_wallet = '0x' || repeat('5', 64)),
  2::bigint,
  'one employer may register multiple mandates'
);

select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.payroll_configurations select * from public.payroll_configurations limit 1
  $sql$),
  '23505',
  'creation digest cannot be registered twice'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.payroll_configurations (
      creation_digest, package_id, coin_type, mandate_id, cap_id, employer_wallet,
      cap_owner_wallet, approved_employees, statutory_terms, net_min_bps,
      initial_budget, max_per_run, expiry_ms
    ) select repeat('6', 44), package_id, coin_type, mandate_id, '0x' || repeat('d', 64),
      employer_wallet, cap_owner_wallet, approved_employees, statutory_terms,
      net_min_bps, initial_budget, max_per_run, expiry_ms
    from public.payroll_configurations limit 1
  $sql$),
  '23505',
  'mandate id cannot be claimed by another registration'
);
select is(
  pg_temp.capture_sqlstate($sql$
    insert into public.payroll_configurations (
      creation_digest, package_id, coin_type, mandate_id, cap_id, employer_wallet,
      cap_owner_wallet, approved_employees, statutory_terms, net_min_bps,
      initial_budget, max_per_run, expiry_ms
    ) select repeat('7', 44), package_id, coin_type, '0x' || repeat('e', 64), cap_id,
      employer_wallet, cap_owner_wallet, approved_employees, statutory_terms,
      net_min_bps, initial_budget, max_per_run, expiry_ms
    from public.payroll_configurations limit 1
  $sql$),
  '23505',
  'cap id cannot be claimed by another registration'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.payroll_configurations set employer_wallet = '0x1234' where creation_digest = repeat('4', 44)
  $sql$),
  '23514',
  'wallet addresses must remain canonical'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.payroll_configurations set creation_digest = 'not-base58' where creation_digest = repeat('4', 44)
  $sql$),
  '23514',
  'creation digest must be canonical base58'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.payroll_configurations set approved_employees = '[]'::jsonb where creation_digest = repeat('4', 44)
  $sql$),
  '23514',
  'snapshot contains exactly one employee'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.payroll_configurations set statutory_terms = '[]'::jsonb where creation_digest = repeat('4', 44)
  $sql$),
  '23514',
  'snapshot contains exactly three statutory terms'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.payroll_configurations set initial_budget = '0' where creation_digest = repeat('4', 44)
  $sql$),
  '23514',
  'initial budget must be positive'
);
select is(
  pg_temp.capture_sqlstate($sql$
    update public.payroll_configurations set max_per_run = '100000000001' where creation_digest = repeat('4', 44)
  $sql$),
  '23514',
  'maximum per run cannot exceed initial budget'
);

select * from finish();
rollback;
