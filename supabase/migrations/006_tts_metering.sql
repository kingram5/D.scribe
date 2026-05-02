alter table ink_balances
  add column if not exists tts_chars_used integer not null default 0,
  add column if not exists tts_period_start timestamptz not null default now();

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
    when 'starter' then v_limit := 8000;
    when 'pro'     then v_limit := 20000;
    when 'premium' then v_limit := 60000;
    else                v_limit := 0;
  end case;

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
