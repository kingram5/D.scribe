-- 017: Ink concurrency, model-aware pricing, reachable refill, webhook retry.
--
-- Fixes from the 2026-08-02 edge-test campaign (fix/edge-test-80):
--   #11 deduct_ink read its guard from an unlocked snapshot, so concurrent
--       deducts drove balances negative. The row is now SELECT ... FOR UPDATE
--       and the returned balance comes from the UPDATE itself, not stale math.
--   #12 Ink cost ignored p_model — haiku and sonnet billed identically.
--       Cost now scales by model_ink_factor(): quality/sonnet keeps the legacy
--       rate (no existing price moves), fast/haiku bills at 0.25x, matching
--       the rough API cost ratio. ink_usage.ink_cost is regenerated with the
--       same factor so history and live billing agree.
--   #13 the lazy period refill lived only inside deduct_ink, which the
--       pre-flight gate makes unreachable for exactly the stranded user it
--       was written for. ensure_ink_balance() applies the same refill on the
--       read path, and is now the single place wallet-creation policy lives.
--   #15 deduct_ink's not-found fallback minted a fresh 10-Ink wallet with no
--       anti-farming check. It now creates an EMPTY wallet only — trial grants
--       happen solely in ensure_ink_balance with the deleted-email check.
--   #9  stripe_events gains a processed flag so a handler failure can be
--       retried by Stripe instead of short-circuiting at the idempotency check.
--   #30 deduct_ink_flat() lets non-token vendor costs (Deepgram minutes,
--       Supadata videos) settle through the same locked, logged path.

-- ── 1. Model pricing factor ─────────────────────────────────────────────────
create or replace function model_ink_factor(p_model text) returns numeric as $$
begin
  case p_model
    when 'haiku'  then return 0.25;
    when 'sonnet' then return 1.0;
    else               return 1.0;  -- unknown models bill at the quality rate
  end case;
end;
$$ language plpgsql immutable;

-- Regenerate the stored cost column with the model factor.
alter table ink_usage drop column if exists ink_cost;
alter table ink_usage add column ink_cost numeric(10,4) generated always as (
  case
    when model = 'haiku' then (input_tokens + output_tokens) / 1000.0 * 0.25
    else (input_tokens + output_tokens) / 1000.0
  end
) stored;

-- Flat (non-token) vendor costs land with tokens = 0; store the explicit cost.
alter table ink_usage add column if not exists flat_ink_cost numeric(10,4);

-- ── 2. Wallet creation + lazy refill, one policy, reachable from reads ──────
create or replace function ensure_ink_balance(
  p_user_id uuid,
  p_email_hashes text[] default null  -- sha256 hashes to check against deleted_account_emails
) returns table (ink_balance numeric, lifetime_used numeric, tier text) as $$
declare
  v_row ink_balances%rowtype;
  v_trial numeric := 10.0;
begin
  select * into v_row from ink_balances b where b.user_id = p_user_id for update;

  if not found then
    -- Anti-farming: no trial if any supplied hash matches a deleted account.
    if p_email_hashes is not null and exists (
      select 1 from deleted_account_emails d where d.email_hash = any(p_email_hashes)
    ) then
      v_trial := 0;
    end if;
    insert into ink_balances (user_id, ink_balance) values (p_user_id, v_trial)
    on conflict (user_id) do nothing;
    select * into v_row from ink_balances b where b.user_id = p_user_id;
  end if;

  -- Same lazy refill deduct_ink applies, so a paying user stranded by a missed
  -- renewal webhook is refilled by the very read that would have blocked them.
  if v_row.tier <> 'free'
     and v_row.ink_period_start < now() - interval '30 days' then
    update ink_balances
      set ink_balance = tier_ink_allotment(v_row.tier),
          ink_period_start = now()
      where user_id = p_user_id;
    v_row.ink_balance := tier_ink_allotment(v_row.tier);
  end if;

  return query select v_row.ink_balance, v_row.lifetime_used, v_row.tier;
end;
$$ language plpgsql security definer;

-- ── 3. Concurrency-safe deduct_ink ──────────────────────────────────────────
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
  v_row ink_balances%rowtype;
  v_new_balance numeric;
