-- Immutable, verified snapshots of payroll mandates created and funded on Sui
-- Testnet. The browser never writes this registry; the service role inserts a
-- row only after independently reading the finalized transaction and objects.

create table public.payroll_configurations (
  id uuid primary key default gen_random_uuid(),
  creation_digest text not null unique,
  package_id text not null,
  coin_type text not null,
  mandate_id text not null unique,
  cap_id text not null unique,
  employer_wallet text not null,
  cap_owner_wallet text not null,
  approved_employees jsonb not null,
  statutory_terms jsonb not null,
  net_min_bps text not null,
  initial_budget text not null,
  max_per_run text not null,
  expiry_ms text not null,
  registered_at timestamptz not null default now(),
  constraint payroll_configurations_digest_valid check (
    creation_digest ~ '^[1-9A-HJ-NP-Za-km-z]{32,64}$'
  ),
  constraint payroll_configurations_addresses_valid check (
    package_id ~ '^0x[0-9a-f]{64}$'
    and mandate_id ~ '^0x[0-9a-f]{64}$'
    and cap_id ~ '^0x[0-9a-f]{64}$'
    and employer_wallet ~ '^0x[0-9a-f]{64}$'
    and cap_owner_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  constraint payroll_configurations_coin_valid check (
    coin_type = '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC'
  ),
  constraint payroll_configurations_employee_valid check (
    jsonb_typeof(approved_employees) = 'array'
    and jsonb_array_length(approved_employees) = 1
    and approved_employees->>0 ~ '^0x[0-9a-f]{64}$'
  ),
  constraint payroll_configurations_terms_valid check (
    jsonb_typeof(statutory_terms) = 'array'
    and jsonb_array_length(statutory_terms) = 3
    and jsonb_typeof(statutory_terms->0) = 'object'
    and jsonb_typeof(statutory_terms->1) = 'object'
    and jsonb_typeof(statutory_terms->2) = 'object'
    and statutory_terms->0->>'recipient' ~ '^0x[0-9a-f]{64}$'
    and statutory_terms->1->>'recipient' ~ '^0x[0-9a-f]{64}$'
    and statutory_terms->2->>'recipient' ~ '^0x[0-9a-f]{64}$'
    and statutory_terms->0->>'recipient' <> statutory_terms->1->>'recipient'
    and statutory_terms->0->>'recipient' <> statutory_terms->2->>'recipient'
    and statutory_terms->1->>'recipient' <> statutory_terms->2->>'recipient'
    and statutory_terms->0->>'minBps' = '2300'
    and statutory_terms->1->>'minBps' = '225'
    and statutory_terms->2->>'minBps' = '40'
    and statutory_terms->0->>'wageCap' = '0'
    and statutory_terms->1->>'wageCap' ~ '^[1-9][0-9]*$'
    and statutory_terms->2->>'wageCap' = statutory_terms->1->>'wageCap'
  ),
  constraint payroll_configurations_amounts_valid check (
    net_min_bps = '7000'
    and initial_budget ~ '^[1-9][0-9]*$'
    and max_per_run ~ '^[1-9][0-9]*$'
    and max_per_run::numeric <= initial_budget::numeric
    and expiry_ms ~ '^[1-9][0-9]*$'
    and expiry_ms::numeric > extract(epoch from registered_at) * 1000
  )
);

create index payroll_configurations_employer_registered_idx
  on public.payroll_configurations (employer_wallet, registered_at desc);

alter table public.payroll_configurations enable row level security;

revoke all on public.payroll_configurations from public, anon, authenticated, service_role;
grant select, insert on public.payroll_configurations to service_role;
