create table public.wallet_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  message text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wallet_auth_challenges_wallet_valid check (
    wallet_address ~ '^0x[0-9a-f]{64}$'
  ),
  constraint wallet_auth_challenges_message_valid check (
    message = btrim(message) and char_length(message) between 1 and 2000
  ),
  constraint wallet_auth_challenges_lifecycle_valid check (
    expires_at > created_at
    and (consumed_at is null or consumed_at >= created_at)
  )
);

create index wallet_auth_challenges_wallet_created_idx
  on public.wallet_auth_challenges (wallet_address, created_at desc);

create table public.wallet_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  wallet_address text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wallet_sessions_token_hash_valid check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint wallet_sessions_wallet_valid check (
    wallet_address ~ '^0x[0-9a-f]{64}$'
  ),
  constraint wallet_sessions_lifecycle_valid check (
    expires_at > created_at
    and (revoked_at is null or revoked_at >= created_at)
  )
);

create index wallet_sessions_wallet_created_idx
  on public.wallet_sessions (wallet_address, created_at desc);

create table public.receipt_analysis_drafts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  wallet_address text not null,
  receipt_object_path text not null,
  receipt_sha256 text not null,
  analysis jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  claim_id uuid unique references public.claims(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint receipt_analysis_drafts_wallet_valid check (
    wallet_address ~ '^0x[0-9a-f]{64}$'
  ),
  constraint receipt_analysis_drafts_path_valid check (
    receipt_object_path = btrim(receipt_object_path)
    and char_length(receipt_object_path) between 1 and 1024
  ),
  constraint receipt_analysis_drafts_hash_valid check (
    receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint receipt_analysis_drafts_analysis_valid check (
    jsonb_typeof(analysis) = 'object'
  ),
  constraint receipt_analysis_drafts_lifecycle_valid check (
    expires_at > created_at
    and (
      (consumed_at is null and claim_id is null)
      or (consumed_at is not null and claim_id is not null)
    )
  )
);

create index receipt_analysis_drafts_wallet_created_idx
  on public.receipt_analysis_drafts (wallet_address, created_at desc);
create index receipt_analysis_drafts_event_hash_idx
  on public.receipt_analysis_drafts (event_id, receipt_sha256);

create function public.create_wallet_session_from_challenge(
  p_challenge_id uuid,
  p_wallet_address text,
  p_token_hash text,
  p_session_expires_at timestamptz,
  p_now timestamptz
)
returns table (wallet_address text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_row public.wallet_auth_challenges%rowtype;
begin
  select challenge.*
  into challenge_row
  from public.wallet_auth_challenges as challenge
  where challenge.id = p_challenge_id
  for update;

  if not found
    or challenge_row.wallet_address <> p_wallet_address
    or challenge_row.consumed_at is not null
    or challenge_row.expires_at <= p_now
  then
    raise sqlstate 'PT401' using message = 'authentication_failed';
  end if;

  update public.wallet_auth_challenges
  set consumed_at = p_now
  where id = p_challenge_id;

  insert into public.wallet_sessions (
    token_hash,
    wallet_address,
    expires_at,
    created_at
  ) values (
    p_token_hash,
    p_wallet_address,
    p_session_expires_at,
    p_now
  );

  return query select p_wallet_address, p_session_expires_at;
end;
$$;

create function public.create_claim_from_analysis_draft(
  p_draft_id uuid,
  p_wallet_address text,
  p_amount numeric,
  p_merchant text,
  p_receipt_date date,
  p_category text,
  p_description text,
  p_now timestamptz
)
returns setof public.claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_row public.receipt_analysis_drafts%rowtype;
  new_claim_id uuid;
begin
  select draft.*
  into draft_row
  from public.receipt_analysis_drafts as draft
  where draft.id = p_draft_id
  for update;

  if not found then
    raise sqlstate 'PT409' using message = 'analysis_draft_unavailable';
  end if;
  if draft_row.wallet_address <> p_wallet_address then
    raise sqlstate 'PT409' using message = 'analysis_draft_unavailable';
  end if;
  if draft_row.consumed_at is not null then
    raise sqlstate 'PT409' using message = 'analysis_draft_consumed';
  end if;
  if draft_row.expires_at <= p_now then
    raise sqlstate 'PT410' using message = 'analysis_draft_expired';
  end if;
  if not exists (
    select 1
    from public.event_members as member
    where member.event_id = draft_row.event_id
      and member.wallet_address = p_wallet_address
      and member.active = true
  ) then
    raise sqlstate 'PT403' using message = 'member_not_found';
  end if;

  insert into public.claims (
    event_id,
    submitter_wallet,
    receipt_object_path,
    receipt_sha256,
    fuzzy_key,
    state,
    amount,
    merchant,
    currency,
    receipt_date,
    category,
    description,
    receipt_analysis
  ) values (
    draft_row.event_id,
    p_wallet_address,
    draft_row.receipt_object_path,
    draft_row.receipt_sha256,
    draft_row.analysis->>'fuzzyKey',
    'submitted',
    p_amount,
    p_merchant,
    draft_row.analysis->>'currency',
    p_receipt_date,
    p_category,
    p_description,
    draft_row.analysis
  )
  returning id into new_claim_id;

  update public.receipt_analysis_drafts
  set consumed_at = p_now,
      claim_id = new_claim_id
  where id = p_draft_id;

  return query
  select claim.*
  from public.claims as claim
  where claim.id = new_claim_id;
end;
$$;

alter table public.wallet_auth_challenges enable row level security;
alter table public.wallet_sessions enable row level security;
alter table public.receipt_analysis_drafts enable row level security;

revoke all on public.wallet_auth_challenges from public, anon, authenticated;
revoke all on public.wallet_sessions from public, anon, authenticated;
revoke all on public.receipt_analysis_drafts from public, anon, authenticated;

grant select, insert, update on public.wallet_auth_challenges to service_role;
grant select, insert, update on public.wallet_sessions to service_role;
grant select, insert, update on public.receipt_analysis_drafts to service_role;

revoke all on function public.create_wallet_session_from_challenge(
  uuid, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_claim_from_analysis_draft(
  uuid, text, numeric, text, date, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_wallet_session_from_challenge(
  uuid, text, text, timestamptz, timestamptz
) to service_role;
grant execute on function public.create_claim_from_analysis_draft(
  uuid, text, numeric, text, date, text, text, timestamptz
) to service_role;
