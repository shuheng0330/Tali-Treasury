begin;

select plan(9);

select has_table('public', 'salary_streams', 'salary stream registry exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.salary_streams'::regclass),
  'salary stream registry RLS is enabled'
);
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'salary_streams'),
  0::bigint,
  'salary stream registry exposes no browser policies'
);
select ok(
  has_table_privilege('service_role', 'public.salary_streams', 'select,insert')
  and not has_table_privilege('service_role', 'public.salary_streams', 'update,delete'),
  'service role can append and read but cannot mutate streams'
);
select fk_ok(
  'public', 'salary_streams', 'payroll_mandate_id',
  'public', 'payroll_configurations', 'mandate_id',
  'streams reference registered payrolls'
);
select has_index('public', 'salary_streams', 'salary_streams_employee_created_at_idx', 'employee lookup index exists');
select col_is_unique('public', 'salary_streams', 'payroll_mandate_id', 'one demo stream is allowed per payroll');
select col_is_unique('public', 'salary_streams', 'creation_digest', 'creation digest cannot be reused');
select col_is_pk('public', 'salary_streams', 'stream_id', 'stream id is the durable identity');

select * from finish();
rollback;
