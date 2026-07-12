-- Migration 016: Editorial Memory
--
-- Captures what users change in generated chapters and distills it into a
-- per-user style memory that future generations apply proactively. Three tables:
--
--   edit_events       — instruction-carrying edits (Magic Edit / Rewrite bar):
--                       the user's own words about what was wrong + before/after
--   style_deltas      — generated-vs-edited sentence diffs from manual saves
--   user_style_memory — the distilled per-user memory injected into generation
--
-- All writes happen server-side via the service role; RLS restricts the anon /
-- authenticated paths to owner-read-only (no client writes to any of these).

create table if not exists edit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  kind text not null check (kind in ('magic_edit', 'rewrite_bar', 'manual_save')),
  instruction text not null default '',
  before_text text not null default '',
  after_text text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists style_deltas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  from_version integer not null,
  to_version integer not null,
  delta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists user_style_memory (
  user_id uuid primary key,
  memory jsonb not null default '{}',
  edits_since_distill integer not null default 0,
  distill_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_edit_events_user on edit_events(user_id, created_at desc);
create index if not exists idx_style_deltas_user on style_deltas(user_id, created_at desc);

alter table edit_events enable row level security;
alter table style_deltas enable row level security;
alter table user_style_memory enable row level security;

-- Owner read-only; all writes go through the service role (bypasses RLS)
create policy "Users read own edit_events"
  on edit_events for select
  using (user_id = auth.uid());

create policy "Users read own style_deltas"
  on style_deltas for select
  using (user_id = auth.uid());

create policy "Users read own style_memory"
  on user_style_memory for select
  using (user_id = auth.uid());
