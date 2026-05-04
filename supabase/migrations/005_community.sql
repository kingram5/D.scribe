alter table projects
  add column if not exists is_public boolean not null default false,
  add column if not exists published_excerpt text,
  add column if not exists published_author text;

create policy "Public projects are readable by anyone"
  on projects for select
  using (is_public = true);
