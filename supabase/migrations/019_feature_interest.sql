-- 019: Feature-interest polling ("Notify me" teasers). First use: the hardcover
-- coming-soon card on the Export step (2026-08-08) — pre-polls demand for printed
-- copies before the hardcover/gift lane gets built.

create table if not exists feature_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, feature)
);

-- Deny-all to clients; the app server (service role) does all reads/writes via
-- /api/feature-interest, which authenticates the user first.
alter table feature_interest enable row level security;

create index if not exists feature_interest_feature_idx on feature_interest (feature);
