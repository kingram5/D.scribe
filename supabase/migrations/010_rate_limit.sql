-- Migration 010: Distributed rate limiter
-- Atomic sliding-window counter keyed by user+route.
-- Called via supabase.rpc('check_rate_limit', ...) from Next.js API routes.

create table if not exists rate_limit_counters (
  key            text        primary key,
  count          integer     not null default 0,
  window_expires timestamptz not null
);

create or replace function check_rate_limit(
  p_key        text,
  p_limit      integer,
  p_window_ms  integer   -- milliseconds
)
returns table(allowed boolean, retry_after_ms bigint)
language plpgsql as $$
declare
  v_count   integer;
  v_expires timestamptz;
  v_window  interval;
begin
  v_window := (p_window_ms || ' milliseconds')::interval;

  insert into rate_limit_counters (key, count, window_expires)
  values (p_key, 1, now() + v_window)
  on conflict (key) do update set
    count = case
      when rate_limit_counters.window_expires > now()
        then rate_limit_counters.count + 1
      else 1
    end,
    window_expires = case
      when rate_limit_counters.window_expires > now()
        then rate_limit_counters.window_expires
      else now() + v_window
    end
  returning rate_limit_counters.count, rate_limit_counters.window_expires
  into v_count, v_expires;

  if v_count > p_limit then
    return query select
      false::boolean,
      greatest(0, extract(epoch from (v_expires - now())) * 1000)::bigint;
  else
    return query select true::boolean, 0::bigint;
  end if;
end;
$$;

-- Optional: cron cleanup of expired rows (if pg_cron is enabled)
-- select cron.schedule('rate-limit-cleanup', '*/15 * * * *',
--   $$ delete from rate_limit_counters where window_expires < now() - interval '1 hour' $$);
