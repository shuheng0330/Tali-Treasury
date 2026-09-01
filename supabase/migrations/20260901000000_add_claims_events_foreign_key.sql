-- Claims already reference an event indirectly, through the composite key that
-- ties a claim to a member of that event. PostgREST cannot infer a claims ->
-- events relationship from that, so `events!inner(...)` fails with PGRST200 and
-- the process endpoint returns a generic 500.
--
-- The relationship is already guaranteed transitively, so this constraint adds
-- no new restriction. It states the relationship directly, which is what the
-- embed needs.

alter table public.claims
  add constraint claims_event_id_fkey
  foreign key (event_id)
  references public.events (id)
  on delete cascade;
