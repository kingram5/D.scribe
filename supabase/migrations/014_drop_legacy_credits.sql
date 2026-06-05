-- Migration 014: Drop the legacy credit wallet (single-wallet consolidation onto Ink)
--
-- Phase 1 fix #2 (launch-readiness plan). The legacy user_credits / usage_overrides
-- wallet + decrement_credit() RPC were only ever used by lib/credits.ts, which fed
-- /api/jobs (deleted in this change) and /api/credits (now a thin read over
-- ink_balances). Stripe never funded this wallet — only ink_balances did. With the
-- code references gone (credits.ts deleted in the same commit), these objects are dead.
--
-- >> APPLY ORDER: run this ONLY AFTER the part-2 code deploy (the build with
--    credits.ts removed + /api/credits rewired to Ink) is live on prod. Applying it
--    while any deployed code still calls checkCredits / decrement_credit would turn
--    those calls into 500s. Verify www.d-scribe.app is serving the part-2 build first.
--
-- Idempotent — safe to re-run. No begin/commit (the migration runner wraps the file).

-- 1. Drop the SECURITY DEFINER decrement RPC (013 already revoked its grants).
drop function if exists decrement_credit(uuid);

-- 2. Drop the legacy wallet tables. CASCADE clears their RLS policies and any
--    dependent constraints. ink_balances / ink_usage are a separate system, untouched.
drop table if exists usage_overrides cascade;
drop table if exists user_credits   cascade;
