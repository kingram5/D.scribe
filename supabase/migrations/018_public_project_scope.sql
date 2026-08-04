-- 018: Scope what "public" exposes (edge-test finding #41).
--
-- The 005 policy granted SELECT on the WHOLE projects row when is_public,
-- so anyone with the anon key could read a public project's voice_profile
-- (a linguistic analysis of how the author speaks) and narrative_tracker
-- directly via PostgREST. A user ticking "public" consented to a discover
-- listing, not to publishing a profile of themselves.
--
-- RLS can't limit columns, so the public surface moves to a view carrying
-- exactly the columns /api/discover publishes. The API route itself uses the
-- service-role client and is unaffected.

drop policy if exists "Public projects are readable by anyone" on projects;

create or replace view public_projects as
  select id, title, description, audience, published_excerpt, published_author, updated_at
  from projects
  where is_public = true;

grant select on public_projects to anon, authenticated;
