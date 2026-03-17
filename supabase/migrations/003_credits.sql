-- Credit system: 1 job = 1 credit
-- New users get 10 free credits
-- Admin can override via usage_overrides

create table user_credits (
  user_id uuid primary key,
  balance integer not null default 10,
  lifetime_used integer not null default 0,
  lifetime_purchased integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table usage_overrides (
  user_id uuid primary key,
  daily_job_limit integer,
  bonus_credits integer not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);

create trigger trg_user_credits_updated_at
  before update on user_credits
  for each row execute function update_updated_at();

-- RLS
alter table user_credits enable row level security;
alter table usage_overrides enable row level security;

create policy "Users can read own credits"
  on user_credits for select
  using (user_id = auth.uid());

-- Only service role can insert/update credits (server-side only)
-- No insert/update policy for users — prevents client-side tampering

create policy "Service role manages overrides"
  on usage_overrides for all
  using (true)
  with check (true);

-- Atomic credit decrement (prevents race conditions)
create or replace function decrement_credit(uid uuid)
returns void as $$
begin
  update user_credits
  set balance = balance - 1,
      lifetime_used = lifetime_used + 1
  where user_id = uid
    and balance > 0;
end;
$$ language plpgsql security definer;
