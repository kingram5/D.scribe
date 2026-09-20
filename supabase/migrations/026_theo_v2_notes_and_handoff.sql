-- 026: Theo v2. The interviewer keeps a private notebook during a session and
-- leaves a handoff for the next one. All additive, all nullable: old rows and
-- old clients are unaffected.

alter table brainstorm_sessions
  add column if not exists notes jsonb,     -- Theo's running notes (src/lib/theo/notes.ts TheoNotes)
  add column if not exists handoff jsonb,   -- written at Finish: strongest line, open thread, next question
  add column if not exists recap jsonb;     -- the end-of-session card shown to the author

-- The book's subject in the author's own terms. Anchors every later session so
-- a returning author's "let's pick up where we left off" never becomes the topic.
alter table projects
  add column if not exists brainstorm_topic text;

-- Returning authors: newest finished sessions first.
create index if not exists brainstorm_sessions_finished_idx
  on brainstorm_sessions (project_id, updated_at desc) where (status = 'finished');
