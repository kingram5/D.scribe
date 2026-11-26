-- 033: "How did you hear about us?" + first-visit attribution (SEO/GEO plan
-- Phase 3b, approved by Kyle 2026-11-14).
--
-- Numbered 033 on purpose: 032 belongs to feat/chatgpt-app (already applied to
-- prod). Additive only: one new table, no change to existing tables. Safe to
-- apply before the code ships, and the code fails soft if this table is
-- missing (the question is simply not shown), so either order works; run this
-- first so answers are captured from day one.
--
-- There is no profiles table in this schema, so attribution gets its own
-- one-row-per-account table keyed by the auth user id, deleted with the
-- account (on delete cascade). RLS matches the other per-user tables (031):
-- signed-in users may read their own row; every write goes through server code
-- using the service role, so the browser can never forge or edit an answer.
--
-- Re-runnable: every statement is guarded.
-- Rollback: supabase/rollbacks/033_signup_attribution_rollback.sql (kept
-- outside supabase/migrations so it is never applied by accident).

create table if not exists public.user_attribution (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Self-reported answer (required in the app). The allowed values are a
  -- named check constraint added below, so a re-run updates the list.
  attribution_source text not null,
  -- Free text for "Other" (optional, capped).
  attribution_detail text check (attribution_detail is null or char_length(attribution_detail) <= 200),

  -- Passive first-visit capture, as the browser recorded it on the first page
  -- view (client-supplied; treat as a signal, not proof).
  landing_url text check (landing_url is null or char_length(landing_url) <= 2048),
  referrer text check (referrer is null or char_length(referrer) <= 2048),
  null_referrer boolean,
  utm_source text check (utm_source is null or char_length(utm_source) <= 200),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 200),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 200),
  utm_term text check (utm_term is null or char_length(utm_term) <= 200),
  utm_content text check (utm_content is null or char_length(utm_content) <= 200),
  first_seen_at timestamptz,

  -- AI assistant tagged on the server from the referrer host / utm_source.
  ai_referrer text check (ai_referrer is null or ai_referrer in ('chatgpt', 'perplexity', 'claude', 'gemini', 'copilot')),

  created_at timestamptz not null default now()
);

-- Allowed answers. Keep this list in step with ATTRIBUTION_OPTIONS in
-- src/lib/attribution.ts (a test checks it). 2026-11-25: "social" split into
-- instagram, tiktok, facebook and social (= other social: X, LinkedIn).
-- Dropped and re-added by name (the name Postgres gave the old inline check),
-- so running this file again, even over the first draft, leaves exactly this
-- list in force.
alter table public.user_attribution drop constraint if exists user_attribution_attribution_source_check;
alter table public.user_attribution add constraint user_attribution_attribution_source_check check (attribution_source in (
  'chatgpt', 'claude', 'perplexity', 'gemini', 'google', 'bing', 'reddit',
  'youtube', 'podcast', 'friend', 'instagram', 'tiktok', 'facebook', 'social',
  'directory', 'other'
));

comment on table public.user_attribution is 'One row per account: the signup "How did you hear about us?" answer plus first-visit referrer/UTM capture. Written by server code only.';

create index if not exists idx_user_attribution_created on public.user_attribution (created_at desc);
create index if not exists idx_user_attribution_source on public.user_attribution (attribution_source);

alter table public.user_attribution enable row level security;

drop policy if exists "read own attribution" on public.user_attribution;
create policy "read own attribution" on public.user_attribution
  for select using ((select auth.uid()) = user_id);
