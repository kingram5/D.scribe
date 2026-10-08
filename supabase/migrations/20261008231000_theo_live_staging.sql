-- Separate staging voice budget. Does not change legacy character allowances or Ink.
create table public.theo_live_workers (id text primary key, heartbeat_at timestamptz not null default now());
create table public.theo_live_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 run_id uuid not null references pr_runs(id),
 project_id uuid not null references projects(id),
 period_start timestamptz not null,
 reserved_seconds numeric not null check(reserved_seconds > 0),
 used_seconds numeric not null default 0 check(used_seconds >= 0),
 usd_per_minute numeric not null check(usd_per_minute > 0),
 vendor_usd numeric,
 state text not null default 'queued' check(state in ('queued','creating','active','closing','closed','reconciliation')),
 offer text,
 answer text,
 vendor_session_id text unique,
 vendor_expires_at timestamptz,
 end_requested boolean not null default false,
 client_seen_at timestamptz not null default now(),
 worker_id text,
 worker_seen_at timestamptz,
 created_at timestamptz not null default now(),
 failure text,
 last_answer_ms numeric not null default -1,
 follow_up_of uuid
);
create unique index theo_live_one_active on theo_live_sessions(user_id) where state <> 'closed';
create table public.theo_live_events (
 session_id uuid not null references theo_live_sessions(id) on delete cascade,
 event_id text not null,
 event_type text not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key(session_id,event_id)
);
alter table public.theo_live_workers enable row level security;
alter table public.theo_live_sessions enable row level security;
alter table public.theo_live_events enable row level security;
revoke all on theo_live_workers,theo_live_sessions,theo_live_events from anon,authenticated;

create or replace function public.theo_live_reserve(p_user_id uuid,p_run_id uuid,p_offer text,p_caps jsonb,p_rate numeric)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare b ink_balances%rowtype; r pr_runs%rowtype; cap numeric; used numeric; sid uuid;
begin
 select * into b from ink_balances where user_id=p_user_id for update;
 if not found or b.tier not in ('pro','premium') then raise exception 'Live voice is unavailable for this plan'; end if;
 if not exists(select 1 from theo_live_workers where heartbeat_at > now()-interval '15 seconds') then raise exception 'Live worker unavailable'; end if;
 select * into r from pr_runs where id=p_run_id and user_id=p_user_id and status in ('editing','interviewing');
 if not found then raise exception 'Interview run unavailable'; end if;
 if r.models->>'provider' is distinct from 'openai' then raise exception 'Live requires a pinned OpenAI interview run'; end if;
 cap:=(p_caps->>b.tier)::numeric;
 if cap is null or cap <= 0 or p_rate <= 0 then raise exception 'Live allowance unavailable'; end if;
 select coalesce(sum(case when state='closed' then used_seconds else reserved_seconds end),0) into used
  from theo_live_sessions where user_id=p_user_id and period_start=b.ink_period_start;
 if cap-used < 60 then raise exception 'Live allowance exhausted'; end if;
 -- Hold ALL remaining time. Vendor expiry must fit this hold before media is released.
 insert into theo_live_sessions(user_id,run_id,project_id,period_start,reserved_seconds,usd_per_minute,offer)
 values(p_user_id,p_run_id,r.project_id,b.ink_period_start,cap-used,p_rate,p_offer) returning id into sid;
 return sid;
end $$;

create or replace function public.theo_live_claim(p_worker text)
returns setof theo_live_sessions language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query with picked as (
   select id from theo_live_sessions where state='queued' order by created_at for update skip locked limit 1
 ) update theo_live_sessions s set state='creating',worker_id=p_worker,worker_seen_at=now() from picked
 where s.id=picked.id returning s.*;
end $$;

create or replace function public.theo_live_observe(p_id uuid,p_event_id text,p_type text,p_event jsonb,p_seconds numeric default null,p_closed boolean default false)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s theo_live_sessions%rowtype;
begin
 select * into s from theo_live_sessions where id=p_id for update;
 if not found then raise exception 'Live session not found'; end if;
 if s.state='closed' then return false; end if;
 insert into theo_live_events(session_id,event_id,event_type,payload) values(p_id,p_event_id,p_type,p_event) on conflict do nothing;
 if not found then return false; end if;
 if p_seconds is not null then
   if p_seconds < s.used_seconds then raise exception 'Nonmonotonic Live duration'; end if;
   update theo_live_sessions set used_seconds=p_seconds,vendor_usd=p_seconds*usd_per_minute/60 where id=p_id;
 end if;
 if p_closed then
   if p_seconds is null then raise exception 'Final usage required'; end if;
   update theo_live_sessions set state='closed',offer=null,answer=null where id=p_id;
 end if;
 return true;
end $$;

alter table pr_answers add column source_event_key text;
create unique index pr_answers_source_event on pr_answers(run_id,source_event_key) where source_event_key is not null;

revoke all on function theo_live_reserve(uuid,uuid,text,jsonb,numeric) from public,anon,authenticated;
revoke all on function theo_live_claim(text) from public,anon,authenticated;
revoke all on function theo_live_observe(uuid,text,text,jsonb,numeric,boolean) from public,anon,authenticated;
grant execute on function theo_live_reserve(uuid,uuid,text,jsonb,numeric) to service_role;
grant execute on function theo_live_claim(text) to service_role;
grant execute on function theo_live_observe(uuid,text,text,jsonb,numeric,boolean) to service_role;

grant all on theo_live_workers,theo_live_sessions,theo_live_events to service_role;

-- Author correction retains the original voice event and records the revised source.
create or replace function public.theo_correct_answer(p_session uuid,p_user uuid,p_answer uuid,p_text text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a pr_answers%rowtype; s theo_live_sessions%rowtype;
begin
 select * into s from theo_live_sessions where id=p_session and user_id=p_user and state='closed';
 if not found then raise exception 'End voice before correcting its answers'; end if;
 perform 1 from pr_runs where id=s.run_id and user_id=p_user and status in ('editing','interviewing') for update;
 if not found then raise exception 'Interview no longer editable'; end if;
 if length(trim(p_text))=0 or length(p_text)>8000 then raise exception 'Invalid correction'; end if;
 select * into a from pr_answers where id=p_answer and run_id=s.run_id and user_id=p_user and source_event_key like s.id::text || ':%' for update;
 if not found then raise exception 'Answer not found'; end if;
 insert into theo_live_events(session_id,event_id,event_type,payload) values(s.id,gen_random_uuid()::text,'author.correction',jsonb_build_object('answer_id',a.id,'before',a.transcript,'after',p_text));
 update pr_answers set transcript=p_text where id=a.id;
end $$;
revoke all on function theo_correct_answer(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function theo_correct_answer(uuid,uuid,uuid,text) to service_role;
