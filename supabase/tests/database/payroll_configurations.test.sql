begin;

select plan(7);

select has_table('public', 'payroll_configurations', 'verified payroll configurations are durable');
select has_column('public', 'payroll_configurations', 'setup_digest', 'setup digest is stored');
select has_column('public', 'payroll_configurations', 'mandate_object_id', 'mandate ID is stored');

insert into public.payroll_configurations (
  setup_digest, setup_checkpoint, package_id, coin_type, mandate_object_id,
  payroll_cap_object_id, employer_wallet, employee_wallet,
  cap_recipient_wallet, budget_usdc, max_per_run_usdc, expiry_ms
) values (
  repeat('4', 44), 123,
  '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa::usdc::USDC',
  '0x1111111111111111111111111111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222222222222222222222222222',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  12371338, 12371338, 1788281999000
);

select is((select count(*)::integer from public.payroll_configurations), 1, 'verified setup is stored once');

select throws_ok($sql$
  insert into public.payroll_configurations (
    setup_digest, setup_checkpoint, package_id, coin_type, mandate_object_id,
    payroll_cap_object_id, employer_wallet, employee_wallet,
    cap_recipient_wallet, budget_usdc, max_per_run_usdc, expiry_ms
  ) select setup_digest, setup_checkpoint, package_id, coin_type,
    '0x3333333333333333333333333333333333333333333333333333333333333333',
    '0x4444444444444444444444444444444444444444444444444444444444444444',
    employer_wallet, employee_wallet, cap_recipient_wallet,
    budget_usdc, max_per_run_usdc, expiry_ms
  from public.payroll_configurations limit 1
$sql$, '23505', null, 'one finalized digest cannot register two payrolls');

select throws_ok($sql$
  update public.payroll_configurations set max_per_run_usdc = budget_usdc + 1
$sql$, '23514', null, 'run maximum cannot exceed the verified budget');

select ok(
  has_table_privilege('service_role', 'public.payroll_configurations', 'select,insert'),
  'only the server role can persist and reopen a payroll setup'
);

select * from finish();
rollback;
