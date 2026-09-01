alter table public.claims
  drop constraint claims_currency_valid,
  add constraint claims_currency_valid check (
    currency is null or currency ~ '^[A-Z]{3}$' or currency = 'USDC'
  );

alter table public.claims
  add column review_action text,
  add column reviewer_wallet text,
  add column review_reason text,
  add column reviewed_at timestamptz,
  add constraint claims_review_action_valid check (
    review_action is null
    or review_action in ('approve', 'reject', 'request_correction')
  ),
  add constraint claims_reviewer_wallet_valid check (
    reviewer_wallet is null or reviewer_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  add constraint claims_review_reason_valid check (
    review_reason is null
    or (
      review_reason = btrim(review_reason)
      and char_length(review_reason) between 1 and 500
    )
  ),
  add constraint claims_review_metadata_consistent check (
    (
      review_action is null
      and reviewer_wallet is null
      and review_reason is null
      and reviewed_at is null
    )
    or (
      review_action is not null
      and reviewer_wallet is not null
      and reviewed_at is not null
      and (
        (review_action = 'approve')
        or (
          review_action in ('reject', 'request_correction')
          and review_reason is not null
        )
      )
    )
  );

create table public.claim_review_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.claims(id) on delete restrict,
  action text not null,
  reviewer_wallet text not null,
  reason text,
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint claim_review_events_action_valid check (
    action in ('approve', 'reject', 'request_correction')
  ),
  constraint claim_review_events_reviewer_wallet_valid check (
    reviewer_wallet ~ '^0x[0-9a-f]{64}$'
  ),
  constraint claim_review_events_reason_valid check (
    (
      action = 'approve'
      and (
        reason is null
        or (
          reason = btrim(reason)
          and char_length(reason) between 1 and 500
        )
      )
    )
    or (
      action in ('reject', 'request_correction')
      and reason is not null
      and reason = btrim(reason)
      and char_length(reason) between 1 and 500
    )
  )
);

create index claim_review_events_claim_created_at_idx
  on public.claim_review_events (claim_id, created_at desc);

create function public.record_claim_review_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.claim_review_events (
    claim_id,
    action,
    reviewer_wallet,
    reason,
    reviewed_at
  ) values (
    new.id,
    new.review_action,
    new.reviewer_wallet,
    new.review_reason,
    new.reviewed_at
  );
  return new;
end;
$$;

revoke all on function public.record_claim_review_event() from public;

create trigger claims_record_review_event
after update of review_action, reviewer_wallet, review_reason, reviewed_at
on public.claims
for each row
when (old.review_action is null and new.review_action is not null)
execute function public.record_claim_review_event();

alter table public.claim_review_events enable row level security;

revoke all on public.claim_review_events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.claim_review_events from service_role;
grant select on public.claim_review_events to service_role;
