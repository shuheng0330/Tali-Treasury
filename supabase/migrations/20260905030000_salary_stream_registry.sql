create table public.salary_streams (
  stream_id text primary key,
  payroll_mandate_id text not null unique
    references public.payroll_configurations(mandate_id) on delete restrict,
  creation_digest text not null unique,
  employee_wallet text not null,
  total_amount text not null,
  started_at_ms bigint not null,
  ends_at_ms bigint not null,
  created_at timestamptz not null default now(),
  constraint salary_streams_addresses_valid check (
    stream_id ~ '^0x[0-9a-f]{64}$'
    and payroll_mandate_id ~ '^0x[0-9a-f]{64}$'
    and employee_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  constraint salary_streams_digest_valid check (
    creation_digest ~ '^[1-9A-HJ-NP-Za-km-z]{32,64}$'
  ),
  constraint salary_streams_amount_valid check (
    total_amount ~ '^[1-9][0-9]*$'
  ),
  constraint salary_streams_period_valid check (
    started_at_ms > 0 and ends_at_ms > started_at_ms
  )
);

create index salary_streams_employee_created_at_idx
  on public.salary_streams (employee_wallet, created_at desc);

alter table public.salary_streams enable row level security;
revoke all on public.salary_streams from public, anon, authenticated, service_role;
grant select, insert on public.salary_streams to service_role;

comment on table public.salary_streams is
  'Append-only links verified Sui SalaryStream objects to registered payroll mandates.';
