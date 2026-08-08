-- 020: Google Drive OAuth tokens for Export-to-Drive (2026-08-08).
-- One row per user; refresh_token is the durable credential (access tokens are
-- re-minted server-side as needed). drive.file scope only — the app can touch
-- files it created, nothing else in the user's Drive.

create table if not exists google_drive_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deny-all to clients; only the app server (service role) reads/writes,
-- and every route authenticates the user before touching a row.
alter table google_drive_tokens enable row level security;
