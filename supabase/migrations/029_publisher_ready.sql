-- 029: Publisher-Ready pipeline (spec: vault projects/dscribe-publisher-ready-spec-2026-09-27.md).
--
-- ADDITIVE ONLY. Safe to apply before launch: new tables and new ink_rates rows,
-- nothing existing changes. The plan-allotment change ships separately in 030,
-- which is launch-day only (applied together with the Stripe price swap).
--
-- Pipeline per book: draft (Sonnet 5) -> editor read (Fable 5.1) -> round-robin
-- second interview (Sonnet 5) -> revise (Opus 5.5) -> final check (Sonnet 5).
-- All writes go through API routes (service role); clients may only read their
-- own rows.

-- ── 1. Vendor prices for the new models (read by ink_cost_v2) ───────────────
-- Without these rows ink_cost_v2 bills unknown models at the 'sonnet' row,
-- which would under-charge Fable by ~3x. The app refuses to run the pipeline
-- unless the v2 meter is on.
insert into ink_rates (model, usd_in, usd_out, usd_cache_read, usd_cache_write, note) values
  ('sonnet5', 2.00, 10.00, 0.20, 4.00,  'claude-sonnet-5 list price 2026; confirm against the Anthropic invoice'),
  ('opus55',  4.00, 20.00, 0.20, 8.00,  'claude-opus-5-5 list price 2026 (cache read $0.20); confirm against the invoice'),
  ('fable51', 10.00, 50.00, 0.25, 20.00, 'claude-fable-5-1 list price 2026 (cache read $0.25); confirm against the invoice')
on conflict (model) do nothing;

-- ── 2. Runs ─────────────────────────────────────────────────────────────────
create table if not exists pr_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'drafting'
    check (status in ('drafting', 'editing', 'interviewing', 'revising', 'checking', 'done', 'cancelled')),
  models jsonb not null default '{}',
  ink_estimate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists pr_runs_project_idx on pr_runs (project_id, created_at desc);
create index if not exists pr_runs_user_idx on pr_runs (user_id);
-- One live run per project.
create unique index if not exists pr_runs_one_live
  on pr_runs (project_id) where (status not in ('done', 'cancelled'));

-- ── 3. Per-chapter step record (which version went in, which came out) ──────
create table if not exists pr_chapter_passes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pr_runs(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  user_id uuid not null,
  step text not null check (step in ('draft', 'edit', 'revise', 'final')),
  version_in integer,
  version_out integer,
  beat_plan jsonb,
  scores jsonb,
  change_log jsonb,
  usage jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, chapter_id, step)
);
create index if not exists pr_chapter_passes_run_idx on pr_chapter_passes (run_id);

-- ── 4. Editor questions for the author (round-robin queue) ──────────────────
create table if not exists pr_questions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pr_runs(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  user_id uuid not null,
  question text not null,
  why text not null default '',
  impact smallint not null default 3 check (impact between 1 and 5),
  beat_id text,
  status text not null default 'queued'
    check (status in ('queued', 'asked', 'answered', 'skipped', 'dropped_covered', 'unanswered')),
  asked_round integer,
  covered_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pr_questions_run_idx on pr_questions (run_id, chapter_id, status);

-- ── 5. The author's answers (author-origin text: feeds the Authorship Record) ─
create table if not exists pr_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references pr_questions(id) on delete cascade,
  run_id uuid not null references pr_runs(id) on delete cascade,
  user_id uuid not null,
  transcript text not null,
  source text not null default 'typed' check (source in ('typed', 'voice')),
  follow_up_of uuid references pr_answers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pr_answers_run_idx on pr_answers (run_id);

-- ── 6. Craft notes (go straight to the reviser, never asked of the author) ──
create table if not exists pr_craft_notes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pr_runs(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  user_id uuid not null,
  span text not null default '',
  problem text not null,
  fix text not null default '',
  status text not null default 'open' check (status in ('open', 'fixed', 'declined')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists pr_craft_notes_run_idx on pr_craft_notes (run_id, chapter_id);

-- ── 7. RLS: read own rows only; all writes via service role ─────────────────
alter table pr_runs enable row level security;
alter table pr_chapter_passes enable row level security;
alter table pr_questions enable row level security;
alter table pr_answers enable row level security;
alter table pr_craft_notes enable row level security;

create policy "read own pr runs" on pr_runs for select using ((select auth.uid()) = user_id);
create policy "read own pr chapter passes" on pr_chapter_passes for select using ((select auth.uid()) = user_id);
create policy "read own pr questions" on pr_questions for select using ((select auth.uid()) = user_id);
create policy "read own pr answers" on pr_answers for select using ((select auth.uid()) = user_id);
create policy "read own pr craft notes" on pr_craft_notes for select using ((select auth.uid()) = user_id);
-- no client write policies: all writes go through API routes (service role)
