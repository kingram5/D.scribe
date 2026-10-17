-- Additive experimental mixed routing. No prices, entitlements or feature flags changed.
-- All mutation functions are service-role-only and independently verify project/run ownership.
create table public.ai_operations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pr_runs(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_key text not null,
  input_hash text not null,
  snapshot jsonb not null,
  context jsonb not null,
  reservation_id uuid not null references public.ink_reservations(id),
  state text not null default 'running' check (state in ('running','complete','review_needed','resumable','cancelled')),
  result jsonb,
  reconciliation jsonb not null default '[]',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(run_id, operation_key)
);
create table public.ai_attempts (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.ai_operations(id) on delete cascade,
  call_key text not null,
  ordinal integer not null check (ordinal between 1 and 3),
  provider text not null,
  model text not null,
  route jsonb not null,
  input_hash text not null,
  state text not null default 'started',
  provider_request_id text,
  usage jsonb,
  vendor_cost_usd numeric,
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(operation_id, call_key, ordinal)
);
alter table public.ai_operations enable row level security;
alter table public.ai_attempts enable row level security;
-- No client policies: results may contain unpublished source and manuscript text.
revoke all on public.ai_operations, public.ai_attempts from anon, authenticated;
grant all on public.ai_operations, public.ai_attempts to service_role;

