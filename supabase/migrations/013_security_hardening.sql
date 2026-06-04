-- Migration 013: Security hardening (Phase 0 — launch-readiness plan)
--
-- Closes the P0 database holes from the Claude + Hermes audit (2026-06-01):
--   1. usage_overrides shipped a world-open RLS policy (using(true) / with check(true)) —
--      any authenticated user could grant themselves credits or read/write every other
--      tenant's quota via the public anon key.
--   2. stripe_events, rate_limit_counters, blog_posts had NO row-level security — fully
--      reachable through PostgREST with the anon key (billing-history leak, rate-limiter
--      wipe -> unlimited AI, and blog stored-XSS / defacement).
--   3. The metering RPCs are SECURITY DEFINER and take a user_id parameter, with EXECUTE
--      granted to PUBLIC — any authenticated user could call them for an arbitrary user_id
--      and drain another user's balance.
--
-- SAFE FOR THE APP: every legitimate write to these objects happens via the SERVICE ROLE
-- (server-side createServerClient), which BYPASSES RLS and is re-granted EXECUTE below.
-- Locking out anon / authenticated / public does not affect server-side calls.
--   >> REVIEW ASSUMPTION (Hermes to confirm): no route calls deduct_ink /
--      check_and_deduct_tts / decrement_credit via the anon or authenticated client.
--      If one does, that call will start returning permission-denied after this migration.
--
-- LEGACY NOTE: usage_overrides + decrement_credit belong to the legacy credit system being
-- retired in Phase 1 (single-wallet consolidation onto Ink). They are hardened here to
-- close the hole in the interim; Phase 1 drops them outright.
--
-- Idempotent — safe to re-run. No begin/commit (the migration runner wraps the file).

-- ── 1. usage_overrides: replace the world-open policy with read-own-only ─────────────
-- RLS is already enabled in 003; only the policy is broken.
drop policy if exists "Service role manages overrides" on usage_overrides;
drop policy if exists "Users read own overrides"       on usage_overrides;
create policy "Users read own overrides"
  on usage_overrides for select
  using (user_id = auth.uid());
-- No client INSERT/UPDATE/DELETE policy — the server writes via service role only.

-- ── 2. Enable RLS on the three unprotected tables ───────────────────────────────────

-- 2a. stripe_events — internal idempotency log; deny ALL client access (no policy).
alter table stripe_events enable row level security;

-- 2b. rate_limit_counters — internal limiter state; deny ALL client access (no policy).
--     check_rate_limit() is NOT security definer, so with RLS enabled a client caller can
--     no longer mutate counters. The app calls it as service_role and is unaffected.
alter table rate_limit_counters enable row level security;

-- 2c. blog_posts — public content; allow read of PUBLISHED posts only, deny client writes.
alter table blog_posts enable row level security;
drop policy if exists "Public can read published posts" on blog_posts;
create policy "Public can read published posts"
  on blog_posts for select
  using (published = true);

-- ── 3. Lock the SECURITY DEFINER metering RPCs to service_role only ──────────────────
-- Revoke the default PUBLIC execute grant (which anon/authenticated inherit) and re-grant
-- explicitly to service_role so server-side metering keeps working.

-- 3a. Legacy credit decrement (dropped in Phase 1).
revoke execute on function decrement_credit(uuid) from public, anon, authenticated;
grant  execute on function decrement_credit(uuid) to service_role;

-- 3b. Ink deduction (current system).
revoke execute on function deduct_ink(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant  execute on function deduct_ink(uuid, uuid, text, text, integer, integer) to service_role;

-- 3c. TTS check-and-deduct.
revoke execute on function check_and_deduct_tts(uuid, integer) from public, anon, authenticated;
grant  execute on function check_and_deduct_tts(uuid, integer) to service_role;
