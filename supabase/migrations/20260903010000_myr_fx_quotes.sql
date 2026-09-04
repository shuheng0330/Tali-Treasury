-- All quote/cache writes are backend-only. No browser role gets rate APIs.
alter table public.claims add column fx_quote jsonb;

create table public.claim_fx_quote_history (
  quote_id uuid primary key,
  claim_id uuid not null references public.claims(id) on delete restrict,
  quote jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.claim_fx_quote_history enable row level security;
revoke all on public.claim_fx_quote_history from anon, authenticated, service_role;
grant select on public.claim_fx_quote_history to service_role;

create function public.enforce_claim_fx_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  q jsonb := new.fx_quote;
  expected_mandate text;
  rate numeric;
  field text;
begin
  if tg_op = 'UPDATE' and old.fx_quote is not null and (
    new.amount is distinct from old.amount or new.currency is distinct from old.currency or
    new.submitter_wallet is distinct from old.submitter_wallet or new.event_id is distinct from old.event_id or
    new.receipt_analysis is distinct from old.receipt_analysis
  ) then raise exception 'Quoted receipt identity and amount are immutable' using errcode = '23514'; end if;

  if q is distinct from (case when tg_op = 'UPDATE' then old.fx_quote else null end) then
    if q is null or (tg_op = 'UPDATE' and (old.state not in ('submitted', 'awaiting_review') or
       old.review_action is not null or old.payment_attempt_digest is not null)) or
       new.state <> 'submitted' or new.decision is not null or new.review_action is not null then
      raise exception 'Quote cannot change after a decision or payment has started' using errcode = '23514';
    end if;
    if not (q ?& array['id','claimId','eventId','recipient','mandateId','provider','sourceCurrency',
      'targetCurrency','sourceAmount','targetAmount','myrPerUsd','rateTimestampMs','fetchedAtMs',
      'createdAtMs','expiresAtMs','valuation','rounding']) then
      raise exception 'Incomplete FX quote' using errcode = '23514';
    end if;
    foreach field in array array['id','claimId','eventId','recipient','mandateId','provider',
      'sourceCurrency','targetCurrency','sourceAmount','targetAmount','myrPerUsd','valuation','rounding'] loop
      if jsonb_typeof(q->field) is distinct from 'string' then
        raise exception 'Invalid FX quote string' using errcode = '23514';
      end if;
    end loop;
    foreach field in array array['rateTimestampMs','fetchedAtMs','createdAtMs','expiresAtMs'] loop
      if jsonb_typeof(q->field) is distinct from 'number' or (q->>field) !~ '^[1-9]\d{0,15}$' then
        raise exception 'Invalid FX quote timestamp' using errcode = '23514';
      end if;
    end loop;
    select mandate_object_id into expected_mandate from public.events where id = new.event_id;
    if (q->>'id') !~ '^[0-9a-f-]{36}$' or q->>'claimId' <> new.id::text or
       q->>'eventId' <> new.event_id::text or q->>'recipient' <> new.submitter_wallet or
       q->>'mandateId' <> expected_mandate or new.currency <> 'MYR' or
       new.receipt_analysis->>'currency' <> 'MYR' or q->>'provider' <> 'open_exchange_rates' or
       q->>'sourceCurrency' <> 'MYR' or q->>'targetCurrency' <> 'USDC' or
       q->>'sourceAmount' <> new.amount::text or q->>'valuation' <> 'USDC_USD_PARITY' or
       q->>'rounding' <> 'HALF_UP_6DP' or (q->>'myrPerUsd') !~ '^\d{1,3}(\.\d{1,12})?$' or
       (q->>'targetAmount') !~ '^[1-9]\d{0,19}$' then
      raise exception 'FX quote does not match receipt' using errcode = '23514';
    end if;
    rate := (q->>'myrPerUsd')::numeric;
    if rate < 1 or rate > 20 or new.amount > 18446744073709551615 or
       (q->>'targetAmount')::numeric <> round(new.amount / rate) or
       (q->>'targetAmount')::numeric > 18446744073709551615 or
       (q->>'rateTimestampMs')::numeric > (q->>'fetchedAtMs')::numeric + 60000 or
       (q->>'fetchedAtMs')::numeric > (q->>'createdAtMs')::numeric or
       (q->>'createdAtMs')::numeric > extract(epoch from clock_timestamp()) * 1000 + 60000 or
       (q->>'expiresAtMs')::numeric <= extract(epoch from clock_timestamp()) * 1000 or
       (q->>'expiresAtMs')::numeric <= (q->>'createdAtMs')::numeric or
       (q->>'expiresAtMs')::numeric > (q->>'createdAtMs')::numeric + 900000 or
       (q->>'expiresAtMs')::numeric > (q->>'rateTimestampMs')::numeric + 5400000 then
      raise exception 'Invalid or expired FX valuation' using errcode = '23514';
    end if;
    insert into public.claim_fx_quote_history(quote_id, claim_id, quote) values ((q->>'id')::uuid, new.id, q);
  end if;

  -- Existing paying/paid records may be reconciled after quote expiry.
  if new.currency = 'MYR' and new.state in ('approved', 'paying') and
     (tg_op = 'INSERT' or old.state not in ('approved', 'paying')) then
    if q is null or new.review_action is distinct from 'approve' or
       (q->>'expiresAtMs')::numeric <= extract(epoch from clock_timestamp()) * 1000 then
      raise exception 'MYR payment requires approval of a current quote' using errcode = '23514';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.enforce_claim_fx_quote() from public;
create trigger claims_enforce_fx_quote before insert or update on public.claims
for each row execute function public.enforce_claim_fx_quote();

create table public.myr_rate_cache (
  singleton boolean primary key default true check (singleton),
  rate jsonb,
  lease_token uuid,
  lease_until timestamptz not null default '-infinity',
  next_refresh_at timestamptz not null default '-infinity'
);
insert into public.myr_rate_cache(singleton) values (true);
alter table public.myr_rate_cache enable row level security;
revoke all on public.myr_rate_cache from anon, authenticated, service_role;

create function public.read_myr_rate() returns jsonb
language sql security definer set search_path = '' as $$
  select rate from public.myr_rate_cache where singleton;
$$;
create function public.acquire_myr_rate_refresh(token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.myr_rate_cache set lease_token = token,
    lease_until = clock_timestamp() + interval '15 seconds',
    next_refresh_at = clock_timestamp() + interval '5 minutes'
  where singleton and lease_until <= clock_timestamp() and next_refresh_at <= clock_timestamp();
  return found;
end; $$;
create function public.save_myr_rate(token uuid, rate jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.myr_rate_cache set rate = save_myr_rate.rate, lease_token = null,
    lease_until = '-infinity', next_refresh_at = clock_timestamp() + interval '1 hour'
  where singleton and lease_token = token and lease_until > clock_timestamp();
  return found;
end; $$;
revoke all on function public.read_myr_rate() from public, anon, authenticated;
revoke all on function public.acquire_myr_rate_refresh(uuid) from public, anon, authenticated;
revoke all on function public.save_myr_rate(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.read_myr_rate(), public.acquire_myr_rate_refresh(uuid),
  public.save_myr_rate(uuid, jsonb) to service_role;
