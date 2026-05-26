-- 012: Per-billing-cycle Ink reset (no rollover) + gate TTS to Pro/Premium.
--
-- Ink model change: a subscriber's Ink RESETS to their tier allotment each
-- billing cycle instead of carrying forward. Two mechanisms (A+B):
--   A) billing-aligned: the Stripe webhook resets on invoice.payment_succeeded
--      (see api/stripe/webhook/route.ts) and advances ink_period_start.
--   B) lazy safety-net (this file): deduct_ink refills to the tier allotment if
--      the period is >30 days stale — so a missed renewal webhook can't strand
--      a paying user. Mirrors the existing check_and_deduct_tts pattern.
--
-- TTS change: Starter is gated out of voice (limit 0); only Pro/Premium get TTS.

-- ── 1. Track the Ink billing period (mirrors tts_period_start) ──────────────
alter table ink_balances
  add column if not exists ink_period_start timestamptz not null default now();

-- ── 2. Per-tier Ink allotment (single source of truth in SQL) ───────────────
create or replace function tier_ink_allotment(p_tier text) returns numeric as $$
begin
  case p_tier
    when 'starter' then return 300;
    when 'pro'     then return 660;
    when 'premium' then return 1500;
    when 'free'    then return 10;   -- one-time trial; never refilled (see below)
    else                return 0;
  end case;
end;
$$ language plpgsql immutable;

-- ── 3. Reset-aware deduct_ink: lazy refill to allotment, no rollover ─────────
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
begin
  v_ink_cost := (p_input_tokens + p_output_tokens) / 1000.0;

  select * into v_row from ink_balances where user_id = p_user_id;

  if not found then
    insert into ink_balances (user_id, ink_balance) values (p_user_id, 10.0);
    select * into v_row from ink_balances where user_id = p_user_id;
  end if;

  -- Lazy period reset for PAID tiers only (free trial never refills).
  -- Refill to the tier allotment with NO carryover of unused Ink.
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
    where user_id = p_user_id;

  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens)
  values (p_user_id, p_project_id, p_operation, p_model, p_input_tokens, p_output_tokens);

  return v_row.ink_balance - v_ink_cost;
end;
$$ language plpgsql security definer;

-- ── 4. Gate TTS: Starter joins free at 0 chars (Pro/Premium only) ───────────
create or replace function check_and_deduct_tts(
  p_user_id uuid,
  p_chars integer
) returns jsonb as $$
declare
  v_row ink_balances%rowtype;
  v_limit integer;
begin
  select * into v_row
  from ink_balances
  where user_id = p_user_id;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'User not found', 'used', 0, 'limit', 0);
  end if;

  case v_row.tier
    when 'pro'     then v_limit := 20000;
    when 'premium' then v_limit := 60000;
    else                v_limit := 0;   -- free + starter: no TTS
  end case;

  if v_limit = 0 then
    return jsonb_build_object('allowed', false, 'reason', 'TTS not available on this plan', 'used', 0, 'limit', 0);
  end if;

  if v_row.tts_period_start < now() - interval '30 days' then
    update ink_balances
    set tts_chars_used = 0,
        tts_period_start = now()
    where user_id = p_user_id;
    v_row.tts_chars_used := 0;
  end if;

  if v_row.tts_chars_used + p_chars > v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'TTS limit reached',
      'used', v_row.tts_chars_used,
      'limit', v_limit
    );
  end if;

  update ink_balances
  set tts_chars_used = tts_chars_used + p_chars
  where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'remaining', v_limit - (v_row.tts_chars_used + p_chars)
  );
end;
$$ language plpgsql security definer;
