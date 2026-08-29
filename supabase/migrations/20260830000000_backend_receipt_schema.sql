create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organisation text not null,
  mandate_object_id text not null,
  treasurer_wallet text not null,
  allowed_categories text[] not null,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_name_valid check (
    name = btrim(name) and char_length(name) between 1 and 120
  ),
  constraint events_organisation_valid check (
    organisation = btrim(organisation)
    and char_length(organisation) between 1 and 160
  ),
  constraint events_mandate_object_id_valid check (
    mandate_object_id ~ '^0x[0-9a-f]{64}$'
  ),
  constraint events_treasurer_wallet_valid check (
    treasurer_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  constraint events_allowed_categories_valid check (
    cardinality(allowed_categories) between 1 and 6
    and array_position(allowed_categories, null) is null
    and allowed_categories <@ array[
      'food', 'printing', 'transport', 'venue', 'materials', 'other'
    ]::text[]
  ),
  constraint events_dates_valid check (expires_at > starts_at)
);

create table public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  wallet_address text not null,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id, wallet_address),
  unique (event_id, wallet_address, active),
  constraint event_members_wallet_valid check (
    wallet_address ~ '^0x[0-9a-f]{64}$'
  ),
  constraint event_members_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 120
  )
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  submitter_wallet text not null,
  submitter_active boolean not null default true,
  receipt_object_path text not null,
  receipt_sha256 text not null,
  fuzzy_key text not null,
  state text not null default 'submitted',
  amount numeric not null,
  merchant text not null,
  currency text,
  receipt_date date not null,
  category text not null,
  description text not null default '',
  receipt_analysis jsonb not null,
  decision jsonb,
  payment jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claims_active_member_fk
    foreign key (event_id, submitter_wallet, submitter_active)
    references public.event_members(event_id, wallet_address, active),
  constraint claims_submitter_active check (submitter_active),
  constraint claims_receipt_object_path_unique unique (receipt_object_path),
  constraint claims_event_receipt_hash_unique unique (event_id, receipt_sha256),
  constraint claims_receipt_object_path_valid check (
    receipt_object_path = btrim(receipt_object_path)
    and char_length(receipt_object_path) between 1 and 1024
  ),
  constraint claims_receipt_sha256_valid check (
    receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint claims_fuzzy_key_valid check (
    fuzzy_key = btrim(fuzzy_key) and char_length(fuzzy_key) between 1 and 512
  ),
  constraint claims_state_valid check (
    state in (
      'draft', 'analysing', 'needs_correction', 'submitted',
      'awaiting_review', 'approved', 'paying', 'paid', 'rejected',
      'payment_failed'
    )
  ),
  constraint claims_amount_positive_integer check (
    amount > 0
    and amount < 1000000000000000000000000000000
    and amount = trunc(amount)
  ),
  constraint claims_merchant_valid check (
    merchant = btrim(merchant) and char_length(merchant) between 1 and 200
  ),
  constraint claims_currency_valid check (
    currency is null or currency ~ '^[A-Z]{3}$'
  ),
  constraint claims_category_valid check (
    category in ('food', 'printing', 'transport', 'venue', 'materials', 'other')
  ),
  constraint claims_description_valid check (
    description = btrim(description) and char_length(description) <= 500
  ),
  constraint claims_receipt_analysis_object check (
    jsonb_typeof(receipt_analysis) = 'object'
  ),
  constraint claims_receipt_analysis_hash_matches check (
    receipt_analysis ->> 'receiptHash' = receipt_sha256
  ),
  constraint claims_decision_object check (
    decision is null or jsonb_typeof(decision) = 'object'
  ),
  constraint claims_payment_object check (
    payment is null or jsonb_typeof(payment) = 'object'
  )
);

create index claims_event_created_at_idx
  on public.claims (event_id, created_at desc, id desc);

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger claims_set_updated_at
before update on public.claims
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.claims enable row level security;

revoke all on public.events, public.event_members, public.claims
  from anon, authenticated;
grant select, insert, update, delete
  on public.events, public.event_members, public.claims
  to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
