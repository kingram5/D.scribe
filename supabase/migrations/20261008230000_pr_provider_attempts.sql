-- Additive provider accounting. No plan, balance, historical usage or rate changes.
create table public.pr_ai_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pr_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  call_key text not null,
  stage text not null,
  model text not null,
  price_version text not null,
  multiplier numeric not null check (multiplier > 0),
  reservation_id uuid not null references public.ink_reservations(id),
  state text not null default 'pending' check (state in ('pending','observed','settled','reconciliation')),
  response_id text,
  request_id text,
  vendor_usd numeric check (vendor_usd >= 0),
  usage jsonb,
  result jsonb,
  failure text,
  billed_ink numeric,
  balance_after numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, call_key)
);
alter table public.pr_ai_calls enable row level security;
-- Server-only: results contain manuscript text and are never exposed as a ledger API.
revoke all on public.pr_ai_calls from anon, authenticated;

create or replace function public.pr_begin_ai_call(p_run_id uuid, p_user_id uuid, p_call_key text, p_stage text, p_model text, p_price_version text, p_max_usd numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r pr_runs%rowtype; c pr_ai_calls%rowtype; hold uuid; mult numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text || p_call_key, 0));
  select * into r from pr_runs where id=p_run_id and user_id=p_user_id;
  if not found then raise exception 'Run not found'; end if;
  select * into c from pr_ai_calls where run_id=p_run_id and call_key=p_call_key;
  if found then return jsonb_build_object('existing',true,'call',to_jsonb(c)); end if;
  if r.status in ('cancelled','done') then raise exception 'Run is finished'; end if;
  if p_max_usd <= 0 or p_max_usd > 100 then raise exception 'Invalid reservation budget'; end if;
  select value into mult from ink_meter_settings where key='ink_per_vendor_dollar';
  if mult is null or mult <= 0 then raise exception 'Missing Ink multiplier'; end if;
  select reservation_id into hold from reserve_ink(p_user_id, 'pr_' || p_stage, ceil(p_max_usd * mult * 10000)/10000);
  -- Ambiguous paid work must remain reserved until explicitly reconciled.
  update ink_reservations set expires_at='infinity' where id=hold;
  insert into pr_ai_calls(run_id,user_id,project_id,call_key,stage,model,price_version,multiplier,reservation_id)
    values(p_run_id,p_user_id,r.project_id,p_call_key,p_stage,p_model,p_price_version,mult,hold) returning * into c;
  return jsonb_build_object('existing',false,'call',to_jsonb(c));
end $$;

