-- Payroll runs, so a run survives a restart and the history screen has
-- something to read. Until this is applied the app keeps runs in memory and
-- says so on screen.
--
-- A run is recorded as pending before anything is signed, then moved to paid
-- or failed. The constraints below encode the two rules that matter: a paid
-- run must name the transaction that paid it, and a pending run cannot claim
-- either outcome.

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  employee_wallet text not null,
  gross numeric not null,
  net numeric not null,
  employer_cost numeric not null,
  breakdown jsonb not null,
  status text not null default 'pending',
  digest text,
  abort_code integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_runs_employee_wallet_valid check (
    employee_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  constraint payroll_runs_status_valid check (
    status in ('pending', 'paid', 'failed')
  ),
  constraint payroll_runs_amounts_positive_integer check (
    gross > 0 and gross = trunc(gross)
    and net > 0 and net = trunc(net)
    and employer_cost > 0 and employer_cost = trunc(employer_cost)
  ),
  constraint payroll_runs_breakdown_object check (
    jsonb_typeof(breakdown) = 'object'
  ),
  -- A paid run without a digest is unverifiable, and the demo rests on being
  -- able to open the transaction that paid.
  constraint payroll_runs_paid_has_digest check (
    status <> 'paid' or (digest is not null and char_length(digest) between 1 and 128)
  ),
  constraint payroll_runs_pending_is_undecided check (
    status <> 'pending' or (digest is null and abort_code is null)
  ),
  constraint payroll_runs_abort_code_valid check (
    abort_code is null or (abort_code >= 0 and abort_code < 1000)
  )
);

create index payroll_runs_created_at_idx on public.payroll_runs (created_at desc);

create trigger payroll_runs_set_updated_at
  before update on public.payroll_runs
  for each row
  execute function public.set_updated_at();

alter table public.payroll_runs enable row level security;
