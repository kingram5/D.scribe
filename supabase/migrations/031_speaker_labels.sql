-- 031: Speaker labels + voice picker (Kyle 2026-09-27). ADDITIVE ONLY, safe to apply anytime.
--
-- Transcription splits recordings into "Speaker 0/1/…". The author labels each
-- speaker at the transcript step (the book's author, or someone else + how
-- they relate), and every later step reads the labels so the interviewer and
-- the writer never mistake someone else's words for the author's.
-- A NULL speaker_map means "unlabeled": the app behaves exactly as before.

alter table transcripts
  add column if not exists speaker_map jsonb,            -- { "Speaker 0": {"role":"author"}, "Speaker 1": {"role":"other","name":"…","relationship":"…"} }
  add column if not exists speakers_confirmed_at timestamptz;

alter table key_points
  add column if not exists speaker_role text check (speaker_role in ('author', 'other', 'mixed')),
  add column if not exists speaker_name text;

-- Brainstorm sessions are saved with fixed labels (Author / Interviewer):
-- label them now so the author is never asked about them.
update transcripts
set speaker_map = '{"Author":{"role":"author"},"Interviewer":{"role":"other","name":"T.H.E.O.","relationship":"the D.Scribe interviewer"}}'::jsonb,
    speakers_confirmed_at = now()
where speaker_map is null
  and segments @> '[{"speaker":"Author"}]'::jsonb;

-- ── Voice picker (Kyle 2026-09-27) ──────────────────────────────────────────
-- "Which would you actually say out loud?" Each pair rewrites one real sentence
-- two ways that differ on ONE style dimension; picks move per-author dials that
-- the writer follows. One anchor pair (their spoken words vs a polished
-- rewrite) measures how much they drift toward polish, so the other picks can
-- be discounted. Account level: done once per author, refined over time.

create table if not exists user_voice_dials (
  user_id uuid primary key,
  dials jsonb not null default '{}',          -- { "length": -0.7, "formality": 0.4, ... } in [-1, 1]
  polish_bias numeric not null default 0,     -- share of anchor pairs where they chose the polished version
  rewrites jsonb not null default '[]',       -- their own "neither, I'd say it like this" lines
  picks integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists voice_pairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references projects(id) on delete set null,
  dimension text not null,                    -- length | formality | directness | imagery | order | texture | anchor
  source_sentence text not null,
  option_a text not null,
  option_b text not null,
  a_pole text not null,                       -- which pole option A leans toward (e.g. "short", "spoken")
  choice text check (choice in ('a', 'b', 'neither')),
  rewrite text,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists voice_pairs_user_idx on voice_pairs (user_id, answered_at);

alter table user_voice_dials enable row level security;
alter table voice_pairs enable row level security;
create policy "read own voice dials" on user_voice_dials for select using ((select auth.uid()) = user_id);
create policy "read own voice pairs" on voice_pairs for select using ((select auth.uid()) = user_id);
-- no client write policies: all writes go through API routes (service role)
