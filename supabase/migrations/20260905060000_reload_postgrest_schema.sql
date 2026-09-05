-- The preceding overtime/leave migration adds tables that the server API
-- reads through PostgREST. Explicitly refresh its schema cache so an already
-- running REST service discovers those tables immediately after deployment.
-- This changes no application data or table policy.
notify pgrst, 'reload schema';
