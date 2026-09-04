-- A corrected claim may be reviewed more than once. Each decision remains an
-- append-only audit event; only the active review fields on claims are reset.
alter table public.claim_review_events
  drop constraint if exists claim_review_events_claim_id_key;

-- Permit the one safe way to replace a quote: a claim explicitly returned for
-- correction may clear it while moving back to submitted. Every other quote
-- binding and immutability check remains unchanged.
create or replace function public.enforce_claim_fx_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  q jsonb := new.fx_quote;
  expected_mandate text;
  rate numeric;
  field text;
  correction_reset boolean := false;
begin
  if tg_op = 'UPDATE' then
    correction_reset :=
      old.state = 'needs_correction' and new.state = 'submitted' and
      new.fx_quote is null and new.decision is null and
      new.review_action is null and new.reviewer_wallet is null and
      new.review_reason is null and new.reviewed_at is null and
      new.payment is null and new.payment_attempt_digest is null;
  end if;

  if tg_op = 'UPDATE' and old.fx_quote is not null and not correction_reset and (
    new.amount is distinct from old.amount or new.currency is distinct from old.currency or
    new.submitter_wallet is distinct from old.submitter_wallet or new.event_id is distinct from old.event_id or
    new.receipt_analysis is distinct from old.receipt_analysis
  ) then raise exception 'Quoted receipt identity and amount are immutable' using errcode = '23514'; end if;

  if q is distinct from (case when tg_op = 'UPDATE' then old.fx_quote else null end) then
    if not correction_reset and (
      q is null or (tg_op = 'UPDATE' and (old.state not in ('submitted', 'awaiting_review') or
         old.review_action is not null or old.payment_attempt_digest is not null)) or
         new.state <> 'submitted' or new.decision is not null or new.review_action is not null
    ) then
      raise exception 'Quote cannot change after a decision or payment has started' using errcode = '23514';
    end if;

    if q is not null then
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
      insert into public.claim_fx_quote_history(quote_id, claim_id, quote)
        values ((q->>'id')::uuid, new.id, q);
    end if;
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
