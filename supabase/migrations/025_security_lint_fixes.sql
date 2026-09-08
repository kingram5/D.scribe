-- 025: Supabase security-lint fixes (2026-09-08, launch hardening). Applied to prod via MCP the same day.
-- (1) Pin search_path on every public function so a malicious object in another
--     schema cannot shadow what SECURITY DEFINER / trigger functions call.
-- (2) Drop the unused public_projects view. It ran as SECURITY DEFINER (lint ERROR).
--     Nothing in the app reads it: /api/discover serves public projects through the
--     service-role client with an explicit column list, and no client code selects
--     from the view. Removing it closes an anon-readable surface for free.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_updated_at','tier_ink_allotment','check_rate_limit','update_updated_at',
                        'model_ink_factor','deduct_ink','release_ink_reservation','check_and_deduct_tts',
                        'bump_edit_counter','ensure_ink_balance','deduct_ink_flat','reserve_ink','settle_ink_reservation')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

drop view if exists public.public_projects;
