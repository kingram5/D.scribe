-- 024: T.H.E.O's background research corpus.
-- Keyed by project (not brainstorm session) so research survives across talks.

create table research_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('quote', 'stat', 'reference')),
  text text not null,
  attribution text,
  source_title text not null,
  source_url text not null,
  source_date text,
  themes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'dismissed')),
  created_at timestamptz not null default now()
);
create index research_items_project on research_items (project_id) where (status = 'active');

create table research_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'skipped')),
  topic_summary text,
  queries jsonb,
  items_added int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index research_jobs_project on research_jobs (project_id, created_at desc);

alter table research_items enable row level security;
alter table research_jobs enable row level security;
create policy "read own research items" on research_items
  for select using (auth.uid() = user_id);
create policy "read own research jobs" on research_jobs
  for select using (auth.uid() = user_id);
-- no client write policies: all writes go through API routes (service role)
