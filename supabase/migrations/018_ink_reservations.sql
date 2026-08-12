-- 018: hold minimum Ink before a vendor call.
--
-- A read-only preflight lets two concurrent requests observe the same balance,
-- both buy vendor work, and only then discover that one cannot be charged.
-- Reservations serialize that decision. They intentionally hold a conservative
-- floor, not an unbounded model maximum; settlement still rejects a cost that
-- exceeds the remaining available balance instead of overdrawing the wallet.

create table if not exists ink_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  ink_amount numeric(10,4) not null check (ink_amount > 0),
  status text not null default 'active' check (status in ('active', 'settled', 'released')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists ink_reservations_active_user_idx
  on ink_reservations (user_id, expires_at) where status = 'active';
alter table ink_reservations enable row level security;

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
  if v_row.ink_balance - v_reserved < p_ink_amount then
    raise exception 'Insufficient Ink balance';
  end if;

  insert into ink_reservations (user_id, operation, ink_amount)
    values (p_user_id, p_operation, p_ink_amount)
    returning id into v_id;
  return query select v_id, v_row.ink_balance, v_row.lifetime_used, v_row.tier;
end;
$$ language plpgsql security definer;

create or replace function release_ink_reservation(p_reservation_id uuid) returns void as $$
begin
  update ink_reservations
    set status = 'released', settled_at = now()
    where id = p_reservation_id and status = 'active';
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
  if v_row.ink_balance - v_other_reserved < v_cost then
    raise exception 'Insufficient Ink balance';
  end if;

  update ink_balances
    set ink_balance = ink_balance - v_cost, lifetime_used = lifetime_used + v_cost
    where user_id = v_reservation.user_id
    returning ink_balance into v_new_balance;
  update ink_reservations set status = 'settled', settled_at = now() where id = p_reservation_id;
  insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, flat_ink_cost)
    values (v_reservation.user_id, p_project_id, p_operation, p_model,
      coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), p_flat_ink_cost);
  return v_new_balance;
end;
$$ language plpgsql security definer;

revoke execute on function ensure_ink_balance(uuid, text[]) from public, anon, authenticated;
grant execute on function ensure_ink_balance(uuid, text[]) to service_role;
revoke execute on function deduct_ink_flat(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function deduct_ink_flat(uuid, uuid, text, text, numeric) to service_role;
revoke execute on function bump_edit_counter(uuid, integer) from public, anon, authenticated;
grant execute on function bump_edit_counter(uuid, integer) to service_role;
revoke execute on function reserve_ink(uuid, text, numeric) from public, anon, authenticated;
grant execute on function reserve_ink(uuid, text, numeric) to service_role;
revoke execute on function release_ink_reservation(uuid) from public, anon, authenticated;
grant execute on function release_ink_reservation(uuid) to service_role;
revoke execute on function settle_ink_reservation(uuid, uuid, text, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function settle_ink_reservation(uuid, uuid, text, text, integer, integer, numeric) to service_role;