-- Observation is durable even if settlement later fails. Only server code calls this.
create or replace function public.pr_observe_ai_call(p_id uuid, p_response_id text, p_request_id text, p_usd numeric, p_usage jsonb, p_result jsonb, p_failure text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update pr_ai_calls set response_id=coalesce(p_response_id,response_id),request_id=coalesce(p_request_id,request_id),
    vendor_usd=p_usd,usage=p_usage,result=p_result,failure=p_failure,
    state=case when p_usd is null then 'reconciliation' else 'observed' end,updated_at=now()
    where id=p_id and state in ('pending','reconciliation');
  if not found then raise exception 'Attempt already observed or unavailable'; end if;
end $$;

create or replace function public.pr_settle_ai_call(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c pr_ai_calls%rowtype; b numeric; charge numeric;
begin
  select * into c from pr_ai_calls where id=p_id for update;
  if not found then raise exception 'Attempt not found'; end if;
  if c.state='settled' then return to_jsonb(c); end if;
  if c.state <> 'observed' or c.vendor_usd is null then raise exception 'Attempt needs reconciliation'; end if;
  if c.result is null then
    -- Known failed output is vendor expense, not a customer debit.
    perform release_ink_reservation(c.reservation_id);
    charge:=0;
  else
    charge:=round(c.vendor_usd*c.multiplier,4);
    b:=settle_ink_reservation_v2(c.reservation_id,c.project_id,'pr_' || c.stage,c.model,
      coalesce((c.result->'usage'->>'input_tokens')::integer,0),coalesce((c.result->'usage'->>'output_tokens')::integer,0),charge,
      coalesce((c.result->'usage'->>'cache_read_input_tokens')::integer,0),coalesce((c.result->'usage'->>'cache_creation_input_tokens')::integer,0));
  end if;
  update pr_ai_calls set state='settled',billed_ink=charge,balance_after=b,updated_at=now() where id=p_id returning * into c;
  return to_jsonb(c);
end $$;

create table public.pr_step_jobs (
  run_id uuid not null references pr_runs(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  step text not null check(step in ('draft','edit','revise','final')),
  state text not null default 'running' check(state in ('running','done','reconciliation')),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key(run_id,chapter_id,step)
);
alter table public.pr_step_jobs enable row level security;
revoke all on pr_step_jobs from anon,authenticated;
create or replace function public.pr_claim_step(p_run_id uuid,p_chapter_id uuid,p_step text,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j pr_step_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_run_id::text || p_chapter_id::text || p_step,0));
  if not exists(select 1 from pr_runs r join chapters c on c.project_id=r.project_id join projects p on p.id=r.project_id
    where r.id=p_run_id and c.id=p_chapter_id and r.user_id=p_user_id and p.user_id=p_user_id and r.status not in ('done','cancelled')) then raise exception 'Run/chapter unavailable'; end if;
  select * into j from pr_step_jobs where run_id=p_run_id and chapter_id=p_chapter_id and step=p_step;
  if found then return jsonb_build_object('existing',true,'job',to_jsonb(j)); end if;
  insert into pr_step_jobs(run_id,chapter_id,step) values(p_run_id,p_chapter_id,p_step) returning * into j;
  return jsonb_build_object('existing',false,'job',to_jsonb(j));
end $$;

revoke all on function pr_begin_ai_call(uuid,uuid,text,text,text,text,numeric) from public,anon,authenticated;
revoke all on function pr_observe_ai_call(uuid,text,text,numeric,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function pr_settle_ai_call(uuid) from public,anon,authenticated;
revoke all on function pr_claim_step(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function pr_begin_ai_call(uuid,uuid,text,text,text,text,numeric) to service_role;
grant execute on function pr_observe_ai_call(uuid,text,text,numeric,jsonb,jsonb,text) to service_role;
grant execute on function pr_settle_ai_call(uuid) to service_role;
grant execute on function pr_claim_step(uuid,uuid,text,uuid) to service_role;

grant all on pr_ai_calls,pr_step_jobs to service_role;

-- A step's manuscript version, review state, pass and completion receipt commit together.
create or replace function public.pr_commit_step(p_run uuid,p_chapter uuid,p_user uuid,p_step text,p_expected integer,p_text text,p_params jsonb,p_pass jsonb,p_result jsonb,p_questions jsonb default '[]',p_notes jsonb default '[]',p_note_updates jsonb default '[]')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare latest integer; output_version integer; j pr_step_jobs%rowtype; item jsonb; receipt jsonb;
begin
 select * into j from pr_step_jobs where run_id=p_run and chapter_id=p_chapter and step=p_step for update;
 if not found then raise exception 'Step claim missing'; end if;
 if j.state='done' then return j.result; end if;
 perform 1 from pr_runs r join chapters c on c.project_id=r.project_id where r.id=p_run and c.id=p_chapter and r.user_id=p_user and r.status not in ('done','cancelled') for update of r;
 if not found then raise exception 'Run unavailable'; end if;
 perform 1 from chapters where id=p_chapter for update;
 select coalesce(max(version),0) into latest from chapter_contents where chapter_id=p_chapter;
 if latest <> coalesce(p_expected,0) then raise exception 'Chapter changed while the model worked; preserve author edits and reconcile'; end if;
 output_version:=latest;
 if p_text is not null then
   output_version:=latest+1;
   insert into chapter_contents(chapter_id,content,word_count,generation_params,version)
     values(p_chapter,p_text,cardinality(regexp_split_to_array(trim(p_text),'\s+')),p_params,output_version);
 end if;
 if p_step='draft' then update chapters set status='generated' where id=p_chapter; end if;
 if p_step='edit' then
   delete from pr_questions where run_id=p_run and chapter_id=p_chapter and status='queued';
   delete from pr_craft_notes where run_id=p_run and chapter_id=p_chapter and status='open';
   for item in select * from jsonb_array_elements(p_questions) loop
     insert into pr_questions(run_id,chapter_id,user_id,question,why,impact,beat_id)
       values(p_run,p_chapter,p_user,item->>'question',item->>'why',(item->>'impact')::smallint,item->>'beat_id');
   end loop;
   for item in select * from jsonb_array_elements(p_notes) loop
     insert into pr_craft_notes(run_id,chapter_id,user_id,span,problem,fix)
       values(p_run,p_chapter,p_user,item->>'span',item->>'problem',item->>'fix');
   end loop;
 end if;
 for item in select * from jsonb_array_elements(p_note_updates) loop
   update pr_craft_notes set status=item->>'status',reason=item->>'reason' where id=(item->>'id')::uuid and run_id=p_run and chapter_id=p_chapter;
 end loop;
 insert into pr_chapter_passes(run_id,chapter_id,user_id,step,version_in,version_out,beat_plan,scores,change_log,usage)
 values(p_run,p_chapter,p_user,p_step,nullif(latest,0),output_version,p_pass->'beat_plan',p_pass->'scores',p_pass->'change_log',p_pass->'usage');
 receipt:=p_result||jsonb_build_object('version',output_version);
 update pr_step_jobs set state='done',result=receipt where run_id=p_run and chapter_id=p_chapter and step=p_step;
 return receipt;
end $$;
revoke all on function pr_commit_step(uuid,uuid,uuid,text,integer,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function pr_commit_step(uuid,uuid,uuid,text,integer,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
