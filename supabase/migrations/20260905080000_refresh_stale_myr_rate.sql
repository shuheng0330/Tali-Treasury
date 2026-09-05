-- A provider timestamp can lag the fetch time. Do not let the normal refresh
-- interval strand Tali without a quote after the 90-minute freshness window
-- closes: a stale (or malformed) cached rate may always acquire the lease.
create or replace function public.acquire_myr_rate_refresh(token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.myr_rate_cache set lease_token = token,
    lease_until = clock_timestamp() + interval '15 seconds',
    next_refresh_at = clock_timestamp() + interval '5 minutes'
  where singleton and lease_until <= clock_timestamp() and (
    next_refresh_at <= clock_timestamp() or
    rate is null or
    case
      when jsonb_typeof(rate->'rateTimestampMs') = 'number'
        and (rate->>'rateTimestampMs') ~ '^[1-9][0-9]{0,15}$'
      then (rate->>'rateTimestampMs')::numeric <=
        extract(epoch from clock_timestamp()) * 1000 - 90 * 60 * 1000
      else true
    end
  );
  return found;
end; $$;

revoke all on function public.acquire_myr_rate_refresh(uuid) from public, anon, authenticated;
grant execute on function public.acquire_myr_rate_refresh(uuid) to service_role;
