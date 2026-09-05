-- There is no treasurer any more.
--
-- The product had two authorities: TALI_EMPLOYER_WALLET signed payroll, and the
-- event's own treasurer_wallet reviewed, paid and reconciled expense claims and
-- wrote the member roster. They were two different wallets, and the split
-- described an organisation this product does not have — the same person creates
-- the treasury, funds payroll, and decides what either of them pays.
--
-- The interface now offers the treasury to the employer. This makes the server
-- agree, because the server is what actually refuses: without it the employer
-- would be shown a queue and handed a 403 by
-- `Only the event treasurer may review claims`.
--
-- The employer is also added to the roster. Membership is what
-- `assertActiveMember` checks before accepting an expense claim, so without a
-- row here the one account that administers the event could not file one.

do $$
declare
  -- The wallet TALI_EMPLOYER_WALLET names. A Sui address is public and
  -- authorises nothing on its own; the signing key stays out of the repo.
  employer constant text := '0xc49326adb506e0716c8beaf69885f4e008d34e116d277da49e253a72e82647b7';
  demo_event constant uuid := 'ba7e50e2-7e7b-4a67-a505-9e3a329739ae';
begin
  update public.events
  set treasurer_wallet = employer,
      updated_at = clock_timestamp()
  where id = demo_event
    and treasurer_wallet <> employer;

  insert into public.event_members (event_id, wallet_address, display_name, active)
  values (demo_event, employer, 'Employer', true)
  on conflict (event_id, wallet_address) do update set active = true;
end
$$;
