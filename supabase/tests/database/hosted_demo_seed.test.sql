begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

select ok(
  exists(
    select 1
    from public.events
    where id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
      and name = 'Orientation Week'
      and organisation = 'FSKTM Blockchain Society'
  ),
  'demo event exists'
);

select is(
  (
    select mandate_object_id
    from public.events
    where id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
  ),
  '0x16b9fdc16764d6fa514fb6da55df5ca840d30e5bb057eba6a5ab67cf743c7f6f',
  'demo event uses the official USDC mandate'
);

select is(
  (
    select treasurer_wallet
    from public.events
    where id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
  ),
  '0x010bcab9ea8de3948d294c1cd90348615634417b65e135a6f9d72b52a10cd2a9',
  'demo event uses the deployed treasurer'
);

select is(
  (
    select allowed_categories
    from public.events
    where id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
  ),
  array['food', 'printing', 'transport', 'venue', 'materials']::text[],
  'demo event categories match the product flow'
);

select ok(
  exists(
    select 1
    from public.event_members
    where event_id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
      and wallet_address = '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e'
      and active
  ),
  'approved Sui recipient is an active event member'
);

select is(
  (
    select display_name
    from public.event_members
    where event_id = 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae'
      and wallet_address = '0x405200312d4c8ee0159d44429ca69ef0cf035f4a00c12f2035a0bdef882bb16e'
  ),
  'Kian Xiang',
  'demo member has the expected display name'
);

select * from finish();

rollback;
