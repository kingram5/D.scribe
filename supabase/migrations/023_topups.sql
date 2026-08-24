-- 023: À la carte Voice + Ink top-up packs.
-- Top-up balances live in columns the subscription lifecycle never writes:
-- renewals, dunning freezes, and activateSubscription leave them alone.

alter table ink_balances
  add column if not exists topup_ink numeric not null default 0,
  add column if not exists topup_tts_chars int not null default 0;

create table if not exists topup_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sku text not null check (sku in ('voice_pack', 'ink_pack')),
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  amount_cents int not null,
  granted jsonb not null,
  status text not null default 'granted' check (status in ('granted', 'clawed_back')),
  created_at timestamptz not null default now()
);

alter table topup_purchases enable row level security;

create policy "read own topup purchases"
  on topup_purchases
  for select
  using (auth.uid() = user_id);
-- no client writes: grants and clawbacks go through the Stripe webhook (service role)

create index if not exists topup_purchases_user_id_idx on topup_purchases (user_id);
create index if not exists topup_purchases_payment_intent_idx
  on topup_purchases (stripe_payment_intent)
  where stripe_payment_intent is not null;

-- ── deduct_ink: monthly first, overflow from topup_ink ──────────────────────
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
  v_from_monthly numeric;
  v_from_topup numeric;
begin
  v_ink_cost := (p_input_tokens + p_output_tokens) / 1000.0 * model_ink_factor(p_model);

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

  if v_row.ink_balance + coalesce(v_row.topup_ink, 0) < v_ink_cost then
    raise exception 'Insufficient Ink balance';
  end if;

  v_from_monthly := least(v_row.ink_balance, v_ink_cost);
  v_from_topup := v_ink_cost - v_from_monthly;

  update ink_balances
    set ink_balance = ink_balance - v_from_monthly,
        topup_ink = topup_ink - v_from_topup,
        lifetime_used = lifetime_used + v_ink_cost
    where user_id = p_user_id
    returning ink_balances.ink_balance into v_new_balance;

  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens)
  values (p_user_id, p_project_id, p_operation, p_model, p_input_tokens, p_output_tokens);

  return v_new_balance;
end;
$$ language plpgsql security definer;

-- ── check_and_deduct_tts: monthly first, remainder from topup_tts_chars ─────
create or replace function check_and_deduct_tts(
  p_user_id uuid,
  p_chars integer
) returns jsonb as $$
declare
  v_row ink_balances%rowtype;
  v_limit integer;
  v_monthly_left integer;
  v_from_monthly integer;
  v_from_topup integer;
begin
  select * into v_row
  from ink_balances
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'User not found', 'used', 0, 'limit', 0, 'topup_remaining', 0);
  end if;

  case v_row.tier
    when 'pro'     then v_limit := 20000;
    when 'premium' then v_limit := 60000;
    else                v_limit := 0;   -- free + starter: no monthly TTS
  end case;

  if v_limit > 0 and v_row.tts_period_start < now() - interval '30 days' then
    update ink_balances
    set tts_chars_used = 0,
        tts_period_start = now()
    where user_id = p_user_id;
    v_row.tts_chars_used := 0;
  end if;

  v_monthly_left := greatest(v_limit - v_row.tts_chars_used, 0);
  if v_monthly_left >= p_chars then
    v_from_monthly := p_chars;
    v_from_topup := 0;
  else
    v_from_monthly := v_monthly_left;
    v_from_topup := p_chars - v_monthly_left;
  end if;

  if v_from_topup > coalesce(v_row.topup_tts_chars, 0) then
    return jsonb_build_object(
      'allowed', false,
      'reason', case when v_limit = 0 then 'TTS not available on this plan' else 'TTS limit reached' end,
      'used', v_row.tts_chars_used,
      'limit', v_limit,
      'topup_remaining', coalesce(v_row.topup_tts_chars, 0)
    );
  end if;

  update ink_balances
  set tts_chars_used = tts_chars_used + v_from_monthly,
      topup_tts_chars = topup_tts_chars - v_from_topup
  where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'used', v_row.tts_chars_used + v_from_monthly,
    'remaining', v_limit - (v_row.tts_chars_used + v_from_monthly),
    'topup_remaining', coalesce(v_row.topup_tts_chars, 0) - v_from_topup
  );
end;
$$ language plpgsql security definer;

-- Surface top-up remainders on the same read path checkInk already uses.
create or replace function ensure_ink_balance(
  p_user_id uuid,
  p_email_hashes text[] default null
) returns table (ink_balance numeric, lifetime_used numeric, tier text, topup_ink numeric, topup_tts_chars integer) as $$
declare
  v_row ink_balances%rowtype;
  v_trial numeric := 10.0;
begin
  select * into v_row from ink_balances b where b.user_id = p_user_id for update;

  if not found then
    if p_email_hashes is not null and exists (
      select 1 from deleted_account_emails d where d.email_hash = any(p_email_hashes)
    ) then
      v_trial := 0;
    end if;
    insert into ink_balances (user_id, ink_balance) values (p_user_id, v_trial)
    on conflict (user_id) do nothing;
    select * into v_row from ink_balances b where b.user_id = p_user_id;
  end if;

  if v_row.tier <> 'free'
     and v_row.ink_period_start < now() - interval '30 days' then
    update ink_balances
      set ink_balance = tier_ink_allotment(v_row.tier),
          ink_period_start = now()
      where user_id = p_user_id;
    v_row.ink_balance := tier_ink_allotment(v_row.tier);
  end if;

  return query select v_row.ink_balance, v_row.lifetime_used, v_row.tier,
    coalesce(v_row.topup_ink, 0), coalesce(v_row.topup_tts_chars, 0);
