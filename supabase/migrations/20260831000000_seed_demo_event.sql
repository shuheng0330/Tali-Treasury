insert into public.events (
  id,
  name,
  organisation,
  mandate_object_id,
  treasurer_wallet,
  allowed_categories,
  starts_at,
  expires_at
)
values (
  'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
  'Orientation Week',
  'FSKTM Blockchain Society',
  '0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f',
  '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
  array['food', 'printing', 'transport', 'venue', 'materials'],
  '2026-08-24 09:00:00+00',
  '2026-09-05 14:30:28+00'
)
on conflict (id) do update set
  name = excluded.name,
  organisation = excluded.organisation,
  mandate_object_id = excluded.mandate_object_id,
  treasurer_wallet = excluded.treasurer_wallet,
  allowed_categories = excluded.allowed_categories,
  starts_at = excluded.starts_at,
  expires_at = excluded.expires_at,
  updated_at = clock_timestamp();

insert into public.event_members (
  event_id,
  wallet_address,
  display_name,
  active
)
values (
  'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
  '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e',
  'Kian Xiang',
  true
)
on conflict (event_id, wallet_address) do update set
  display_name = excluded.display_name,
  active = excluded.active;
