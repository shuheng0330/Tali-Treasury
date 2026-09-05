alter table public.payroll_runs
  add column payroll_mandate_id text null
  references public.payroll_configurations(mandate_id) on delete restrict;

comment on column public.payroll_runs.payroll_mandate_id is
  'Registered payroll selected for this run. Null only for legacy rows.';

create index payroll_runs_mandate_created_at_idx
  on public.payroll_runs (payroll_mandate_id, created_at desc);