create function public.begin_mixed_operation(p_user_id uuid, p_run_id uuid, p_chapter_id uuid,
  p_key text, p_input_hash text, p_context jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r pr_runs%rowtype; op ai_operations%rowtype; reservation uuid; multiplier numeric; budget numeric; routing jsonb;
begin
  select * into r from pr_runs where id=p_run_id and user_id=p_user_id for update;
  if not found or r.status in ('done','cancelled') then raise exception 'Run unavailable'; end if;
  if not exists(select 1 from projects where id=r.project_id and user_id=p_user_id) then raise exception 'Project unavailable'; end if;
  if p_chapter_id is not null and not exists(select 1 from chapters where id=p_chapter_id and project_id=r.project_id) then raise exception 'Chapter/run mismatch'; end if;
  select * into op from ai_operations where run_id=p_run_id and operation_key=p_key;
  if found then
    if op.input_hash <> p_input_hash then raise exception 'Source or manuscript changed; start a new run'; end if;
    if op.state='complete' then return to_jsonb(op); end if;
    if op.state='resumable' then
      update ai_operations set state='running' where id=op.id returning * into op;
      return to_jsonb(op);
    end if;
    raise exception 'Operation requires reconciliation or is already running';
  end if;
  routing:=r.models->'mixed';
  if p_key like 'live:%' then
    select backend_snapshot into routing from theo_live_sessions where id=split_part(p_key,':',2)::uuid and run_id=p_run_id and user_id=p_user_id and state<>'closed';
  end if;
  if routing->>'version' is distinct from 'mixed-v1' then raise exception 'Run has no mixed snapshot'; end if;
  budget := (routing->>'maxOperationUsd')::numeric;
  if budget is null or budget <= 0 or budget > 100 then raise exception 'Invalid operation budget'; end if;
  select value into multiplier from ink_meter_settings where key='ink_per_vendor_dollar';
  if multiplier is null or multiplier <= 0 then raise exception 'Ink meter configuration missing'; end if;
  select reservation_id into reservation from reserve_ink(p_user_id, 'pr_mixed', ceil(budget*multiplier*10000)/10000);
  insert into ai_operations(run_id,chapter_id,user_id,operation_key,input_hash,snapshot,context,reservation_id)
    values(p_run_id,p_chapter_id,p_user_id,p_key,p_input_hash,routing,p_context,reservation) returning * into op;
  return to_jsonb(op);
end $$;

-- Commit manuscript/version/pass/questions AND wallet settlement in one transaction.
create function public.finish_mixed_step(p_user_id uuid, p_operation_id uuid, p_step text, p_output jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare op ai_operations%rowtype; r pr_runs%rowtype; ch chapters%rowtype; v integer; previous integer;
  cost numeric; multiplier numeric; v_result jsonb; item jsonb;
begin
  select * into op from ai_operations where id=p_operation_id and user_id=p_user_id for update;
  if not found then raise exception 'Operation unavailable'; end if;
  if op.state='complete' then return op.result; end if;
  if op.state <> 'running' then raise exception 'Operation needs review'; end if;
  select * into r from pr_runs where id=op.run_id and user_id=p_user_id for update;
  if not found or r.status in ('done','cancelled') then raise exception 'Run unavailable'; end if;
  select * into ch from chapters where id=op.chapter_id and project_id=r.project_id for update;
  if not found or not exists(select 1 from projects where id=r.project_id and user_id=p_user_id) then raise exception 'Chapter unavailable'; end if;
  if p_step not in ('draft','edit','revise','final') or op.operation_key <> 'chapter:'||ch.id::text||':'||p_step then raise exception 'Invalid step'; end if;
  if exists(select 1 from ai_attempts where operation_id=op.id and (state in ('started','reconcile','cancelled') or (state <> 'retryable' and (usage->>'usageStatus' is distinct from 'reported')))) then raise exception 'Usage requires reconciliation'; end if;
  select coalesce(sum(vendor_cost_usd),0) into cost from ai_attempts where operation_id=op.id;
  if cost > (op.snapshot->>'maxOperationUsd')::numeric then raise exception 'Review budget exceeded'; end if;
  -- Platform failures are recorded as business spend, not customer debits.
  select coalesce(sum(vendor_cost_usd),0) into cost from ai_attempts where operation_id=op.id and state='complete';
  select value into multiplier from ink_meter_settings where key='ink_per_vendor_dollar';
  select version into previous from chapter_contents where chapter_id=ch.id order by version desc limit 1;
  if coalesce(previous,0) <> coalesce((op.context->>'version')::integer,0) then raise exception 'Manuscript changed during operation'; end if;
  v := previous;
  if p_output ? 'text' and p_step <> 'edit' then
    if length(trim(p_output->>'text'))=0 then raise exception 'Empty manuscript'; end if;
    v := coalesce(previous,0)+1;
    insert into chapter_contents(chapter_id,content,word_count,generation_params,version)
      values(ch.id,p_output->>'text',array_length(regexp_split_to_array(trim(p_output->>'text'),'\s+'),1),
        jsonb_build_object('pipeline','publisher_ready','step',p_step,'mixed_operation',op.id,'route_version','mixed-v1'),v);
    update chapters set status='generated' where id=ch.id;
  end if;
  if p_step='edit' then
    delete from pr_questions where run_id=r.id and chapter_id=ch.id and status='queued';
    delete from pr_craft_notes where run_id=r.id and chapter_id=ch.id and status='open';
    for item in select * from jsonb_array_elements(p_output->'report'->'author_questions') loop
      insert into pr_questions(run_id,chapter_id,user_id,question,why,impact,beat_id)
        values(r.id,ch.id,p_user_id,item->>'question',item->>'why',greatest(1,least(5,(item->>'impact')::integer)),item->>'beat_id');
    end loop;
    for item in select * from jsonb_array_elements(p_output->'report'->'craft_notes') loop
      insert into pr_craft_notes(run_id,chapter_id,user_id,span,problem,fix)
        values(r.id,ch.id,p_user_id,item->>'span',item->>'problem',item->>'fix');
    end loop;
  end if;
  if p_step='revise' then
    for item in select * from jsonb_array_elements(coalesce(p_output->'resolved_notes','[]')) loop
      update pr_craft_notes set status=item->>'status',reason=item->>'reason'
        where id=(item->>'id')::uuid and run_id=r.id and chapter_id=ch.id;
    end loop;
  end if;
  insert into pr_chapter_passes(run_id,chapter_id,user_id,step,version_in,version_out,beat_plan,scores,change_log,usage)
    values(r.id,ch.id,p_user_id,p_step,previous,v,p_output->'beats',p_output->'scores',p_output->'changeLog',
      jsonb_build_object('operation_id',op.id,'route_version','mixed-v1'));
  perform settle_ink_reservation_v2(op.reservation_id,r.project_id,'pr_'||p_step,'mixed-v1',0,0,round(cost*multiplier,4),0,0);
  v_result := (p_output->'result') || jsonb_build_object('version',v);
  update ai_operations set state='complete',result=v_result,finished_at=now() where id=op.id;
  return v_result;
end $$;
revoke execute on function public.begin_mixed_operation(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke execute on function public.finish_mixed_step(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_mixed_operation(uuid,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.finish_mixed_step(uuid,uuid,text,jsonb) to service_role;

create function public.finish_mixed_aux(p_user_id uuid,p_operation_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare op ai_operations%rowtype; r pr_runs%rowtype; cost numeric; multiplier numeric;
begin
 select * into op from ai_operations where id=p_operation_id and user_id=p_user_id for update;
 if not found then raise exception 'Operation unavailable'; end if;
 if op.state='complete' then return op.result; end if;
 if op.state <> 'running' or op.chapter_id is not null then raise exception 'Invalid auxiliary operation'; end if;
 select * into r from pr_runs where id=op.run_id and user_id=p_user_id for update;
 if not found or r.status in ('done','cancelled') then raise exception 'Run unavailable'; end if;
 if exists(select 1 from ai_attempts where operation_id=op.id and state <> 'retryable' and (state <> 'complete' or usage->>'usageStatus' is distinct from 'reported')) then raise exception 'Reconcile usage first'; end if;
 select coalesce(sum(vendor_cost_usd),0) into cost from ai_attempts where operation_id=op.id;
 if cost > (op.snapshot->>'maxOperationUsd')::numeric then raise exception 'Review budget exceeded'; end if;
 select value into multiplier from ink_meter_settings where key='ink_per_vendor_dollar';
 perform settle_ink_reservation_v2(op.reservation_id,r.project_id,'pr_interview','mixed-v1',0,0,round(cost*multiplier,4),0,0);
 update ai_operations set state='complete',result=p_result,finished_at=now() where id=op.id;
 return p_result;
end $$;
revoke execute on function public.finish_mixed_aux(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_mixed_aux(uuid,uuid,jsonb) to service_role;

create table public.groq_transcription_attempts (
 upload_id uuid primary key references audio_uploads(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references projects(id) on delete cascade,
 reservation_id uuid not null references ink_reservations(id),
 state text not null default 'started',price jsonb not null,result jsonb,usage jsonb,
 provider_request_id text,vendor_cost_usd numeric,transcript_id uuid references transcripts(id),
 created_at timestamptz not null default now()
);
alter table public.groq_transcription_attempts enable row level security;
revoke all on public.groq_transcription_attempts from anon,authenticated;
grant all on public.groq_transcription_attempts to service_role;
create function public.finish_groq_transcription(p_user_id uuid,p_upload_id uuid,p_ink numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a groq_transcription_attempts%rowtype; t transcripts%rowtype;
begin
 select * into a from groq_transcription_attempts where upload_id=p_upload_id and user_id=p_user_id for update;
 if not found or not exists(select 1 from projects where id=a.project_id and user_id=p_user_id) then raise exception 'Upload unavailable'; end if;
 if a.state='complete' then select * into t from transcripts where id=a.transcript_id;return to_jsonb(t);end if;
 if a.state <> 'reported' or a.result is null then raise exception 'Reconcile transcription first'; end if;
 insert into transcripts(audio_upload_id,project_id,full_text,segments,word_count,speaker_count)
 values(a.upload_id,a.project_id,a.result->>'full_text',a.result->'segments',(a.result->>'word_count')::integer,1) returning * into t;
 perform settle_ink_reservation_v2(a.reservation_id,a.project_id,'transcribe','groq',0,0,p_ink,0,0);
 update audio_uploads set status='transcribed',duration_seconds=(a.result->>'duration_seconds')::numeric where id=a.upload_id;
 update groq_transcription_attempts set state='complete',transcript_id=t.id where upload_id=a.upload_id;
 return to_jsonb(t);
end $$;
revoke execute on function public.finish_groq_transcription(uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.finish_groq_transcription(uuid,uuid,numeric) to service_role;

-- Live uses the EXISTING character allowance. No minute allowance is granted.
-- Operator must approve a seconds-to-character conversion; no default is inserted.
create table public.theo_live_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid not null references pr_runs(id) on delete cascade, question_id uuid not null references pr_questions(id),
 vendor_id text, state text not null default 'starting', max_seconds integer not null check(max_seconds between 1 and 5400),
 chars_per_second numeric not null, held_monthly integer not null, held_topup integer not null, period_start timestamptz not null,
 price jsonb not null, backend_snapshot jsonb not null, vendor_seconds numeric, vendor_cost_usd numeric, raw_usage jsonb,
 client_seen_at timestamptz not null default now(), created_at timestamptz not null default now(), closed_at timestamptz,
 answer_id uuid references pr_answers(id), worker_lease_until timestamptz, worker_id uuid
);
create unique index theo_live_one_active on theo_live_sessions(user_id) where state <> 'closed';
create table public.theo_live_events (
 session_id uuid not null references theo_live_sessions(id) on delete cascade,event_id text not null,
 role text not null check(role in ('user','assistant')),text text not null,start_ms numeric not null,end_ms numeric not null,
 received_at timestamptz not null default now(),primary key(session_id,event_id)
);
alter table public.theo_live_sessions enable row level security;
alter table public.theo_live_events enable row level security;
revoke all on public.theo_live_sessions,public.theo_live_events from anon,authenticated;
grant all on public.theo_live_sessions,public.theo_live_events to service_role;
create function public.reserve_theo_live(p_user_id uuid,p_run_id uuid,p_question_id uuid,p_seconds integer,p_price jsonb,p_backend jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b ink_balances%rowtype; after_b ink_balances%rowtype; conversion numeric; debit jsonb; session_row theo_live_sessions%rowtype;
begin
 if p_seconds < 1 or p_seconds > 5400 then raise exception 'Invalid session limit';end if;
 if not exists(select 1 from pr_runs r join projects p on p.id=r.project_id join pr_questions q on q.run_id=r.id
   where r.id=p_run_id and r.user_id=p_user_id and p.user_id=p_user_id and q.id=p_question_id and q.status='asked' and r.status not in ('done','cancelled')) then raise exception 'Interview unavailable';end if;
 select * into b from ink_balances where user_id=p_user_id for update;
 if not found then raise exception 'Wallet unavailable';end if;
 if exists(select 1 from theo_live_sessions where user_id=p_user_id and state<>'closed') then raise exception 'A Live session is active or awaiting reconciliation';end if;
 select value into conversion from ink_meter_settings where key='live_chars_per_second';
 if conversion is null or conversion<=0 then raise exception 'Live entitlement conversion not approved';end if;
 -- Apply the existing monthly reset before capturing the hold's allocation.
 perform check_and_deduct_tts(p_user_id,0);
 select * into b from ink_balances where user_id=p_user_id;
 debit:=check_and_deduct_tts(p_user_id,ceil(p_seconds*conversion)::integer);
 if debit->>'allowed' is distinct from 'true' then raise exception 'Insufficient voice allowance';end if;
 select * into after_b from ink_balances where user_id=p_user_id;
 insert into theo_live_sessions(user_id,run_id,question_id,max_seconds,chars_per_second,held_monthly,held_topup,period_start,price,backend_snapshot)
 values(p_user_id,p_run_id,p_question_id,p_seconds,conversion,after_b.tts_chars_used-b.tts_chars_used,b.topup_tts_chars-after_b.topup_tts_chars,after_b.tts_period_start,p_price,p_backend) returning * into session_row;
 update pr_runs set models=jsonb_set(models,'{live_enabled}','true'::jsonb) where id=p_run_id;
 return to_jsonb(session_row);
end $$;
create function public.settle_theo_live(p_session_id uuid,p_usage jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s theo_live_sessions%rowtype; seconds numeric; chars integer; monthly_used integer; topup_used integer; answer_text text; answer uuid;
begin
 select * into s from theo_live_sessions where id=p_session_id for update;
 if not found then raise exception 'Session unavailable';end if;
 if s.state='closed' then return s.answer_id;end if;
 seconds:=(p_usage->>'seconds')::numeric;
 if seconds is null or seconds<0 then raise exception 'Provider duration missing';end if;
 chars:=least(s.held_monthly+s.held_topup,ceil(seconds*s.chars_per_second)::integer);
 monthly_used:=least(chars,s.held_monthly);topup_used:=chars-monthly_used;
 perform 1 from ink_balances where user_id=s.user_id for update;
 update ink_balances set
  tts_chars_used=case when tts_period_start=s.period_start then greatest(0,tts_chars_used-(s.held_monthly-monthly_used)) else tts_chars_used end,
  topup_tts_chars=topup_tts_chars+s.held_topup-topup_used where user_id=s.user_id;
 -- Only the author's words become source; event IDs deduplicate replayed deltas.
 select string_agg(text,'' order by received_at,event_id) into answer_text from theo_live_events where session_id=s.id and role='user' and end_ms>start_ms;
 if length(trim(coalesce(answer_text,'')))>0 then
  insert into pr_answers(question_id,run_id,user_id,transcript,source) values(s.question_id,s.run_id,s.user_id,answer_text,'voice') returning id into answer;
  -- Keep the question available for typed corrections/follow-up; do not assert the answer covers it.
 end if;
 update theo_live_sessions set state='closed',vendor_seconds=seconds,raw_usage=p_usage,
  vendor_cost_usd=seconds/60*(price->>'usdPerMinute')::numeric,answer_id=answer,closed_at=now() where id=s.id;
 return answer;
end $$;
revoke execute on function public.reserve_theo_live(uuid,uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
revoke execute on function public.settle_theo_live(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_theo_live(uuid,uuid,uuid,integer,jsonb,jsonb) to service_role;
grant execute on function public.settle_theo_live(uuid,jsonb) to service_role;

-- Deliberate operator action after diagnosis; never retries an ambiguous paid attempt.
create function public.reopen_mixed_operation(p_operation_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare op ai_operations%rowtype; r pr_runs%rowtype; hold uuid; multiplier numeric;
begin
 if length(trim(p_reason))<12 then raise exception 'Reconciliation evidence required';end if;
 select * into op from ai_operations where id=p_operation_id for update;
 if not found or op.state<>'review_needed' then raise exception 'Operation is not awaiting review';end if;
 select * into r from pr_runs where id=op.run_id for update;
 if r.status in ('done','cancelled') then raise exception 'Run unavailable';end if;
 if exists(select 1 from ai_attempts where operation_id=op.id and state<>'retryable' and (state<>'complete' or usage->>'usageStatus' is distinct from 'reported' or vendor_cost_usd is null)) then raise exception 'Reconcile every paid/unknown attempt before resume';end if;
 if (select coalesce(sum(vendor_cost_usd),0) from ai_attempts where operation_id=op.id)>(op.snapshot->>'maxOperationUsd')::numeric then raise exception 'Budget exception requires review';end if;
 select value into multiplier from ink_meter_settings where key='ink_per_vendor_dollar';
 perform release_ink_reservation(op.reservation_id);
 select reservation_id into hold from reserve_ink(op.user_id,'pr_mixed',(op.snapshot->>'maxOperationUsd')::numeric*multiplier);
 update ai_operations set state='resumable',reservation_id=hold,
 reconciliation=reconciliation||jsonb_build_array(jsonb_build_object('at',now(),'reason',p_reason,'action','resume')) where id=op.id;
end $$;
revoke execute on function public.reopen_mixed_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.reopen_mixed_operation(uuid,text) to service_role;

alter table public.pr_answers add column mixed_request_key text;
create unique index pr_answers_mixed_request on public.pr_answers(run_id,question_id,mixed_request_key);

create function public.abandon_mixed_operation(p_operation_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare op ai_operations%rowtype;
begin
 if length(trim(p_reason))<12 then raise exception 'Reconciliation evidence required';end if;
 select * into op from ai_operations where id=p_operation_id for update;
 if not found or op.state<>'review_needed' then raise exception 'Operation is not awaiting review';end if;
 if exists(select 1 from ai_attempts where operation_id=op.id and state<>'retryable' and (state in ('started','reconcile','cancelled') or usage->>'usageStatus' is distinct from 'reported' or vendor_cost_usd is null)) then raise exception 'Unresolved vendor work cannot be abandoned';end if;
 perform release_ink_reservation(op.reservation_id);
 update ai_operations set state='cancelled',finished_at=now(),reconciliation=reconciliation||jsonb_build_array(jsonb_build_object('at',now(),'reason',p_reason,'action','abandon')) where id=op.id;
end $$;
revoke execute on function public.abandon_mixed_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.abandon_mixed_operation(uuid,text) to service_role;
