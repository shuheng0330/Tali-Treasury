-- Retained as a migration-history compatibility marker.
--
-- Earlier environments applied this version to restrict the original payroll
-- configuration table. The consolidated 20260904020000 migration now creates
-- the strict registry with those grants already in place, but removing this
-- version prevents Supabase from upgrading any database that recorded it.

select 1;
