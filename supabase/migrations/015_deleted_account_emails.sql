-- 015: Trail of deleted accounts (email hash only — no PII) so the free-trial
-- grant can refuse re-signup farming (delete account -> re-signup -> fresh 10 Ink).
-- Written 2026-07-01 as part of pre-launch signup hardening.

create table if not exists deleted_account_emails (
  email_hash text primary key,          -- sha256 hex of lowercased email
  deleted_at timestamptz not null default now()
);

-- Deny-all to clients; only the service role (app server) reads/writes this.
alter table deleted_account_emails enable row level security;
