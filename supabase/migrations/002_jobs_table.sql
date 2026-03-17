-- Job queue for long-running AI operations
-- Supports: analyze, outline, generate, coherence

create table jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null
    check (type in ('analyze', 'outline', 'generate', 'coherence')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  input jsonb not null default '{}',
  result jsonb,
  error text,
  progress jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_jobs_project on jobs(project_id);
create index idx_jobs_status on jobs(status);

create trigger trg_jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();

-- RLS: users can only see jobs for their own projects
alter table jobs enable row level security;

create policy "Users can CRUD own jobs"
  on jobs for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

-- Service role bypasses RLS, so server-side workers can update freely
