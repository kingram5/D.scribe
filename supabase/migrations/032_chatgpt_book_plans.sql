-- 032: ChatGPT app (book plans) + non-destructive outline replacement.
--
-- Numbered 032 on purpose: 029-031 belong to feat/publisher-ready (029 and 031
-- are already applied to prod). Everything here is additive: new tables, new
-- functions, one nullable column. Safe to apply before the code ships; the code
-- that uses it stays behind feature flags that default OFF.
--
-- Tables are service-role only (RLS on, no policies): the browser never reads
-- them, and the MCP endpoint reaches them through server code that has already
-- verified the caller's OAuth token.

-- ------------------------------------------------------------------
-- 1. Where a project came from (attribution without content).
-- ------------------------------------------------------------------
alter table projects add column if not exists created_via text;
comment on column projects.created_via is 'Origin of the project, e.g. ''chatgpt''. Null = website.';

-- ------------------------------------------------------------------
-- 2. Short-lived plan previews. Hold the plan + the normalized source
--    segments it cites, so a refine or a save does not need the user to
--    resend their material. Purged after expiry.
-- ------------------------------------------------------------------
create table if not exists book_plan_previews (
  id uuid primary key default gen_random_uuid(),
  -- Null when the preview was made before account linking.
  owner_user_id uuid references auth.users(id) on delete cascade,
  -- sha256 of a random claim secret returned only to the creating conversation.
  -- Needed (with the id) to save or refine; single-use for saving.
  claim_token_hash text not null,
  input_mode text not null check (input_mode in ('idea', 'source', 'import')),
  schema_version integer not null,
  plan jsonb not null,
  source_segments jsonb not null default '[]',
  source_digest text,
  status text not null default 'active' check (status in ('active', 'saved')),
  saved_project_id uuid references projects(id) on delete set null,
  generated_by text not null default 'client' check (generated_by in ('client', 'server', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists book_plan_previews_expires_idx on book_plan_previews (expires_at);
create index if not exists book_plan_previews_owner_idx on book_plan_previews (owner_user_id) where owner_user_id is not null;
alter table book_plan_previews enable row level security;

-- ------------------------------------------------------------------
-- 3. Idempotency ledger for writes. Key is bound to user + operation +
--    payload hash: a retry returns the first result, a reuse with a
--    different payload is rejected.
-- ------------------------------------------------------------------
create table if not exists plan_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  idem_key text not null,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, operation, idem_key)
);
alter table plan_idempotency enable row level security;

-- ------------------------------------------------------------------
-- 4. Outline snapshots: every outline replacement keeps the previous
--    chapters (and their written content) so a replacement is recoverable.
-- ------------------------------------------------------------------
create table if not exists outline_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  reason text not null,
  chapters jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists outline_snapshots_project_idx on outline_snapshots (project_id, created_at desc);
alter table outline_snapshots enable row level security;

-- ------------------------------------------------------------------
-- 5. replace_project_outline: the old /api/outline did DELETE then INSERT as
--    two calls, so a failed insert left the project with zero chapters. This
--    does snapshot + delete + insert in one transaction.
--    p_chapters: [{title, summary, key_point_ids: uuid[] as json, target_word_count}]
-- ------------------------------------------------------------------
create or replace function replace_project_outline(
  p_project_id uuid,
  p_user_id uuid,
  p_chapters jsonb,
  p_reason text default 'outline_regenerate'
) returns setof chapters as $$
declare
  v_snapshot jsonb;
begin
  perform 1 from projects where id = p_project_id and user_id = p_user_id for update;
  if not found then
    raise exception 'project_not_found';
  end if;
  if jsonb_typeof(p_chapters) <> 'array' or jsonb_array_length(p_chapters) = 0 then
    raise exception 'invalid_chapters';
  end if;

  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
           'contents', (select coalesce(jsonb_agg(to_jsonb(cc) order by cc.version), '[]'::jsonb)
                        from chapter_contents cc where cc.chapter_id = c.id))
         order by c.chapter_number), '[]'::jsonb)
    into v_snapshot
    from chapters c where c.project_id = p_project_id;

  if jsonb_array_length(v_snapshot) > 0 then
    insert into outline_snapshots (project_id, user_id, reason, chapters)
      values (p_project_id, p_user_id, p_reason, v_snapshot);
    -- Keep the newest 10 per project.
    delete from outline_snapshots
      where project_id = p_project_id
        and id not in (select id from outline_snapshots where project_id = p_project_id
                       order by created_at desc limit 10);
  end if;

  delete from chapters where project_id = p_project_id;

  return query
  insert into chapters (project_id, chapter_number, title, summary, key_point_ids, target_word_count, sort_order)
  select p_project_id,
         (e.ord)::int,
         e.ch->>'title',
         coalesce(e.ch->>'summary', ''),
         coalesce(e.ch->'key_point_ids', '[]'::jsonb),
         coalesce((e.ch->>'target_word_count')::int, 2500),
         (e.ord - 1)::int
    from jsonb_array_elements(p_chapters) with ordinality as e(ch, ord)
  returning *;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ------------------------------------------------------------------
