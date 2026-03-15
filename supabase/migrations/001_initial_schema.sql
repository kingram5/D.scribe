-- Manuscript App — Initial Schema
-- Run via Supabase Dashboard > SQL Editor

-- ============================================================
-- PROJECTS
-- ============================================================
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Untitled Project',
  description text not null default '',
  audience text not null default 'General'
    check (audience in ('General', 'Academic', 'Faith Community', 'Business/Leadership', 'Self-Help', 'Young Adult')),
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'complete')),
  voice_profile jsonb,
  narrative_tracker jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- AUDIO UPLOADS
-- ============================================================
create table audio_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  duration_seconds real,
  file_size_bytes bigint,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'transcribing', 'transcribed', 'failed')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- TRANSCRIPTS
-- ============================================================
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  audio_upload_id uuid not null references audio_uploads(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  full_text text not null,
  segments jsonb not null default '[]',
  word_count integer not null default 0,
  speaker_count integer not null default 1,
  created_at timestamptz not null default now()
);

-- ============================================================
-- KEY POINTS
-- ============================================================
create table key_points (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  transcript_id uuid references transcripts(id) on delete set null,
  title text not null,
  summary text not null,
  supporting_quotes jsonb not null default '[]',
  tags jsonb not null default '[]',
  relevance_score real not null default 0.8,
  covered_in_chapter uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- MIND MAP NODES & EDGES
-- ============================================================
create table mind_map_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  description text not null default '',
  node_type text not null default 'subtopic'
    check (node_type in ('topic', 'subtopic', 'quote', 'scripture', 'illustration')),
  position_x real not null default 0,
  position_y real not null default 0,
  parent_id uuid references mind_map_nodes(id) on delete set null,
  key_point_id uuid references key_points(id) on delete set null
);

create table mind_map_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_id uuid not null references mind_map_nodes(id) on delete cascade,
  target_id uuid not null references mind_map_nodes(id) on delete cascade,
  label text not null default '',
  edge_type text not null default 'related'
    check (edge_type in ('related', 'supports', 'contradicts', 'leads_to'))
);

-- ============================================================
-- CHAPTERS
-- ============================================================
create table chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  chapter_number integer not null,
  title text not null,
  summary text not null default '',
  key_point_ids jsonb not null default '[]',
  target_word_count integer not null default 3000,
  status text not null default 'outlined'
    check (status in ('outlined', 'generating', 'generated', 'edited')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, chapter_number)
);

-- Link key points back to chapters
alter table key_points
  add constraint fk_covered_in_chapter
  foreign key (covered_in_chapter) references chapters(id) on delete set null;

-- ============================================================
-- CHAPTER CONTENT (versioned)
-- ============================================================
create table chapter_contents (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  content text not null default '',
  word_count integer not null default 0,
  generation_params jsonb not null default '{}',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, version)
);

-- ============================================================
-- ENRICHMENTS
-- ============================================================
create table enrichments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  quote_text text not null,
  source_author text not null,
  source_title text not null,
  source_type text not null default 'book'
    check (source_type in ('book', 'article', 'scripture', 'speech', 'research')),
  relevance_note text not null default '',
  included boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_audio_uploads_project on audio_uploads(project_id);
create index idx_transcripts_project on transcripts(project_id);
create index idx_key_points_project on key_points(project_id);
create index idx_mind_map_nodes_project on mind_map_nodes(project_id);
create index idx_mind_map_edges_project on mind_map_edges(project_id);
create index idx_chapters_project on chapters(project_id);
create index idx_chapter_contents_chapter on chapter_contents(chapter_id);
create index idx_enrichments_chapter on enrichments(chapter_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

create trigger trg_chapters_updated_at
  before update on chapters
  for each row execute function update_updated_at();

create trigger trg_chapter_contents_updated_at
  before update on chapter_contents
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (basic — project owner only)
-- ============================================================
alter table projects enable row level security;
alter table audio_uploads enable row level security;
alter table transcripts enable row level security;
alter table key_points enable row level security;
alter table mind_map_nodes enable row level security;
alter table mind_map_edges enable row level security;
alter table chapters enable row level security;
alter table chapter_contents enable row level security;
alter table enrichments enable row level security;

-- Policy: users can only access their own projects and related data
create policy "Users can CRUD own projects"
  on projects for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can CRUD own audio_uploads"
  on audio_uploads for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can CRUD own transcripts"
  on transcripts for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can CRUD own key_points"
  on key_points for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can CRUD own mind_map_nodes"
  on mind_map_nodes for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can CRUD own mind_map_edges"
  on mind_map_edges for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can CRUD own chapters"
  on chapters for all
  using (project_id in (select id from projects where user_id = auth.uid()))
  with check (project_id in (select id from projects where user_id = auth.uid()));

create policy "Users can CRUD own chapter_contents"
  on chapter_contents for all
  using (chapter_id in (
    select c.id from chapters c
    join projects p on c.project_id = p.id
    where p.user_id = auth.uid()
  ))
  with check (chapter_id in (
    select c.id from chapters c
    join projects p on c.project_id = p.id
    where p.user_id = auth.uid()
  ));

create policy "Users can CRUD own enrichments"
  on enrichments for all
  using (chapter_id in (
    select c.id from chapters c
    join projects p on c.project_id = p.id
    where p.user_id = auth.uid()
  ))
  with check (chapter_id in (
    select c.id from chapters c
    join projects p on c.project_id = p.id
    where p.user_id = auth.uid()
  ));
