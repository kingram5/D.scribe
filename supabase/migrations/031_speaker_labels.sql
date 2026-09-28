-- 031: Speaker labels (Kyle 2026-09-27). ADDITIVE ONLY, safe to apply anytime.
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