end;
$$ language plpgsql security definer;

-- Flat-cost and reservation paths use the same monthly-then-topup order.
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
  v_from_monthly numeric;
  v_from_topup numeric;
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

  if v_row.ink_balance + coalesce(v_row.topup_ink, 0) < p_ink_cost then
    raise exception 'Insufficient Ink balance';
  end if;

  v_from_monthly := least(v_row.ink_balance, p_ink_cost);
  v_from_topup := p_ink_cost - v_from_monthly;

  update ink_balances
    set ink_balance = ink_balance - v_from_monthly,
        topup_ink = topup_ink - v_from_topup,
        lifetime_used = lifetime_used + p_ink_cost
    where user_id = p_user_id
    returning ink_balances.ink_balance into v_new_balance;

  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, flat_ink_cost)
  values (p_user_id, p_project_id, p_operation, p_model, 0, 0, p_ink_cost);

  return v_new_balance;
end;
$$ language plpgsql security definer;

create or replace function reserve_ink(
  p_user_id uuid,
  p_operation text,
  p_ink_amount numeric
) returns table (reservation_id uuid, ink_balance numeric, lifetime_used numeric, tier text) as $$
declare
  v_row ink_balances%rowtype;
  v_reserved numeric;
  v_id uuid;
begin
  if p_ink_amount <= 0 then raise exception 'Reservation amount must be positive'; end if;
  select * into v_row from ink_balances where user_id = p_user_id for update;
  if not found then raise exception 'Ink balance not initialized'; end if;

  select coalesce(sum(ink_amount), 0) into v_reserved
    from ink_reservations
    where user_id = p_user_id and status = 'active' and expires_at > now();
  if v_row.ink_balance + coalesce(v_row.topup_ink, 0) - v_reserved < p_ink_amount then
    raise exception 'Insufficient Ink balance';
  end if;

  insert into ink_reservations (user_id, operation, ink_amount)
    values (p_user_id, p_operation, p_ink_amount)
    returning id into v_id;
  return query select v_id, v_row.ink_balance, v_row.lifetime_used, v_row.tier;
end;
$$ language plpgsql security definer;

create or replace function settle_ink_reservation(
  p_reservation_id uuid,
  p_project_id uuid,
  p_operation text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_flat_ink_cost numeric default null
) returns numeric as $$
declare
  v_row ink_balances%rowtype;
  v_reservation ink_reservations%rowtype;
  v_other_reserved numeric;
  v_cost numeric;
  v_new_balance numeric;
  v_from_monthly numeric;
  v_from_topup numeric;
begin
  select * into v_reservation from ink_reservations where id = p_reservation_id for update;
  if not found or v_reservation.status <> 'active' or v_reservation.expires_at <= now() then
    raise exception 'Ink reservation is unavailable';
  end if;

  select * into v_row from ink_balances where user_id = v_reservation.user_id for update;
  select coalesce(sum(ink_amount), 0) into v_other_reserved
    from ink_reservations
    where user_id = v_reservation.user_id and id <> p_reservation_id
      and status = 'active' and expires_at > now();
  v_cost := coalesce(p_flat_ink_cost,
    (p_input_tokens + p_output_tokens) / 1000.0 * model_ink_factor(p_model));
  if v_cost < 0 then raise exception 'Negative Ink cost'; end if;
  if v_row.ink_balance + coalesce(v_row.topup_ink, 0) - v_other_reserved < v_cost then
    raise exception 'Insufficient Ink balance';
  end if;

  v_from_monthly := least(v_row.ink_balance, v_cost);
  v_from_topup := v_cost - v_from_monthly;

  update ink_balances
    set ink_balance = ink_balance - v_from_monthly,
        topup_ink = topup_ink - v_from_topup,
        lifetime_used = lifetime_used + v_cost
    where user_id = v_reservation.user_id
    returning ink_balance into v_new_balance;
  update ink_reservations set status = 'settled', settled_at = now() where id = p_reservation_id;
  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, flat_ink_cost)
    values (v_reservation.user_id, p_project_id, p_operation, p_model,
      coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), p_flat_ink_cost);
  return v_new_balance;
end;
$$ language plpgsql security definer;

revoke execute on function deduct_ink(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant  execute on function deduct_ink(uuid, uuid, text, text, integer, integer) to service_role;
revoke execute on function check_and_deduct_tts(uuid, integer) from public, anon, authenticated;
grant  execute on function check_and_deduct_tts(uuid, integer) to service_role;
revoke execute on function ensure_ink_balance(uuid, text[]) from public, anon, authenticated;
grant  execute on function ensure_ink_balance(uuid, text[]) to service_role;
revoke execute on function deduct_ink_flat(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant  execute on function deduct_ink_flat(uuid, uuid, text, text, numeric) to service_role;
revoke execute on function reserve_ink(uuid, text, numeric) from public, anon, authenticated;
grant  execute on function reserve_ink(uuid, text, numeric) to service_role;
revoke execute on function settle_ink_reservation(uuid, uuid, text, text, integer, integer, numeric) from public, anon, authenticated;
grant  execute on function settle_ink_reservation(uuid, uuid, text, text, integer, integer, numeric) to service_role;
