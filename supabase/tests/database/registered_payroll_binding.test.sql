begin;

select plan(4);

select has_column('public', 'payroll_runs', 'payroll_mandate_id', 'runs store their selected registered mandate');
select col_is_null('public', 'payroll_runs', 'payroll_mandate_id', 'legacy payroll runs may remain unscoped');
select fk_ok(
  'public', 'payroll_runs', 'payroll_mandate_id',
  'public', 'payroll_configurations', 'mandate_id',
  'run mandate references the immutable registry'
);
select has_index('public', 'payroll_runs', 'payroll_runs_mandate_created_at_idx', 'mandate history index exists');

select * from finish();
rollback;
