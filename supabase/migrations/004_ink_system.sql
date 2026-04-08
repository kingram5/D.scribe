-- Ink usage tracking system
-- 1 Ink = 1,000 tokens
-- Replaces the simple credit system with granular token tracking

-- Per-call usage log
create table ink_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references projects(id) on delete set null,
  operation text not null, -- 'brainstorm', 'brainstorm_summarize', 'analyze', 'voice_profile', 'mind_map', 'outline', 'generate', 'rewrite', 'coherence'
  model text not null, -- 'haiku', 'sonnet'
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer generated always as (input_tokens + output_tokens) stored,
  ink_cost numeric(10,4) generated always as ((input_tokens + output_tokens) / 1000.0) stored,
  created_at timestamptz not null default now()
);

create index idx_ink_usage_user on ink_usage(user_id);
create index idx_ink_usage_user_created on ink_usage(user_id, created_at desc);

-- User ink balances
create table ink_balances (
  user_id uuid primary key,
  ink_balance numeric(10,4) not null default 10.0, -- free trial: 10 Ink
  lifetime_used numeric(10,4) not null default 0,
  tier text not null default 'free', -- 'free', 'starter', 'pro', 'premium'
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_ink_balances_updated_at
  before update on ink_balances
  for each row execute function update_updated_at();

-- RLS
alter table ink_usage enable row level security;
alter table ink_balances enable row level security;

create policy "Users can read own usage"
  on ink_usage for select
  using (user_id = auth.uid());

create policy "Users can read own balance"
  on ink_balances for select
  using (user_id = auth.uid());

-- Atomic ink deduction with usage logging
create or replace function deduct_ink(
  p_user_id uuid,
  p_project_id uuid,
  p_operation text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
) returns numeric as $$
declare
  v_ink_cost numeric;
  v_balance numeric;
begin
  v_ink_cost := (p_input_tokens + p_output_tokens) / 1000.0;

  -- Check balance
  select ink_balance into v_balance
  from ink_balances
  where user_id = p_user_id;

  if v_balance is null then
    -- New user, create with free trial
    insert into ink_balances (user_id, ink_balance)
    values (p_user_id, 10.0);
    v_balance := 10.0;
  end if;

  if v_balance < v_ink_cost then
    raise exception 'Insufficient Ink balance';
  end if;

  -- Deduct
  update ink_balances
  set ink_balance = ink_balance - v_ink_cost,
      lifetime_used = lifetime_used + v_ink_cost
  where user_id = p_user_id;

  -- Log usage
  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens)
  values (p_user_id, p_project_id, p_operation, p_model, p_input_tokens, p_output_tokens);

  return v_balance - v_ink_cost;
end;
$$ language plpgsql security definer;
