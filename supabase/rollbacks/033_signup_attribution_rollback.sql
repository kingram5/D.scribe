-- Rollback for supabase/migrations/033_signup_attribution.sql.
-- Kept outside supabase/migrations on purpose so it is never applied by accident.
--
-- Removes the signup attribution table and every answer in it (irreversible).
-- Dropping the table also drops its indexes and its RLS policy. Safe to re-run.
-- The app keeps working afterwards: it fails soft and simply stops asking.

drop table if exists public.user_attribution;
