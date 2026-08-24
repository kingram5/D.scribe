-- 022: Server-side brainstorm pause/resume.
-- One ACTIVE conversation per project. Writes go through API routes (service
-- role); clients may only read their own rows.

create table brainstorm_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  messages jsonb not null default '[]',
  status text not null default 'active'
    check (status in ('active', 'finished', 'discarded')),
  turn_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index brainstorm_sessions_one_active
  on brainstorm_sessions (project_id) where (status = 'active');

create index brainstorm_sessions_user_id_idx
  on brainstorm_sessions (user_id);

alter table brainstorm_sessions enable row level security;

create policy "read own brainstorm sessions"
  on brainstorm_sessions
  for select
  using (auth.uid() = user_id);
-- no client insert/update policy: all writes go through API routes (service role)
