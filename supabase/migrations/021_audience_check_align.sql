-- 021: align projects.audience CHECK with the 16 audiences the UI actually offers.
--
-- The constraint permitted only 6 values (General, Academic, Faith Community,
-- Business/Leadership, Self-Help, Young Adult) while src/lib/audience-profiles.ts
-- offers 16. Eleven of the pickers on /project/new therefore returned 500 from
-- POST /api/project, including "Christian Living", "Leadership" and
-- "Memoir & Biography". Project creation was blocked for those readers.
--
-- 'Business/Leadership' is retained so existing rows carrying it stay valid; it is
-- no longer offered in the UI.

alter table public.projects
  drop constraint if exists projects_audience_check;

alter table public.projects
  add constraint projects_audience_check
  check (audience = any (array[
    'General',
    'Christian Living',
    'Faith Community',
    'Leadership',
    'Business & Economics',
    'Self-Help',
    'Personal Development',
    'Health & Wellness',
    'Relationships & Family',
    'Parenting',
    'Memoir & Biography',
    'Lifestyle',
    'Psychology & Motivation',
    'Money & Finance',
    'Young Adult',
    'Academic',
    'Business/Leadership'
  ]::text[]));
