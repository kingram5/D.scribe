-- Rollback for supabase/migrations/033_signup_attribution.sql.
-- Kept outside supabase/migrations on purpose so it is never applied by accident.
--
-- Removes everything 033 creates, and every row in it (irreversible):
--   - bump_visit_channel(text) and the anonymous daily visit counts
--   - the signup attribution table and every answer in it
-- Dropping a table also drops its indexes, constraints and RLS policy. Safe to
-- re-run. The app keeps working afterwards: it fails soft, stops asking the
-- signup question, stops counting visits, and the growth dashboard says the
-- migration has not run.

drop function if exists public.bump_visit_channel(text);
drop table if exists public.visit_channel_daily;
drop table if exists public.user_attribution;
