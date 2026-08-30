insert into public.event_members (
  event_id,
  wallet_address,
  display_name,
  active
)
values
  (
    'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
    '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
    'Shu Heng',
    true
  ),
  (
    'ba7e50e2-7e7b-4a67-a505-9e3a329739ae',
    '0x939194a716226335b1089c5b36088ebc0b57a928c206d63c9ddcad70ff76b471',
    'Lim Wey Cheng',
    true
  )
on conflict (event_id, wallet_address) do update set
  display_name = excluded.display_name,
  active = excluded.active;
