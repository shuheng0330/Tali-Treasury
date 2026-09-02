alter table public.claims
  add column payment_attempt_digest text,
  add column payment_attempt_budget_before numeric,
  add column payment_attempt_prepared_at timestamptz,
  add column payment_attempt_last_checked_at timestamptz;

alter table public.claims
  add constraint claims_payment_attempt_valid check (
    (
      payment_attempt_digest is null
      and payment_attempt_budget_before is null
      and payment_attempt_prepared_at is null
      and payment_attempt_last_checked_at is null
    )
    or (
      payment_attempt_digest ~ '^[1-9A-HJ-NP-Za-km-z]{32,64}$'
      and payment_attempt_budget_before is not null
      and payment_attempt_budget_before >= 0
      and payment_attempt_budget_before = trunc(payment_attempt_budget_before)
      and payment_attempt_prepared_at is not null
      and state in ('paying', 'paid', 'payment_failed')
      and (
        payment_attempt_last_checked_at is null
        or payment_attempt_last_checked_at >= payment_attempt_prepared_at
      )
    )
  ),
  add constraint claims_payment_attempt_matches_result check (
    payment_attempt_digest is null
    or payment is null
    or payment->>'digest' is null
    or payment->>'digest' = payment_attempt_digest
  );

create unique index claims_payment_attempt_digest_unique
  on public.claims (payment_attempt_digest)
  where payment_attempt_digest is not null;
