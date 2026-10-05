-- Optional author guidance captured while Analysis runs. Original transcripts stay intact.
create table if not exists public.analysis_moments (
  project_id uuid not null references public.projects(id) on delete cascade,
  card_id text not null check (length(card_id) <= 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  excerpt text not null check (length(excerpt) <= 12000),
  speaker text not null,
  importance text not null check (importance in ('essential', 'supporting', 'exclude')),
  context text not null default '' check (length(context) <= 6000),
  clarification_answer text not null default '' check (length(clarification_answer) <= 3000),
  updated_at timestamptz not null default now(),
  primary key (project_id, card_id)
);
create index if not exists analysis_moments_user_id_idx on public.analysis_moments(user_id);
create index if not exists analysis_moments_transcript_id_idx on public.analysis_moments(transcript_id);
alter table public.analysis_moments enable row level security;
grant select, insert, update on public.analysis_moments to authenticated;
grant all on public.analysis_moments to service_role;
create policy "Authors read their own analysis choices" on public.analysis_moments
  for select to authenticated using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())
    )
  );
create policy "Authors save their own analysis choices" on public.analysis_moments
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.projects p join public.transcripts t on t.project_id = p.id
      where p.id = analysis_moments.project_id and p.user_id = (select auth.uid()) and t.id = analysis_moments.transcript_id
    )
  );
create policy "Authors update their own analysis choices" on public.analysis_moments
  for update to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.projects p join public.transcripts t on t.project_id = p.id
      where p.id = analysis_moments.project_id and p.user_id = (select auth.uid()) and t.id = analysis_moments.transcript_id
    )
  );