begin
  v_ink_cost := (p_input_tokens + p_output_tokens) / 1000.0 * model_ink_factor(p_model);

  -- FOR UPDATE: concurrent deducts serialize here instead of both reading the
  -- same stale balance and driving it negative.
  select * into v_row from ink_balances where user_id = p_user_id for update;

  if not found then
    -- No wallet mid-operation is a bug upstream; create an EMPTY one (trial
    -- grants live in ensure_ink_balance behind the anti-farming check) and let
    -- the balance guard below raise.
    insert into ink_balances (user_id, ink_balance) values (p_user_id, 0)
    on conflict (user_id) do nothing;
    select * into v_row from ink_balances where user_id = p_user_id for update;
  end if;

  if v_row.tier <> 'free'
     and v_row.ink_period_start < now() - interval '30 days' then
    update ink_balances
      set ink_balance = tier_ink_allotment(v_row.tier),
          ink_period_start = now()
      where user_id = p_user_id;
    v_row.ink_balance := tier_ink_allotment(v_row.tier);
  end if;

  if v_row.ink_balance < v_ink_cost then
    raise exception 'Insufficient Ink balance';
  end if;

  update ink_balances
    set ink_balance = ink_balance - v_ink_cost,
        lifetime_used = lifetime_used + v_ink_cost
    where user_id = p_user_id
    returning ink_balances.ink_balance into v_new_balance;

  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens)
  values (p_user_id, p_project_id, p_operation, p_model, p_input_tokens, p_output_tokens);

  -- Live post-update balance, not arithmetic on the pre-lock snapshot.
  return v_new_balance;
end;
$$ language plpgsql security definer;

-- ── 4. Flat-cost deduct for non-token vendors (Deepgram, Supadata) ──────────
create or replace function deduct_ink_flat(
  p_user_id uuid,
  p_project_id uuid,
  p_operation text,
  p_model text,
  p_ink_cost numeric
) returns numeric as $$
declare
  v_row ink_balances%rowtype;
  v_new_balance numeric;
begin
  if p_ink_cost < 0 then
    raise exception 'Negative Ink cost';
  end if;

  select * into v_row from ink_balances where user_id = p_user_id for update;

  if not found then
    insert into ink_balances (user_id, ink_balance) values (p_user_id, 0)
    on conflict (user_id) do nothing;
    select * into v_row from ink_balances where user_id = p_user_id for update;
  end if;

  if v_row.tier <> 'free'
     and v_row.ink_period_start < now() - interval '30 days' then
    update ink_balances
      set ink_balance = tier_ink_allotment(v_row.tier),
          ink_period_start = now()
      where user_id = p_user_id;
    v_row.ink_balance := tier_ink_allotment(v_row.tier);
  end if;

  if v_row.ink_balance < p_ink_cost then
    raise exception 'Insufficient Ink balance';
  end if;

  update ink_balances
    set ink_balance = ink_balance - p_ink_cost,
        lifetime_used = lifetime_used + p_ink_cost
    where user_id = p_user_id
    returning ink_balances.ink_balance into v_new_balance;

  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, flat_ink_cost)
  values (p_user_id, p_project_id, p_operation, p_model, 0, 0, p_ink_cost);

  return v_new_balance;
end;
$$ language plpgsql security definer;

-- ── 5. Atomic edit-counter bump (style memory) ──────────────────────────────
-- The TS read-then-upsert lost increments when two saves landed together.
create or replace function bump_edit_counter(
  p_user_id uuid,
  p_threshold integer
) returns boolean as $$
declare
  v_count integer;
begin
  insert into user_style_memory (user_id, edits_since_distill, updated_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set edits_since_distill = user_style_memory.edits_since_distill + 1,
        updated_at = now()
  returning edits_since_distill into v_count;
  return v_count >= p_threshold;
end;
$$ language plpgsql security definer;

-- ── 6. Stripe event retry support ───────────────────────────────────────────
alter table stripe_events add column if not exists processed boolean not null default false;
-- Existing rows predate the flag and were handled under the old code path.
update stripe_events set processed = true where processed = false;
