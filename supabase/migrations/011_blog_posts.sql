-- Migration 011: Blog posts for CMO content pipeline

create table blog_posts (
  id              uuid        primary key default gen_random_uuid(),
  slug            text        unique not null,
  title           text        not null,
  excerpt         text,
  content         text        not null,
  keywords        text[],
  seo_title       text,
  seo_description text,
  published       boolean     not null default false,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index blog_posts_published_idx on blog_posts (published, published_at desc);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger blog_posts_updated_at
  before update on blog_posts
  for each row execute function set_updated_at();
