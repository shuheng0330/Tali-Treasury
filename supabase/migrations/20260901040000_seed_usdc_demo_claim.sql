-- The mandate holds USDC, and every claim read from a real receipt so far is
-- denominated in ringgit or dollars. Those cannot be measured against the
-- per-claim cap or the budget without a conversion quote, so none of them can
-- be approved and the approve-then-pay path has nothing to run on.
--
-- This is the one claim that exercises it. The submitter is the mandate's
-- approved recipient, so the allowlist rule passes on chain as well as here,
-- and the amount sits under the 5 USDC per-claim cap. Confidence is below the
-- auto-pay threshold on purpose: the claim stops for a human rather than
-- paying itself, which is the decision the treasurer screen exists to show.

insert into public.claims (
  id,
  event_id,
  submitter_wallet,
  receipt_object_path,
  receipt_sha256,
  fuzzy_key,
  state,
  amount,
  merchant,
  receipt_date,
  category,
  description,
  receipt_analysis
)
values (
  'd2b7c418-5f3a-4e69-91c0-7a4e8d05b326',
  'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
  '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e',
  'demo/seed-usdc-orientation-stationery.jpg',
  '7ac41d2e9b05f83c6ea27d14b0f95c38e6a2d47b19c05fe83a2d61b47c09fe35',
  'sunway velocity stationery|2026-08-30|2500000',
  'submitted',
  2500000,
  'Sunway Velocity Stationery',
  '2026-08-30',
  'materials',
  'Name tags and lanyards for the orientation booth',
  jsonb_build_object(
    'merchant', 'Sunway Velocity Stationery',
    'amount', '2500000',
    'currency', 'USDC',
    'receiptDate', '2026-08-30',
    'category', 'materials',
    'confidence', 0.86,
    'uncertainFields', jsonb_build_array('category'),
    'warnings', jsonb_build_array(),
    'receiptHash', '7ac41d2e9b05f83c6ea27d14b0f95c38e6a2d47b19c05fe83a2d61b47c09fe35',
    'fuzzyKey', 'sunway velocity stationery|2026-08-30|2500000'
  )
)
on conflict (id) do nothing;
