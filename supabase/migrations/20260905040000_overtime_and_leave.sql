-- Overtime claims and leave requests, so an employee's claim survives a
-- restart and the employer's queue has something to read. Until this is
-- applied the app keeps both in memory and says so on screen.
--
-- Amounts and hours are text with a regex, the way the payroll registry holds
-- its figures: PostgREST renders a numeric column as a JSON number, and a
-- month of somebody's overtime is not something to hand to binary floating
-- point on the way out of the database.
--
-- The wage each row was computed against is stored on the row. Overtime pay
-- is the monthly wage over 26, over 8, times the statutory multiple, so a
-- wage that changes in November would otherwise silently restate what
-- October's approved claim was worth.

create table public.overtime_claims (
  id uuid primary key default gen_random_uuid(),
  payroll_mandate_id text
    references public.payroll_configurations(mandate_id) on delete restrict,
  employee_wallet text not null,
  worked_on date not null,
  kind text not null,
  hours text not null,
  reason text not null,
  status text not null default 'submitted',
  monthly_wage text not null,
  pay text not null,
  decision_reason text,
  decided_at timestamptz,
  payroll_run_id uuid references public.payroll_runs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overtime_claims_employee_wallet_valid check (
    employee_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  -- Employment Act 1955: 1.5x on a working day, 2x on a rest day, 3x on a
  -- public holiday. The multiple lives in the application; the kind is what
  -- the row has to be able to say.
  constraint overtime_claims_kind_valid check (
    kind in ('normal_day', 'rest_day', 'public_holiday')
  ),
  constraint overtime_claims_status_valid check (
    status in ('submitted', 'approved', 'rejected', 'paid')
  ),
  -- A day holds 24 hours and 8 of them are the normal working day.
  constraint overtime_claims_hours_valid check (
    hours ~ '^[0-9]{1,2}(\.[0-9]{1,2})?$'
    and hours::numeric > 0
    and hours::numeric <= 16
  ),
  constraint overtime_claims_amounts_valid check (
    monthly_wage ~ '^[1-9][0-9]*$' and pay ~ '^[1-9][0-9]*$'
  ),
  constraint overtime_claims_reason_valid check (
    reason = btrim(reason) and char_length(reason) between 1 and 500
  ),
  constraint overtime_claims_decision_reason_valid check (
    decision_reason is null or (
      decision_reason = btrim(decision_reason)
      and char_length(decision_reason) between 1 and 500
    )
  ),
  -- Rejected is a human saying no, so it has to say why. Approved does not.
  constraint overtime_claims_lifecycle_valid check (
    case status
      when 'submitted' then
        decided_at is null and decision_reason is null and payroll_run_id is null
      when 'rejected' then
        decided_at is not null and decision_reason is not null and payroll_run_id is null
      when 'approved' then
        decided_at is not null and payroll_run_id is null
      else
        decided_at is not null and payroll_run_id is not null
    end
    and (decided_at is null or decided_at >= created_at)
  )
);

comment on table public.overtime_claims is
  'Overtime an employee claims and the employer decides. Approved claims raise the wage of the next payroll run.';
comment on column public.overtime_claims.monthly_wage is
  'The wage of record the pay was computed against, captured at submission, in MYR base units.';
comment on column public.overtime_claims.pay is
  'What this claim adds to gross, in MYR base units. Computed by the server, never sent by the client.';
comment on column public.overtime_claims.payroll_run_id is
  'The run that paid this claim. Set only once the status is paid.';

create index overtime_claims_employee_worked_on_idx
  on public.overtime_claims (employee_wallet, worked_on desc);
create index overtime_claims_status_created_at_idx
  on public.overtime_claims (status, created_at desc);

-- One day, one live claim. A rejected claim is not a claim, so a corrected
-- resubmission for the same day is still allowed.
create unique index overtime_claims_one_live_day_idx
  on public.overtime_claims (employee_wallet, worked_on)
  where status <> 'rejected';

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_wallet text not null,
  start_on date not null,
  end_on date not null,
  days text not null,
  kind text not null,
  reason text not null,
  status text not null default 'submitted',
  monthly_wage text not null,
  deduction text not null default '0',
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_employee_wallet_valid check (
    employee_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  constraint leave_requests_range_valid check (
    end_on >= start_on and end_on - start_on <= 365
  ),
  constraint leave_requests_days_valid check (
    days ~ '^[0-9]{1,3}(\.[0-9]{1,2})?$'
    and days::numeric > 0
    and days::numeric <= (end_on - start_on) + 1
  ),
  constraint leave_requests_kind_valid check (
    kind in ('annual', 'sick', 'unpaid')
  ),
  constraint leave_requests_status_valid check (
    status in ('submitted', 'approved', 'rejected')
  ),
  constraint leave_requests_amounts_valid check (
    monthly_wage ~ '^[1-9][0-9]*$' and deduction ~ '^(0|[1-9][0-9]*)$'
  ),
  -- Paid leave is ordinary wages. Only unpaid leave comes off the base, and
  -- it comes off the base of all three statutory bodies alike.
  constraint leave_requests_deduction_matches_kind check (
    kind = 'unpaid' or deduction = '0'
  ),
  constraint leave_requests_reason_valid check (
    reason = btrim(reason) and char_length(reason) between 1 and 500
  ),
  constraint leave_requests_decision_reason_valid check (
    decision_reason is null or (
      decision_reason = btrim(decision_reason)
      and char_length(decision_reason) between 1 and 500
    )
  ),
  constraint leave_requests_lifecycle_valid check (
    case status
      when 'submitted' then decided_at is null and decision_reason is null
      when 'rejected' then decided_at is not null and decision_reason is not null
      else decided_at is not null
    end
    and (decided_at is null or decided_at >= created_at)
  )
);

comment on table public.leave_requests is
  'Leave an employee requests and the employer decides. Approved unpaid leave reduces the wage of the next payroll run.';
comment on column public.leave_requests.deduction is
  'What approving this takes off gross, in MYR base units. Zero for annual and sick leave.';

create index leave_requests_employee_start_on_idx
  on public.leave_requests (employee_wallet, start_on desc);
create index leave_requests_status_created_at_idx
  on public.leave_requests (status, created_at desc);

create trigger overtime_claims_set_updated_at
  before update on public.overtime_claims
  for each row
  execute function public.set_updated_at();

create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row
  execute function public.set_updated_at();

alter table public.overtime_claims enable row level security;
alter table public.leave_requests enable row level security;

revoke all on public.overtime_claims from public, anon, authenticated, service_role;
revoke all on public.leave_requests from public, anon, authenticated, service_role;

grant select, insert, update on public.overtime_claims to service_role;
grant select, insert, update on public.leave_requests to service_role;
