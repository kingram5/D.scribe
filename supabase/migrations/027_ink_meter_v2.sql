-- 027: Ink meter v2. Cost-plus at one multiplier, across every feature.
--
-- WHY. The v1 meter bills (input + output tokens) / 1000 x a per-model factor.
-- It was tuned on chapter generation, which is mostly OUTPUT. Input tokens cost
-- a fifth as much as output, and cached input a fiftieth, so v1 over-bills any
-- read-heavy feature: measured 2026-09-19, chapter writing ran ~10x vendor cost
-- while a brainstorm turn (98% input) ran ~26x. Moving the interviewer to the
-- quality model under v1 would have made one book cost ~970 Ink against a
-- 300 Ink Starter plan, on about $2 of real spend.
--
-- WHAT. Ink = real vendor dollars x ONE multiplier, with input, output, cache
-- reads and cache writes each priced at what they actually cost.
--   Kyle, 2026-09-19: Starter (300 Ink, $25) should cover about 1.5 books a
--   month on the new stack => ~200 Ink per book => multiplier 102 (measured; first estimate was 91) (about 7.6x
--   cost on Starter, 6.9x Pro, 6.1x Premium, since bigger plans discount Ink).
-- A vendor price change is one row in ink_rates. A margin change is one row in
-- ink_meter_settings. Neither needs a migration.
--
-- SAFETY. Entirely additive. The v1 functions are untouched and remain the
-- live path. The app calls the *_v2 functions only when INK_METER_V2=true, which
-- is set on Preview first. Old ink_usage rows keep their v1 cost forever.

create table if not exists ink_meter_settings (
  key text primary key,
  value numeric not null,
  note text
);
alter table ink_meter_settings enable row level security; -- service role only

insert into ink_meter_settings (key, value, note) values
  ('ink_per_vendor_dollar', 102, 'Ink charged per $1 of real vendor cost. 102 = measured book cost $1.96 lands on 200 Ink, so Starter covers 1.5 books/month (Kyle 2026-09-20, set from the eval run).')
on conflict (key) do nothing;

-- Vendor list prices in US dollars per MILLION tokens.
create table if not exists ink_rates (
  model text primary key,            -- the p_model values the app already sends: 'sonnet', 'haiku'
  usd_in numeric not null,
  usd_out numeric not null,
  usd_cache_read numeric not null,   -- 0.1x input
  usd_cache_write numeric not null,  -- 2x input: the interviewer uses the 1-hour cache
  note text
);
alter table ink_rates enable row level security; -- service role only

insert into ink_rates (model, usd_in, usd_out, usd_cache_read, usd_cache_write, note) values
  ('sonnet', 3.00, 15.00, 0.30, 6.00, 'claude-sonnet-4-6 list price; confirm against the Anthropic invoice'),
  ('haiku',  1.00,  5.00, 0.10, 2.00, 'claude-haiku-4-5 list price; confirm against the Anthropic invoice')
on conflict (model) do nothing;

alter table ink_usage
  add column if not exists cache_read_tokens integer not null default 0,
  add column if not exists cache_write_tokens integer not null default 0,
  add column if not exists billed_ink numeric(10,4); -- what was actually charged; null on v1 rows

-- One place the price is computed. Unknown models bill at the quality rate, as v1 does.
create or replace function ink_cost_v2(
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer,
  p_cache_write_tokens integer
) returns numeric as $$
declare
  r ink_rates%rowtype;
  v_mult numeric;
  v_usd numeric;
begin
  select * into r from ink_rates where model = p_model;
  if not found then
    select * into r from ink_rates where model = 'sonnet';
  end if;
  select value into v_mult from ink_meter_settings where key = 'ink_per_vendor_dollar';
  v_usd := ( coalesce(p_input_tokens, 0)       * r.usd_in
           + coalesce(p_output_tokens, 0)      * r.usd_out
           + coalesce(p_cache_read_tokens, 0)  * r.usd_cache_read
           + coalesce(p_cache_write_tokens, 0) * r.usd_cache_write ) / 1000000.0;
  return round(v_usd * coalesce(v_mult, 102), 4);
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

-- deduct_ink_v2: identical wallet logic to deduct_ink (023): lock, lazy refill,
-- monthly first then top-up. Only the cost line and the recorded columns differ.
create or replace function deduct_ink_v2(
  p_user_id uuid,
  p_project_id uuid,
  p_operation text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer default 0,
  p_cache_write_tokens integer default 0
) returns numeric as $$
declare
  v_ink_cost numeric;
  v_row ink_balances%rowtype;
  v_new_balance numeric;
  v_from_monthly numeric;
  v_from_topup numeric;
begin
  v_ink_cost := ink_cost_v2(p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens);

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

  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, billed_ink)
  values (p_user_id, p_project_id, p_operation, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0),
          coalesce(p_cache_read_tokens, 0), coalesce(p_cache_write_tokens, 0), v_ink_cost);

  return v_new_balance;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- settle_ink_reservation_v2: identical to settle_ink_reservation (023) apart from
-- the cost line and the recorded columns.
create or replace function settle_ink_reservation_v2(
  p_reservation_id uuid,
  p_project_id uuid,
  p_operation text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_flat_ink_cost numeric default null,
  p_cache_read_tokens integer default 0,
  p_cache_write_tokens integer default 0
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
    ink_cost_v2(p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens));
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
  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, flat_ink_cost, cache_read_tokens, cache_write_tokens, billed_ink)
    values (v_reservation.user_id, p_project_id, p_operation, p_model,
      coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), p_flat_ink_cost,
      coalesce(p_cache_read_tokens, 0), coalesce(p_cache_write_tokens, 0), v_cost);
  return v_new_balance;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function ink_cost_v2(text, integer, integer, integer, integer) from public, anon, authenticated;
grant  execute on function ink_cost_v2(text, integer, integer, integer, integer) to service_role;
revoke execute on function deduct_ink_v2(uuid, uuid, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant  execute on function deduct_ink_v2(uuid, uuid, text, text, integer, integer, integer, integer) to service_role;
revoke execute on function settle_ink_reservation_v2(uuid, uuid, text, text, integer, integer, numeric, integer, integer) from public, anon, authenticated;
grant  execute on function settle_ink_reservation_v2(uuid, uuid, text, text, integer, integer, numeric, integer, integer) to service_role;