-- 6. save_book_plan: create a NEW project from a reviewed preview in one
--    transaction. Never touches an existing project.
--    p_chapters: [{title, summary, body?}]; p_as_draft = bodies become
--    chapter content version 1 (faithful draft import).
--    Returns {project_id, replayed}.
-- ------------------------------------------------------------------
create or replace function save_book_plan(
  p_user_id uuid,
  p_idem_key text,
  p_payload_hash text,
  p_preview_id uuid,
  p_claim_hash text,
  p_title text,
  p_audience text,
  p_description text,
  p_chapters jsonb,
  p_as_draft boolean,
  p_target_words integer default 2500
) returns jsonb as $$
declare
  v_existing plan_idempotency%rowtype;
  v_preview book_plan_previews%rowtype;
  v_project_id uuid;
  v_chapter_id uuid;
  v_ch jsonb;
  v_ord bigint;
  v_body text;
  v_result jsonb;
begin
  if p_idem_key is null or length(p_idem_key) < 8 or length(p_idem_key) > 200 then
    raise exception 'invalid_idempotency_key';
  end if;

  -- Claim the idempotency key. A concurrent duplicate blocks here on the
  -- primary key until the first transaction commits, then sees its result.
  insert into plan_idempotency (user_id, operation, idem_key, payload_hash)
    values (p_user_id, 'save_book_plan', p_idem_key, p_payload_hash)
    on conflict do nothing;
  if not found then
    select * into v_existing from plan_idempotency
      where user_id = p_user_id and operation = 'save_book_plan' and idem_key = p_idem_key;
    if v_existing.payload_hash <> p_payload_hash then
      raise exception 'idempotency_conflict';
    end if;
    if v_existing.result is not null then
      return v_existing.result || jsonb_build_object('replayed', true);
    end if;
    raise exception 'idempotency_in_progress';
  end if;

  select * into v_preview from book_plan_previews
    where id = p_preview_id and claim_token_hash = p_claim_hash
    for update;
  if not found then
    raise exception 'preview_not_found';
  end if;
  if v_preview.expires_at <= now() then
    raise exception 'preview_expired';
  end if;
  if v_preview.owner_user_id is not null and v_preview.owner_user_id <> p_user_id then
    -- Same message as not-found: never confirm another account's preview exists.
    raise exception 'preview_not_found';
  end if;
  if v_preview.status = 'saved' then
    raise exception 'preview_already_saved:%', coalesce(v_preview.saved_project_id::text, '');
  end if;
  if jsonb_typeof(p_chapters) <> 'array' or jsonb_array_length(p_chapters) = 0 then
    raise exception 'invalid_chapters';
  end if;

  insert into projects (user_id, title, audience, description, status, created_via)
    values (p_user_id, left(p_title, 200), p_audience, coalesce(p_description, ''), 'draft', 'chatgpt')
    returning id into v_project_id;

  for v_ch, v_ord in select e.ch, e.ord from jsonb_array_elements(p_chapters) with ordinality as e(ch, ord) loop
    v_body := v_ch->>'body';
    insert into chapters (project_id, chapter_number, title, summary, key_point_ids, target_word_count, sort_order, status)
      values (v_project_id, v_ord::int, left(v_ch->>'title', 200),
              case when p_as_draft then coalesce(v_ch->>'summary', '') else coalesce(v_body, v_ch->>'summary', '') end,
              '[]'::jsonb, p_target_words, (v_ord - 1)::int,
              case when p_as_draft and coalesce(v_body, '') <> '' then 'edited' else 'outlined' end)
      returning id into v_chapter_id;
    if p_as_draft and coalesce(v_body, '') <> '' then
      insert into chapter_contents (chapter_id, content, word_count, generation_params, version)
        values (v_chapter_id, v_body,
                coalesce(array_length(regexp_split_to_array(trim(v_body), '\s+'), 1), 0),
                jsonb_build_object('source', 'chatgpt_import'), 1);
    end if;
  end loop;

  update book_plan_previews
    set status = 'saved', saved_project_id = v_project_id, owner_user_id = p_user_id, updated_at = now()
    where id = p_preview_id;

  v_result := jsonb_build_object('project_id', v_project_id, 'replayed', false);
  update plan_idempotency set result = v_result
    where user_id = p_user_id and operation = 'save_book_plan' and idem_key = p_idem_key;
  return v_result;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ------------------------------------------------------------------
-- 7. Retention: expired previews (and the source text inside them) and old
--    idempotency rows. Called opportunistically by the app; safe to schedule.
-- ------------------------------------------------------------------
create or replace function purge_expired_book_plans() returns integer as $$
declare
  v_count integer;
begin
  delete from book_plan_previews where expires_at <= now();
  get diagnostics v_count = row_count;
  delete from plan_idempotency where created_at < now() - interval '7 days';
  return v_count;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function replace_project_outline(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant  execute on function replace_project_outline(uuid, uuid, jsonb, text) to service_role;
revoke execute on function save_book_plan(uuid, text, text, uuid, text, text, text, text, jsonb, boolean, integer) from public, anon, authenticated;
grant  execute on function save_book_plan(uuid, text, text, uuid, text, text, text, text, jsonb, boolean, integer) to service_role;
revoke execute on function purge_expired_book_plans() from public, anon, authenticated;
grant  execute on function purge_expired_book_plans() to service_role;
