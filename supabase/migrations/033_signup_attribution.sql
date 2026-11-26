-- 033: "How did you hear about us?" + first-visit attribution (SEO/GEO plan
-- Phase 3b, approved by Kyle 2026-11-14), plus anonymous visit counts by
-- channel for the growth dashboard (Kyle 2026-11-25).
--
-- Numbered 033 on purpose: 032 belongs to feat/chatgpt-app (already applied to
-- prod). Additive only: two new tables and one new function, no change to
-- existing tables. Safe to apply before the code ships, and the code fails
-- soft if these are missing (the question is simply not shown, visits are not
-- counted, the dashboard says the migration has not run), so either order
-- works; run this first so answers and visits are captured from day one.
-- Paste the whole file into the Supabase SQL editor and run it once.
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

-- ── Anonymous visit counts by channel (growth dashboard, Kyle 2026-11-25) ────
--
-- Top of the funnel for /admin/growth: visits -> sign-ups -> paying, per
-- marketing channel. One row per UTC day per channel holding a plain count.
-- No user id, no IP, no URL, nothing per person: the browser sends one ping
-- the first time it ever visits (only when analytics is not declined), the
-- server works out the channel from the referrer / utm_source, and this
-- table just adds one.
--
-- RLS on with no policies at all: the browser can neither read nor write it.
-- The only writer is bump_visit_channel(), callable by the service role only
-- (the /api/attribution/visit route); the dashboard reads it with the service
-- role behind its own gate.

create table if not exists public.visit_channel_daily (
  day date not null,
  channel text not null,
  visits integer not null default 0 check (visits >= 0),
  primary key (day, channel)
);

-- Allowed channels. Keep in step with VISIT_CHANNELS in src/lib/channels.ts
-- (a test checks it, and checks the function's list below too).
alter table public.visit_channel_daily drop constraint if exists visit_channel_daily_channel_check;
alter table public.visit_channel_daily add constraint visit_channel_daily_channel_check check (channel in (
  'instagram', 'tiktok', 'facebook', 'google', 'bing', 'search_other',
  'chatgpt', 'perplexity', 'gemini', 'claude', 'copilot', 'youtube', 'reddit',
  'linkedin', 'x', 'social_other', 'email', 'direct', 'other'
));

comment on table public.visit_channel_daily is 'Anonymous first-visit counts per UTC day per marketing channel. No personal data. Written only by bump_visit_channel() (service role).';

alter table public.visit_channel_daily enable row level security;
revoke all on table public.visit_channel_daily from anon, authenticated;

create or replace function public.bump_visit_channel(p_channel text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_channel is null or p_channel not in (
    'instagram', 'tiktok', 'facebook', 'google', 'bing', 'search_other',
    'chatgpt', 'perplexity', 'gemini', 'claude', 'copilot', 'youtube', 'reddit',
    'linkedin', 'x', 'social_other', 'email', 'direct', 'other'
  ) then
    raise exception 'bump_visit_channel: unknown channel %', p_channel using errcode = '22023';
  end if;

  insert into public.visit_channel_daily (day, channel, visits)
  values ((now() at time zone 'utc')::date, p_channel, 1)
  on conflict (day, channel) do update set visits = public.visit_channel_daily.visits + 1;
end;
$$;

comment on function public.bump_visit_channel(text) is 'Adds one anonymous visit for today (UTC) under a known channel. Service role only.';

revoke execute on function public.bump_visit_channel(text) from public, anon, authenticated;
grant  execute on function public.bump_visit_channel(text) to service_role;
