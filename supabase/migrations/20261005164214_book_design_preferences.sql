-- Additive preferences only; chapter generation and manuscript text are untouched.
-- Existing projects RLS continues to enforce ownership on these columns.
alter table public.projects
  add column if not exists page_style text check (page_style in ('classic','modern','warm','bold')),
  add column if not exists chapter_opening text check (chapter_opening in ('numeral','dropcap','minimal','divider')),
  add column if not exists back_cover_hook text check (char_length(back_cover_hook) <= 1200),
  add column if not exists book_hook_options jsonb not null default '[]'::jsonb check (jsonb_typeof(book_hook_options) = 'array');
