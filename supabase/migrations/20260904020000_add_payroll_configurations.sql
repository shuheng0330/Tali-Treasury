-- A payroll configuration is accepted only after the server has independently
-- verified its finalized Sui transaction. Unique digest and object IDs make a
-- retry recoverable without ever creating or funding a second mandate.

create table public.payroll_configurations (
  id uuid primary key default gen_random_uuid(),
  setup_digest text not null unique,
  setup_checkpoint numeric not null,
  package_id text not null,
  coin_type text not null,
  mandate_object_id text not null unique,
  payroll_cap_object_id text not null unique,
  employer_wallet text not null,
  employee_wallet text not null,
  cap_recipient_wallet text not null,
  budget_usdc numeric not null,
  max_per_run_usdc numeric not null,
  expiry_ms numeric not null,
  created_at timestamptz not null default now(),
  constraint payroll_configuration_digest_valid check (
    setup_digest ~ '^[1-9A-HJ-NP-Za-km-z]{32,128}$'
  ),
  constraint payroll_configuration_checkpoint_valid check (
    setup_checkpoint >= 0 and setup_checkpoint = trunc(setup_checkpoint)
  ),
  constraint payroll_configuration_addresses_valid check (
    package_id ~ '^0x[0-9a-f]{64}$'
    and mandate_object_id ~ '^0x[0-9a-f]{64}$'
    and payroll_cap_object_id ~ '^0x[0-9a-f]{64}$'
    and employer_wallet ~ '^0x[0-9a-f]{64}$'
    and employee_wallet ~ '^0x[0-9a-f]{64}$'
    and cap_recipient_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  constraint payroll_configuration_coin_type_valid check (
    coin_type ~ '^0x[0-9a-f]{64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$'
  ),
  constraint payroll_configuration_amounts_valid check (
    budget_usdc > 0 and budget_usdc = trunc(budget_usdc)
    and max_per_run_usdc > 0 and max_per_run_usdc = trunc(max_per_run_usdc)
    and max_per_run_usdc <= budget_usdc
    and expiry_ms > 0 and expiry_ms = trunc(expiry_ms)
  )
);

alter table public.payroll_configurations enable row level security;
