-- Schema-only staging baseline captured from Manuscript on 2026-10-09.
-- Contains no customer rows, auth users, secrets, pricing activation or historical replay.
-- Copied tables/functions stay private: source grants are deliberately NOT restored.
BEGIN;
SET search_path = public, extensions;
SET check_function_bodies = false;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN RAISE EXCEPTION 'Staging baseline requires an empty public schema'; END IF; END $$;
CREATE TABLE public.analysis_moments (project_id uuid NOT NULL, card_id text NOT NULL, user_id uuid NOT NULL, transcript_id uuid NOT NULL, excerpt text NOT NULL, speaker text NOT NULL, importance text NOT NULL, context text DEFAULT ''::text NOT NULL, clarification_answer text DEFAULT ''::text NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.audio_uploads (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, file_path text NOT NULL, file_name text NOT NULL, duration_seconds real, file_size_bytes bigint, status text DEFAULT 'uploaded'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.blog_posts (id uuid DEFAULT gen_random_uuid() NOT NULL, slug text NOT NULL, title text NOT NULL, excerpt text, content text NOT NULL, keywords text[], seo_title text, seo_description text, published boolean DEFAULT false NOT NULL, published_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.book_plan_previews (id uuid DEFAULT gen_random_uuid() NOT NULL, owner_user_id uuid, claim_token_hash text NOT NULL, input_mode text NOT NULL, schema_version integer NOT NULL, plan jsonb NOT NULL, source_segments jsonb DEFAULT '[]'::jsonb NOT NULL, source_digest text, status text DEFAULT 'active'::text NOT NULL, saved_project_id uuid, generated_by text DEFAULT 'client'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, expires_at timestamp with time zone NOT NULL);
CREATE TABLE public.brainstorm_sessions (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, messages jsonb DEFAULT '[]'::jsonb NOT NULL, status text DEFAULT 'active'::text NOT NULL, turn_count integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, notes jsonb, handoff jsonb, recap jsonb);
CREATE TABLE public.chapter_contents (id uuid DEFAULT gen_random_uuid() NOT NULL, chapter_id uuid NOT NULL, content text DEFAULT ''::text NOT NULL, word_count integer DEFAULT 0 NOT NULL, generation_params jsonb DEFAULT '{}'::jsonb NOT NULL, version integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.chapters (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, chapter_number integer NOT NULL, title text NOT NULL, summary text DEFAULT ''::text NOT NULL, key_point_ids jsonb DEFAULT '[]'::jsonb NOT NULL, target_word_count integer DEFAULT 3000 NOT NULL, status text DEFAULT 'outlined'::text NOT NULL, sort_order integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, blended_key_point_ids jsonb DEFAULT '[]'::jsonb);
CREATE TABLE public.deleted_account_emails (email_hash text NOT NULL, deleted_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.edit_events (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, project_id uuid NOT NULL, chapter_id uuid NOT NULL, kind text NOT NULL, instruction text DEFAULT ''::text NOT NULL, before_text text DEFAULT ''::text NOT NULL, after_text text DEFAULT ''::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.enrichments (id uuid DEFAULT gen_random_uuid() NOT NULL, chapter_id uuid NOT NULL, quote_text text NOT NULL, source_author text NOT NULL, source_title text NOT NULL, source_type text DEFAULT 'book'::text NOT NULL, relevance_note text DEFAULT ''::text NOT NULL, included boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.feature_interest (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, feature text NOT NULL, project_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.google_drive_tokens (user_id uuid NOT NULL, refresh_token text NOT NULL, access_token text, access_token_expires_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.ink_balances (user_id uuid NOT NULL, ink_balance numeric(10,4) DEFAULT 10.0 NOT NULL, lifetime_used numeric(10,4) DEFAULT 0 NOT NULL, tier text DEFAULT 'free'::text NOT NULL, stripe_customer_id text, stripe_subscription_id text, current_period_start timestamp with time zone, current_period_end timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, tts_chars_used integer DEFAULT 0 NOT NULL, tts_period_start timestamp with time zone DEFAULT now() NOT NULL, ink_period_start timestamp with time zone DEFAULT now() NOT NULL, topup_ink numeric DEFAULT 0 NOT NULL, topup_tts_chars integer DEFAULT 0 NOT NULL, comp_partner boolean DEFAULT false NOT NULL);
CREATE TABLE public.ink_meter_settings (key text NOT NULL, value numeric NOT NULL, note text);
CREATE TABLE public.ink_rates (model text NOT NULL, usd_in numeric NOT NULL, usd_out numeric NOT NULL, usd_cache_read numeric NOT NULL, usd_cache_write numeric NOT NULL, note text);
CREATE TABLE public.ink_reservations (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, operation text NOT NULL, ink_amount numeric(10,4) NOT NULL, status text DEFAULT 'active'::text NOT NULL, expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, settled_at timestamp with time zone);
CREATE TABLE public.ink_usage (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, project_id uuid, operation text NOT NULL, model text NOT NULL, input_tokens integer DEFAULT 0 NOT NULL, output_tokens integer DEFAULT 0 NOT NULL, total_tokens integer GENERATED ALWAYS AS ((input_tokens + output_tokens)) STORED, created_at timestamp with time zone DEFAULT now() NOT NULL, ink_cost numeric(10,4) GENERATED ALWAYS AS (
CASE
    WHEN (model = 'haiku'::text) THEN ((((input_tokens + output_tokens))::numeric / 1000.0) * 0.25)
    ELSE (((input_tokens + output_tokens))::numeric / 1000.0)
END) STORED, flat_ink_cost numeric(10,4), cache_read_tokens integer DEFAULT 0 NOT NULL, cache_write_tokens integer DEFAULT 0 NOT NULL, billed_ink numeric(10,4));
CREATE TABLE public.jobs (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, type text NOT NULL, status text DEFAULT 'pending'::text NOT NULL, input jsonb DEFAULT '{}'::jsonb NOT NULL, result jsonb, error text, progress jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.key_points (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, transcript_id uuid, title text NOT NULL, summary text NOT NULL, supporting_quotes jsonb DEFAULT '[]'::jsonb NOT NULL, tags jsonb DEFAULT '[]'::jsonb NOT NULL, relevance_score real DEFAULT 0.8 NOT NULL, covered_in_chapter uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, speaker_role text, speaker_name text);
CREATE TABLE public.mind_map_edges (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, source_id uuid NOT NULL, target_id uuid NOT NULL, label text DEFAULT ''::text NOT NULL, edge_type text DEFAULT 'related'::text NOT NULL);
CREATE TABLE public.mind_map_nodes (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, label text NOT NULL, description text DEFAULT ''::text NOT NULL, node_type text DEFAULT 'subtopic'::text NOT NULL, position_x real DEFAULT 0 NOT NULL, position_y real DEFAULT 0 NOT NULL, parent_id uuid, key_point_id uuid);
CREATE TABLE public.outline_snapshots (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, reason text NOT NULL, chapters jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.partner_clicks (partner_id uuid NOT NULL, day date DEFAULT CURRENT_DATE NOT NULL, clicks integer DEFAULT 0 NOT NULL);
CREATE TABLE public.partner_commissions (id uuid DEFAULT gen_random_uuid() NOT NULL, partner_id uuid NOT NULL, user_id uuid NOT NULL, source_id text NOT NULL, payment_intent text, kind text NOT NULL, amount_cents integer NOT NULL, commission_cents integer NOT NULL, status text DEFAULT 'held'::text NOT NULL, available_at timestamp with time zone NOT NULL, payout_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.partner_payouts (id uuid DEFAULT gen_random_uuid() NOT NULL, partner_id uuid NOT NULL, amount_cents integer NOT NULL, status text NOT NULL, stripe_transfer_id text, error text, released_by text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.partners (id uuid DEFAULT gen_random_uuid() NOT NULL, slug text, code text, name text NOT NULL, email text NOT NULL, user_id uuid, status text DEFAULT 'pending'::text NOT NULL, source text DEFAULT 'application'::text NOT NULL, links text, audience text, pitch text, commission_rate numeric(4,3) DEFAULT 0.300 NOT NULL, commission_months integer DEFAULT 12 NOT NULL, stripe_promotion_code_id text, stripe_connect_account_id text, notified_at timestamp with time zone, approved_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.plan_idempotency (user_id uuid NOT NULL, operation text NOT NULL, idem_key text NOT NULL, payload_hash text NOT NULL, result jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.pr_answers (id uuid DEFAULT gen_random_uuid() NOT NULL, question_id uuid NOT NULL, run_id uuid NOT NULL, user_id uuid NOT NULL, transcript text NOT NULL, source text DEFAULT 'typed'::text NOT NULL, follow_up_of uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.pr_chapter_passes (id uuid DEFAULT gen_random_uuid() NOT NULL, run_id uuid NOT NULL, chapter_id uuid NOT NULL, user_id uuid NOT NULL, step text NOT NULL, version_in integer, version_out integer, beat_plan jsonb, scores jsonb, change_log jsonb, usage jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.pr_craft_notes (id uuid DEFAULT gen_random_uuid() NOT NULL, run_id uuid NOT NULL, chapter_id uuid NOT NULL, user_id uuid NOT NULL, span text DEFAULT ''::text NOT NULL, problem text NOT NULL, fix text DEFAULT ''::text NOT NULL, status text DEFAULT 'open'::text NOT NULL, reason text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.pr_questions (id uuid DEFAULT gen_random_uuid() NOT NULL, run_id uuid NOT NULL, chapter_id uuid NOT NULL, user_id uuid NOT NULL, question text NOT NULL, why text DEFAULT ''::text NOT NULL, impact smallint DEFAULT 3 NOT NULL, beat_id text, status text DEFAULT 'queued'::text NOT NULL, asked_round integer, covered_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.pr_runs (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, status text DEFAULT 'drafting'::text NOT NULL, models jsonb DEFAULT '{}'::jsonb NOT NULL, ink_estimate numeric, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, finished_at timestamp with time zone);
CREATE TABLE public.projects (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, title text DEFAULT 'Untitled Project'::text NOT NULL, description text DEFAULT ''::text NOT NULL, audience text DEFAULT 'General'::text NOT NULL, status text DEFAULT 'draft'::text NOT NULL, voice_profile jsonb, narrative_tracker jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, num_chapters integer DEFAULT 8 NOT NULL, target_words_per_chapter integer DEFAULT 2500 NOT NULL, is_public boolean DEFAULT false NOT NULL, published_excerpt text, published_author text, creative_freedom integer DEFAULT 50 NOT NULL, scripture_translation text, brainstorm_topic text, created_via text, page_style text, chapter_opening text, back_cover_hook text, book_hook_options jsonb DEFAULT '[]'::jsonb NOT NULL);
CREATE TABLE public.rate_limit_counters (key text NOT NULL, count integer DEFAULT 0 NOT NULL, window_expires timestamp with time zone NOT NULL);
CREATE TABLE public.referrals (user_id uuid NOT NULL, partner_id uuid NOT NULL, source text NOT NULL, email_hash text, bonus_ink numeric(10,4) DEFAULT 0 NOT NULL, first_paid_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.research_items (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, kind text NOT NULL, text text NOT NULL, attribution text, source_title text NOT NULL, source_url text NOT NULL, source_date text, themes text[] DEFAULT '{}'::text[] NOT NULL, status text DEFAULT 'active'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.research_jobs (id uuid DEFAULT gen_random_uuid() NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL, status text DEFAULT 'running'::text NOT NULL, topic_summary text, queries jsonb, items_added integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, finished_at timestamp with time zone);
CREATE TABLE public.rsvps (id uuid DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, attending boolean NOT NULL, created_at timestamp with time zone DEFAULT now());
CREATE TABLE public.stripe_events (id text NOT NULL, type text NOT NULL, processed_at timestamp with time zone DEFAULT now() NOT NULL, processed boolean DEFAULT false NOT NULL);
CREATE TABLE public.style_deltas (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, project_id uuid NOT NULL, chapter_id uuid NOT NULL, from_version integer NOT NULL, to_version integer NOT NULL, delta jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.topup_purchases (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, sku text NOT NULL, stripe_session_id text NOT NULL, stripe_payment_intent text, amount_cents integer NOT NULL, granted jsonb NOT NULL, status text DEFAULT 'granted'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.transcripts (id uuid DEFAULT gen_random_uuid() NOT NULL, audio_upload_id uuid NOT NULL, project_id uuid NOT NULL, full_text text NOT NULL, segments jsonb DEFAULT '[]'::jsonb NOT NULL, word_count integer DEFAULT 0 NOT NULL, speaker_count integer DEFAULT 1 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, speaker_map jsonb, speakers_confirmed_at timestamp with time zone);
CREATE TABLE public.user_style_memory (user_id uuid NOT NULL, memory jsonb DEFAULT '{}'::jsonb NOT NULL, edits_since_distill integer DEFAULT 0 NOT NULL, distill_count integer DEFAULT 0 NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.user_voice_dials (user_id uuid NOT NULL, dials jsonb DEFAULT '{}'::jsonb NOT NULL, polish_bias numeric DEFAULT 0 NOT NULL, rewrites jsonb DEFAULT '[]'::jsonb NOT NULL, picks integer DEFAULT 0 NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.voice_pairs (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, project_id uuid, dimension text NOT NULL, source_sentence text NOT NULL, option_a text NOT NULL, option_b text NOT NULL, a_pole text NOT NULL, choice text, rewrite text, created_at timestamp with time zone DEFAULT now() NOT NULL, answered_at timestamp with time zone);
CREATE OR REPLACE FUNCTION public.bump_edit_counter(p_user_id uuid, p_threshold integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  insert into user_style_memory (user_id, edits_since_distill, updated_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set edits_since_distill = user_style_memory.edits_since_distill + 1,
        updated_at = now()
  returning edits_since_distill into v_count;
  return v_count >= p_threshold;
end;
$function$;
CREATE OR REPLACE FUNCTION public.bump_partner_click(p_partner_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ insert into partner_clicks (partner_id, day, clicks) values (p_partner_id, current_date, 1) on conflict (partner_id, day) do update set clicks = partner_clicks.clicks + 1; $function$;
CREATE OR REPLACE FUNCTION public.check_and_deduct_tts(p_user_id uuid, p_chars integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_ms integer)
 RETURNS TABLE(allowed boolean, retry_after_ms bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    return query select false::boolean,
      greatest(0, extract(epoch from (v_expires - now())) * 1000)::bigint;
  else
    return query select true::boolean, 0::bigint;
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.claim_partner_referral(p_user_id uuid, p_partner_id uuid, p_source text, p_email_hash text, p_bonus numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_bonus numeric := greatest(coalesce(p_bonus, 0), 0); v_rows integer; begin if v_bonus > 0 and p_email_hash is not null and exists ( select 1 from referrals r where r.email_hash = p_email_hash and r.bonus_ink > 0 ) then v_bonus := 0; end if; insert into referrals (user_id, partner_id, source, email_hash, bonus_ink) values (p_user_id, p_partner_id, p_source, p_email_hash, v_bonus) on conflict (user_id) do nothing; get diagnostics v_rows = row_count; if v_rows = 0 then return null; end if; if v_bonus > 0 then update ink_balances set topup_ink = coalesce(topup_ink, 0) + v_bonus where user_id = p_user_id; get diagnostics v_rows = row_count; if v_rows = 0 then raise exception 'claim_partner_referral: no ink_balances row for %', p_user_id; end if; end if; return v_bonus; end; $function$;
CREATE OR REPLACE FUNCTION public.deduct_ink(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.deduct_ink_flat(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_ink_cost numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.deduct_ink_v2(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_cache_read_tokens integer DEFAULT 0, p_cache_write_tokens integer DEFAULT 0)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_ink_cost numeric; v_row ink_balances%rowtype; v_new_balance numeric; v_from_monthly numeric; v_from_topup numeric; begin v_ink_cost := ink_cost_v2(p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens); select * into v_row from ink_balances where user_id = p_user_id for update; if not found then insert into ink_balances (user_id, ink_balance) values (p_user_id, 0) on conflict (user_id) do nothing; select * into v_row from ink_balances where user_id = p_user_id for update; end if; if v_row.tier <> 'free' and v_row.ink_period_start < now() - interval '30 days' then update ink_balances set ink_balance = tier_ink_allotment(v_row.tier), ink_period_start = now() where user_id = p_user_id; v_row.ink_balance := tier_ink_allotment(v_row.tier); end if; if v_row.ink_balance + coalesce(v_row.topup_ink, 0) < v_ink_cost then raise exception 'Insufficient Ink balance'; end if; v_from_monthly := least(v_row.ink_balance, v_ink_cost); v_from_topup := v_ink_cost - v_from_monthly; update ink_balances set ink_balance = ink_balance - v_from_monthly, topup_ink = topup_ink - v_from_topup, lifetime_used = lifetime_used + v_ink_cost where user_id = p_user_id returning ink_balances.ink_balance into v_new_balance; insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, billed_ink) values (p_user_id, p_project_id, p_operation, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_cache_read_tokens, 0), coalesce(p_cache_write_tokens, 0), v_ink_cost); return v_new_balance; end; $function$;
CREATE OR REPLACE FUNCTION public.ensure_ink_balance(p_user_id uuid, p_email_hashes text[] DEFAULT NULL::text[])
 RETURNS TABLE(ink_balance numeric, lifetime_used numeric, tier text, topup_ink numeric, topup_tts_chars integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.ink_cost_v2(p_model text, p_input_tokens integer, p_output_tokens integer, p_cache_read_tokens integer, p_cache_write_tokens integer)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare r ink_rates%rowtype; v_mult numeric; v_usd numeric; begin select * into r from ink_rates where model = p_model; if not found then select * into r from ink_rates where model = 'sonnet'; end if; select value into v_mult from ink_meter_settings where key = 'ink_per_vendor_dollar'; v_usd := ( coalesce(p_input_tokens, 0) * r.usd_in + coalesce(p_output_tokens, 0) * r.usd_out + coalesce(p_cache_read_tokens, 0) * r.usd_cache_read + coalesce(p_cache_write_tokens, 0) * r.usd_cache_write ) / 1000000.0; return round(v_usd * coalesce(v_mult, 102), 4); end; $function$;
CREATE OR REPLACE FUNCTION public.model_ink_factor(p_model text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  case p_model
    when 'haiku'  then return 0.25;
    when 'sonnet' then return 1.0;
    else               return 1.0;  -- unknown models bill at the quality rate
  end case;
end;
$function$;
CREATE OR REPLACE FUNCTION public.purge_expired_book_plans()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  delete from book_plan_previews where expires_at <= now();
  get diagnostics v_count = row_count;
  delete from plan_idempotency where created_at < now() - interval '7 days';
  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.release_ink_reservation(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update ink_reservations
    set status = 'released', settled_at = now()
    where id = p_reservation_id and status = 'active';
end;
$function$;
CREATE OR REPLACE FUNCTION public.replace_project_outline(p_project_id uuid, p_user_id uuid, p_chapters jsonb, p_reason text DEFAULT 'outline_regenerate'::text)
 RETURNS SETOF chapters
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.reserve_ink(p_user_id uuid, p_operation text, p_ink_amount numeric)
 RETURNS TABLE(reservation_id uuid, ink_balance numeric, lifetime_used numeric, tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.save_book_plan(p_user_id uuid, p_idem_key text, p_payload_hash text, p_preview_id uuid, p_claim_hash text, p_title text, p_audience text, p_description text, p_chapters jsonb, p_as_draft boolean, p_target_words integer DEFAULT 2500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.settle_ink_reservation(p_reservation_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_flat_ink_cost numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.settle_ink_reservation_v2(p_reservation_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_flat_ink_cost numeric DEFAULT NULL::numeric, p_cache_read_tokens integer DEFAULT 0, p_cache_write_tokens integer DEFAULT 0)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_row ink_balances%rowtype; v_reservation ink_reservations%rowtype; v_other_reserved numeric; v_cost numeric; v_new_balance numeric; v_from_monthly numeric; v_from_topup numeric; begin select * into v_reservation from ink_reservations where id = p_reservation_id for update; if not found or v_reservation.status <> 'active' or v_reservation.expires_at <= now() then raise exception 'Ink reservation is unavailable'; end if; select * into v_row from ink_balances where user_id = v_reservation.user_id for update; select coalesce(sum(ink_amount), 0) into v_other_reserved from ink_reservations where user_id = v_reservation.user_id and id <> p_reservation_id and status = 'active' and expires_at > now(); v_cost := coalesce(p_flat_ink_cost, ink_cost_v2(p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens)); if v_cost < 0 then raise exception 'Negative Ink cost'; end if; if v_row.ink_balance + coalesce(v_row.topup_ink, 0) - v_other_reserved < v_cost then raise exception 'Insufficient Ink balance'; end if; v_from_monthly := least(v_row.ink_balance, v_cost); v_from_topup := v_cost - v_from_monthly; update ink_balances set ink_balance = ink_balance - v_from_monthly, topup_ink = topup_ink - v_from_topup, lifetime_used = lifetime_used + v_cost where user_id = v_reservation.user_id returning ink_balance into v_new_balance; update ink_reservations set status = 'settled', settled_at = now() where id = p_reservation_id; insert into ink_usage (user_id, project_id, operation, model, input_tokens, output_tokens, flat_ink_cost, cache_read_tokens, cache_write_tokens, billed_ink) values (v_reservation.user_id, p_project_id, p_operation, p_model, coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), p_flat_ink_cost, coalesce(p_cache_read_tokens, 0), coalesce(p_cache_write_tokens, 0), v_cost); return v_new_balance; end; $function$;
CREATE OR REPLACE FUNCTION public.tier_ink_allotment(p_tier text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  case p_tier
    when 'starter' then return 300;
    when 'pro'     then return 660;
    when 'premium' then return 1500;
    when 'free'    then return 10;   -- one-time trial; never refilled (see below)
    else                return 0;
  end case;
end;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_card_id_check" CHECK (length(card_id) <= 120);
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_clarification_answer_check" CHECK (length(clarification_answer) <= 3000);
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_context_check" CHECK (length(context) <= 6000);
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_excerpt_check" CHECK (length(excerpt) <= 12000);
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_importance_check" CHECK (importance = ANY (ARRAY['essential'::text, 'supporting'::text, 'exclude'::text]));
ALTER TABLE public."audio_uploads" ADD CONSTRAINT "audio_uploads_status_check" CHECK (status = ANY (ARRAY['uploaded'::text, 'transcribing'::text, 'transcribed'::text, 'failed'::text]));
ALTER TABLE public."book_plan_previews" ADD CONSTRAINT "book_plan_previews_generated_by_check" CHECK (generated_by = ANY (ARRAY['client'::text, 'server'::text, 'import'::text]));
ALTER TABLE public."book_plan_previews" ADD CONSTRAINT "book_plan_previews_input_mode_check" CHECK (input_mode = ANY (ARRAY['idea'::text, 'source'::text, 'import'::text]));
ALTER TABLE public."book_plan_previews" ADD CONSTRAINT "book_plan_previews_status_check" CHECK (status = ANY (ARRAY['active'::text, 'saved'::text]));
ALTER TABLE public."brainstorm_sessions" ADD CONSTRAINT "brainstorm_sessions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'finished'::text, 'discarded'::text]));
ALTER TABLE public."chapters" ADD CONSTRAINT "chapters_status_check" CHECK (status = ANY (ARRAY['outlined'::text, 'generating'::text, 'generated'::text, 'edited'::text]));
ALTER TABLE public."edit_events" ADD CONSTRAINT "edit_events_kind_check" CHECK (kind = ANY (ARRAY['magic_edit'::text, 'rewrite_bar'::text, 'manual_save'::text]));
ALTER TABLE public."enrichments" ADD CONSTRAINT "enrichments_source_type_check" CHECK (source_type = ANY (ARRAY['book'::text, 'article'::text, 'scripture'::text, 'speech'::text, 'research'::text]));
ALTER TABLE public."ink_reservations" ADD CONSTRAINT "ink_reservations_ink_amount_check" CHECK (ink_amount > 0::numeric);
ALTER TABLE public."ink_reservations" ADD CONSTRAINT "ink_reservations_status_check" CHECK (status = ANY (ARRAY['active'::text, 'settled'::text, 'released'::text]));
ALTER TABLE public."jobs" ADD CONSTRAINT "jobs_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]));
ALTER TABLE public."jobs" ADD CONSTRAINT "jobs_type_check" CHECK (type = ANY (ARRAY['analyze'::text, 'outline'::text, 'generate'::text, 'generate-all'::text, 'coherence'::text, 'enrich'::text]));
ALTER TABLE public."key_points" ADD CONSTRAINT "key_points_speaker_role_check" CHECK (speaker_role = ANY (ARRAY['author'::text, 'other'::text, 'mixed'::text]));
ALTER TABLE public."mind_map_edges" ADD CONSTRAINT "mind_map_edges_edge_type_check" CHECK (edge_type = ANY (ARRAY['related'::text, 'supports'::text, 'contradicts'::text, 'leads_to'::text]));
ALTER TABLE public."mind_map_nodes" ADD CONSTRAINT "mind_map_nodes_node_type_check" CHECK (node_type = ANY (ARRAY['topic'::text, 'subtopic'::text, 'quote'::text, 'scripture'::text, 'illustration'::text]));
ALTER TABLE public."partner_commissions" ADD CONSTRAINT "partner_commissions_amount_cents_check" CHECK (amount_cents >= 0);
ALTER TABLE public."partner_commissions" ADD CONSTRAINT "partner_commissions_commission_cents_check" CHECK (commission_cents >= 0);
ALTER TABLE public."partner_commissions" ADD CONSTRAINT "partner_commissions_kind_check" CHECK (kind = ANY (ARRAY['subscription'::text, 'topup'::text]));
ALTER TABLE public."partner_commissions" ADD CONSTRAINT "partner_commissions_status_check" CHECK (status = ANY (ARRAY['held'::text, 'paid'::text, 'void'::text]));
ALTER TABLE public."partner_payouts" ADD CONSTRAINT "partner_payouts_amount_cents_check" CHECK (amount_cents > 0);
ALTER TABLE public."partner_payouts" ADD CONSTRAINT "partner_payouts_status_check" CHECK (status = ANY (ARRAY['released'::text, 'failed'::text]));
ALTER TABLE public."partners" ADD CONSTRAINT "partners_code_check" CHECK (code IS NULL OR code ~ '^[A-Z0-9-]{3,24}$'::text);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_commission_months_check" CHECK (commission_months >= 1 AND commission_months <= 60);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_commission_rate_check" CHECK (commission_rate >= 0::numeric AND commission_rate <= 0.9);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_slug_check" CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]{2,32}$'::text);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_source_check" CHECK (source = ANY (ARRAY['application'::text, 'invite'::text]));
ALTER TABLE public."partners" ADD CONSTRAINT "partners_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'paused'::text, 'declined'::text]));
ALTER TABLE public."pr_answers" ADD CONSTRAINT "pr_answers_source_check" CHECK (source = ANY (ARRAY['typed'::text, 'voice'::text]));
ALTER TABLE public."pr_chapter_passes" ADD CONSTRAINT "pr_chapter_passes_step_check" CHECK (step = ANY (ARRAY['draft'::text, 'edit'::text, 'revise'::text, 'final'::text]));
ALTER TABLE public."pr_craft_notes" ADD CONSTRAINT "pr_craft_notes_status_check" CHECK (status = ANY (ARRAY['open'::text, 'fixed'::text, 'declined'::text]));
ALTER TABLE public."pr_questions" ADD CONSTRAINT "pr_questions_impact_check" CHECK (impact >= 1 AND impact <= 5);
ALTER TABLE public."pr_questions" ADD CONSTRAINT "pr_questions_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'asked'::text, 'answered'::text, 'skipped'::text, 'dropped_covered'::text, 'unanswered'::text]));
ALTER TABLE public."pr_runs" ADD CONSTRAINT "pr_runs_status_check" CHECK (status = ANY (ARRAY['drafting'::text, 'editing'::text, 'interviewing'::text, 'revising'::text, 'checking'::text, 'done'::text, 'cancelled'::text]));
ALTER TABLE public."projects" ADD CONSTRAINT "projects_audience_check" CHECK (audience = ANY (ARRAY['General'::text, 'Christian Living'::text, 'Faith Community'::text, 'Leadership'::text, 'Business & Economics'::text, 'Self-Help'::text, 'Personal Development'::text, 'Health & Wellness'::text, 'Relationships & Family'::text, 'Parenting'::text, 'Memoir & Biography'::text, 'Lifestyle'::text, 'Psychology & Motivation'::text, 'Money & Finance'::text, 'Young Adult'::text, 'Academic'::text, 'Business/Leadership'::text]));
ALTER TABLE public."projects" ADD CONSTRAINT "projects_back_cover_hook_check" CHECK (char_length(back_cover_hook) <= 1200);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_book_hook_options_check" CHECK (jsonb_typeof(book_hook_options) = 'array'::text);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_chapter_opening_check" CHECK (chapter_opening = ANY (ARRAY['numeral'::text, 'dropcap'::text, 'minimal'::text, 'divider'::text]));
ALTER TABLE public."projects" ADD CONSTRAINT "projects_page_style_check" CHECK (page_style = ANY (ARRAY['classic'::text, 'modern'::text, 'warm'::text, 'bold'::text]));
ALTER TABLE public."projects" ADD CONSTRAINT "projects_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'complete'::text, 'erased'::text]));
ALTER TABLE public."referrals" ADD CONSTRAINT "referrals_source_check" CHECK (source = ANY (ARRAY['link'::text, 'code'::text, 'checkout'::text]));
ALTER TABLE public."research_items" ADD CONSTRAINT "research_items_kind_check" CHECK (kind = ANY (ARRAY['quote'::text, 'stat'::text, 'reference'::text]));
ALTER TABLE public."research_items" ADD CONSTRAINT "research_items_status_check" CHECK (status = ANY (ARRAY['active'::text, 'dismissed'::text]));
ALTER TABLE public."research_jobs" ADD CONSTRAINT "research_jobs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'done'::text, 'failed'::text, 'skipped'::text]));
ALTER TABLE public."topup_purchases" ADD CONSTRAINT "topup_purchases_sku_check" CHECK (sku = ANY (ARRAY['voice_pack'::text, 'ink_pack'::text]));
ALTER TABLE public."topup_purchases" ADD CONSTRAINT "topup_purchases_status_check" CHECK (status = ANY (ARRAY['granted'::text, 'clawed_back'::text]));
ALTER TABLE public."voice_pairs" ADD CONSTRAINT "voice_pairs_choice_check" CHECK (choice = ANY (ARRAY['a'::text, 'b'::text, 'neither'::text]));
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_pkey" PRIMARY KEY (project_id, card_id);
ALTER TABLE public."audio_uploads" ADD CONSTRAINT "audio_uploads_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY (id);
ALTER TABLE public."book_plan_previews" ADD CONSTRAINT "book_plan_previews_pkey" PRIMARY KEY (id);
ALTER TABLE public."brainstorm_sessions" ADD CONSTRAINT "brainstorm_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."chapter_contents" ADD CONSTRAINT "chapter_contents_pkey" PRIMARY KEY (id);
ALTER TABLE public."chapters" ADD CONSTRAINT "chapters_pkey" PRIMARY KEY (id);
ALTER TABLE public."deleted_account_emails" ADD CONSTRAINT "deleted_account_emails_pkey" PRIMARY KEY (email_hash);
ALTER TABLE public."edit_events" ADD CONSTRAINT "edit_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."enrichments" ADD CONSTRAINT "enrichments_pkey" PRIMARY KEY (id);
ALTER TABLE public."feature_interest" ADD CONSTRAINT "feature_interest_pkey" PRIMARY KEY (id);
ALTER TABLE public."google_drive_tokens" ADD CONSTRAINT "google_drive_tokens_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."ink_balances" ADD CONSTRAINT "ink_balances_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."ink_meter_settings" ADD CONSTRAINT "ink_meter_settings_pkey" PRIMARY KEY (key);
ALTER TABLE public."ink_rates" ADD CONSTRAINT "ink_rates_pkey" PRIMARY KEY (model);
ALTER TABLE public."ink_reservations" ADD CONSTRAINT "ink_reservations_pkey" PRIMARY KEY (id);
ALTER TABLE public."ink_usage" ADD CONSTRAINT "ink_usage_pkey" PRIMARY KEY (id);
ALTER TABLE public."jobs" ADD CONSTRAINT "jobs_pkey" PRIMARY KEY (id);
ALTER TABLE public."key_points" ADD CONSTRAINT "key_points_pkey" PRIMARY KEY (id);
ALTER TABLE public."mind_map_edges" ADD CONSTRAINT "mind_map_edges_pkey" PRIMARY KEY (id);
ALTER TABLE public."mind_map_nodes" ADD CONSTRAINT "mind_map_nodes_pkey" PRIMARY KEY (id);
ALTER TABLE public."outline_snapshots" ADD CONSTRAINT "outline_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."partner_clicks" ADD CONSTRAINT "partner_clicks_pkey" PRIMARY KEY (partner_id, day);
ALTER TABLE public."partner_commissions" ADD CONSTRAINT "partner_commissions_pkey" PRIMARY KEY (id);
ALTER TABLE public."partner_payouts" ADD CONSTRAINT "partner_payouts_pkey" PRIMARY KEY (id);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_pkey" PRIMARY KEY (id);
ALTER TABLE public."plan_idempotency" ADD CONSTRAINT "plan_idempotency_pkey" PRIMARY KEY (user_id, operation, idem_key);
ALTER TABLE public."pr_answers" ADD CONSTRAINT "pr_answers_pkey" PRIMARY KEY (id);
ALTER TABLE public."pr_chapter_passes" ADD CONSTRAINT "pr_chapter_passes_pkey" PRIMARY KEY (id);
ALTER TABLE public."pr_craft_notes" ADD CONSTRAINT "pr_craft_notes_pkey" PRIMARY KEY (id);
ALTER TABLE public."pr_questions" ADD CONSTRAINT "pr_questions_pkey" PRIMARY KEY (id);
ALTER TABLE public."pr_runs" ADD CONSTRAINT "pr_runs_pkey" PRIMARY KEY (id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_pkey" PRIMARY KEY (id);
ALTER TABLE public."rate_limit_counters" ADD CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY (key);
ALTER TABLE public."referrals" ADD CONSTRAINT "referrals_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."research_items" ADD CONSTRAINT "research_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."research_jobs" ADD CONSTRAINT "research_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE public."rsvps" ADD CONSTRAINT "rsvps_pkey" PRIMARY KEY (id);
ALTER TABLE public."stripe_events" ADD CONSTRAINT "stripe_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."style_deltas" ADD CONSTRAINT "style_deltas_pkey" PRIMARY KEY (id);
ALTER TABLE public."topup_purchases" ADD CONSTRAINT "topup_purchases_pkey" PRIMARY KEY (id);
ALTER TABLE public."transcripts" ADD CONSTRAINT "transcripts_pkey" PRIMARY KEY (id);
ALTER TABLE public."user_style_memory" ADD CONSTRAINT "user_style_memory_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."user_voice_dials" ADD CONSTRAINT "user_voice_dials_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."voice_pairs" ADD CONSTRAINT "voice_pairs_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_slug_key" UNIQUE (slug);
ALTER TABLE public."chapter_contents" ADD CONSTRAINT "chapter_contents_chapter_id_version_key" UNIQUE (chapter_id, version);
ALTER TABLE public."chapters" ADD CONSTRAINT "chapters_project_id_chapter_number_key" UNIQUE (project_id, chapter_number);
ALTER TABLE public."feature_interest" ADD CONSTRAINT "feature_interest_user_id_feature_key" UNIQUE (user_id, feature);
ALTER TABLE public."partner_commissions" ADD CONSTRAINT "partner_commissions_source_id_key" UNIQUE (source_id);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_code_key" UNIQUE (code);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_slug_key" UNIQUE (slug);
ALTER TABLE public."partners" ADD CONSTRAINT "partners_user_id_key" UNIQUE (user_id);
ALTER TABLE public."pr_chapter_passes" ADD CONSTRAINT "pr_chapter_passes_run_id_chapter_id_step_key" UNIQUE (run_id, chapter_id, step);
ALTER TABLE public."topup_purchases" ADD CONSTRAINT "topup_purchases_stripe_session_id_key" UNIQUE (stripe_session_id);
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_transcript_id_fkey" FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE;
ALTER TABLE public."analysis_moments" ADD CONSTRAINT "analysis_moments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."audio_uploads" ADD CONSTRAINT "audio_uploads_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."book_plan_previews" ADD CONSTRAINT "book_plan_previews_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."book_plan_previews" ADD CONSTRAINT "book_plan_previews_saved_project_id_fkey" FOREIGN KEY (saved_project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public."brainstorm_sessions" ADD CONSTRAINT "brainstorm_sessions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."chapter_contents" ADD CONSTRAINT "chapter_contents_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public."chapters" ADD CONSTRAINT "chapters_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."edit_events" ADD CONSTRAINT "edit_events_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public."edit_events" ADD CONSTRAINT "edit_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."enrichments" ADD CONSTRAINT "enrichments_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public."feature_interest" ADD CONSTRAINT "feature_interest_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public."feature_interest" ADD CONSTRAINT "feature_interest_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."key_points" ADD CONSTRAINT "fk_covered_in_chapter" FOREIGN KEY (covered_in_chapter) REFERENCES chapters(id) ON DELETE SET NULL;
ALTER TABLE public."google_drive_tokens" ADD CONSTRAINT "google_drive_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."ink_reservations" ADD CONSTRAINT "ink_reservations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."ink_usage" ADD CONSTRAINT "ink_usage_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public."jobs" ADD CONSTRAINT "jobs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."key_points" ADD CONSTRAINT "key_points_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."key_points" ADD CONSTRAINT "key_points_transcript_id_fkey" FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE SET NULL;
ALTER TABLE public."mind_map_edges" ADD CONSTRAINT "mind_map_edges_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."mind_map_edges" ADD CONSTRAINT "mind_map_edges_source_id_fkey" FOREIGN KEY (source_id) REFERENCES mind_map_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."mind_map_edges" ADD CONSTRAINT "mind_map_edges_target_id_fkey" FOREIGN KEY (target_id) REFERENCES mind_map_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."mind_map_nodes" ADD CONSTRAINT "mind_map_nodes_key_point_id_fkey" FOREIGN KEY (key_point_id) REFERENCES key_points(id) ON DELETE SET NULL;
ALTER TABLE public."mind_map_nodes" ADD CONSTRAINT "mind_map_nodes_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES mind_map_nodes(id) ON DELETE SET NULL;
ALTER TABLE public."mind_map_nodes" ADD CONSTRAINT "mind_map_nodes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."outline_snapshots" ADD CONSTRAINT "outline_snapshots_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."partner_clicks" ADD CONSTRAINT "partner_clicks_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE;
ALTER TABLE public."partner_commissions" ADD CONSTRAINT "partner_commissions_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id);
ALTER TABLE public."partner_payouts" ADD CONSTRAINT "partner_payouts_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id);
ALTER TABLE public."plan_idempotency" ADD CONSTRAINT "plan_idempotency_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."pr_answers" ADD CONSTRAINT "pr_answers_follow_up_of_fkey" FOREIGN KEY (follow_up_of) REFERENCES pr_answers(id) ON DELETE SET NULL;
ALTER TABLE public."pr_answers" ADD CONSTRAINT "pr_answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES pr_questions(id) ON DELETE CASCADE;
ALTER TABLE public."pr_answers" ADD CONSTRAINT "pr_answers_run_id_fkey" FOREIGN KEY (run_id) REFERENCES pr_runs(id) ON DELETE CASCADE;
ALTER TABLE public."pr_chapter_passes" ADD CONSTRAINT "pr_chapter_passes_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public."pr_chapter_passes" ADD CONSTRAINT "pr_chapter_passes_run_id_fkey" FOREIGN KEY (run_id) REFERENCES pr_runs(id) ON DELETE CASCADE;
ALTER TABLE public."pr_craft_notes" ADD CONSTRAINT "pr_craft_notes_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public."pr_craft_notes" ADD CONSTRAINT "pr_craft_notes_run_id_fkey" FOREIGN KEY (run_id) REFERENCES pr_runs(id) ON DELETE CASCADE;
ALTER TABLE public."pr_questions" ADD CONSTRAINT "pr_questions_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public."pr_questions" ADD CONSTRAINT "pr_questions_run_id_fkey" FOREIGN KEY (run_id) REFERENCES pr_runs(id) ON DELETE CASCADE;
ALTER TABLE public."pr_runs" ADD CONSTRAINT "pr_runs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."referrals" ADD CONSTRAINT "referrals_partner_id_fkey" FOREIGN KEY (partner_id) REFERENCES partners(id);
ALTER TABLE public."research_items" ADD CONSTRAINT "research_items_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."research_jobs" ADD CONSTRAINT "research_jobs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."style_deltas" ADD CONSTRAINT "style_deltas_chapter_id_fkey" FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE;
ALTER TABLE public."style_deltas" ADD CONSTRAINT "style_deltas_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."transcripts" ADD CONSTRAINT "transcripts_audio_upload_id_fkey" FOREIGN KEY (audio_upload_id) REFERENCES audio_uploads(id) ON DELETE CASCADE;
ALTER TABLE public."transcripts" ADD CONSTRAINT "transcripts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."voice_pairs" ADD CONSTRAINT "voice_pairs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX analysis_moments_transcript_id_idx ON public.analysis_moments USING btree (transcript_id);
CREATE INDEX analysis_moments_user_id_idx ON public.analysis_moments USING btree (user_id);
CREATE INDEX blog_posts_published_idx ON public.blog_posts USING btree (published, published_at DESC);
CREATE INDEX book_plan_previews_expires_idx ON public.book_plan_previews USING btree (expires_at);
CREATE INDEX book_plan_previews_owner_idx ON public.book_plan_previews USING btree (owner_user_id) WHERE (owner_user_id IS NOT NULL);
CREATE INDEX brainstorm_sessions_finished_idx ON public.brainstorm_sessions USING btree (project_id, updated_at DESC) WHERE (status = 'finished'::text);
CREATE UNIQUE INDEX brainstorm_sessions_one_active ON public.brainstorm_sessions USING btree (project_id) WHERE (status = 'active'::text);
CREATE INDEX brainstorm_sessions_user_id_idx ON public.brainstorm_sessions USING btree (user_id);
CREATE INDEX feature_interest_feature_idx ON public.feature_interest USING btree (feature);
CREATE INDEX idx_audio_uploads_project ON public.audio_uploads USING btree (project_id);
CREATE INDEX idx_chapter_contents_chapter ON public.chapter_contents USING btree (chapter_id);
CREATE INDEX idx_chapters_project ON public.chapters USING btree (project_id);
CREATE INDEX idx_commissions_partner ON public.partner_commissions USING btree (partner_id, status);
CREATE INDEX idx_commissions_pi ON public.partner_commissions USING btree (payment_intent);
CREATE INDEX idx_commissions_user ON public.partner_commissions USING btree (user_id);
CREATE INDEX idx_edit_events_user ON public.edit_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_enrichments_chapter ON public.enrichments USING btree (chapter_id);
CREATE INDEX idx_ink_usage_user ON public.ink_usage USING btree (user_id);
CREATE INDEX idx_ink_usage_user_created ON public.ink_usage USING btree (user_id, created_at DESC);
CREATE INDEX idx_jobs_project ON public.jobs USING btree (project_id);
CREATE INDEX idx_jobs_status ON public.jobs USING btree (status);
CREATE INDEX idx_key_points_project ON public.key_points USING btree (project_id);
CREATE INDEX idx_mind_map_edges_project ON public.mind_map_edges USING btree (project_id);
CREATE INDEX idx_mind_map_nodes_project ON public.mind_map_nodes USING btree (project_id);
CREATE INDEX idx_partners_email ON public.partners USING btree (lower(email));
CREATE INDEX idx_partners_status ON public.partners USING btree (status);
CREATE INDEX idx_payouts_partner ON public.partner_payouts USING btree (partner_id);
CREATE INDEX idx_referrals_partner ON public.referrals USING btree (partner_id);
CREATE INDEX idx_style_deltas_user ON public.style_deltas USING btree (user_id, created_at DESC);
CREATE INDEX idx_transcripts_project ON public.transcripts USING btree (project_id);
CREATE INDEX ink_reservations_active_user_idx ON public.ink_reservations USING btree (user_id, expires_at) WHERE (status = 'active'::text);
CREATE INDEX outline_snapshots_project_idx ON public.outline_snapshots USING btree (project_id, created_at DESC);
CREATE INDEX pr_answers_run_idx ON public.pr_answers USING btree (run_id);
CREATE INDEX pr_chapter_passes_run_idx ON public.pr_chapter_passes USING btree (run_id);
CREATE INDEX pr_craft_notes_run_idx ON public.pr_craft_notes USING btree (run_id, chapter_id);
CREATE INDEX pr_questions_run_idx ON public.pr_questions USING btree (run_id, chapter_id, status);
CREATE UNIQUE INDEX pr_runs_one_live ON public.pr_runs USING btree (project_id) WHERE (status <> ALL (ARRAY['done'::text, 'cancelled'::text]));
CREATE INDEX pr_runs_project_idx ON public.pr_runs USING btree (project_id, created_at DESC);
CREATE INDEX pr_runs_user_idx ON public.pr_runs USING btree (user_id);
CREATE INDEX research_items_project ON public.research_items USING btree (project_id) WHERE (status = 'active'::text);
CREATE INDEX research_jobs_project ON public.research_jobs USING btree (project_id, created_at DESC);
CREATE INDEX topup_purchases_payment_intent_idx ON public.topup_purchases USING btree (stripe_payment_intent) WHERE (stripe_payment_intent IS NOT NULL);
CREATE INDEX topup_purchases_user_id_idx ON public.topup_purchases USING btree (user_id);
CREATE UNIQUE INDEX uq_referrals_bonus_email ON public.referrals USING btree (email_hash) WHERE ((bonus_ink > (0)::numeric) AND (email_hash IS NOT NULL));
CREATE INDEX voice_pairs_user_idx ON public.voice_pairs USING btree (user_id, answered_at);
ALTER TABLE public."analysis_moments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audio_uploads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."blog_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."book_plan_previews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."brainstorm_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chapter_contents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chapters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deleted_account_emails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."edit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."enrichments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feature_interest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_drive_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ink_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ink_meter_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ink_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ink_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ink_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."key_points" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mind_map_edges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mind_map_nodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."outline_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_clicks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_commissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."plan_idempotency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pr_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pr_chapter_passes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pr_craft_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pr_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pr_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rate_limit_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."research_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."research_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rsvps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stripe_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."style_deltas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."topup_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_style_memory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_voice_dials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voice_pairs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors read their own analysis choices" ON public."analysis_moments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = analysis_moments.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Authors save their own analysis choices" ON public."analysis_moments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM (projects p
     JOIN transcripts t ON ((t.project_id = p.id)))
  WHERE ((p.id = analysis_moments.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid)) AND (t.id = analysis_moments.transcript_id))))));
CREATE POLICY "Authors update their own analysis choices" ON public."analysis_moments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM (projects p
     JOIN transcripts t ON ((t.project_id = p.id)))
  WHERE ((p.id = analysis_moments.project_id) AND (p.user_id = ( SELECT auth.uid() AS uid)) AND (t.id = analysis_moments.transcript_id))))));
CREATE POLICY "Users can CRUD own audio_uploads" ON public."audio_uploads" AS PERMISSIVE FOR ALL TO PUBLIC USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));
CREATE POLICY "Public can read published posts" ON public."blog_posts" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((published = true));
CREATE POLICY "read own brainstorm sessions" ON public."brainstorm_sessions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can CRUD own chapter_contents" ON public."chapter_contents" AS PERMISSIVE FOR ALL TO PUBLIC USING ((chapter_id IN ( SELECT c.id
   FROM (chapters c
     JOIN projects p ON ((c.project_id = p.id)))
  WHERE (p.user_id = auth.uid())))) WITH CHECK ((chapter_id IN ( SELECT c.id
   FROM (chapters c
     JOIN projects p ON ((c.project_id = p.id)))
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "Users can CRUD own chapters" ON public."chapters" AS PERMISSIVE FOR ALL TO PUBLIC USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));
CREATE POLICY "Users read own edit_events" ON public."edit_events" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "Users can CRUD own enrichments" ON public."enrichments" AS PERMISSIVE FOR ALL TO PUBLIC USING ((chapter_id IN ( SELECT c.id
   FROM (chapters c
     JOIN projects p ON ((c.project_id = p.id)))
  WHERE (p.user_id = auth.uid())))) WITH CHECK ((chapter_id IN ( SELECT c.id
   FROM (chapters c
     JOIN projects p ON ((c.project_id = p.id)))
  WHERE (p.user_id = auth.uid()))));
CREATE POLICY "Users can read own balance" ON public."ink_balances" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "Users can read own usage" ON public."ink_usage" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "Users can CRUD own jobs" ON public."jobs" AS PERMISSIVE FOR ALL TO PUBLIC USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));
CREATE POLICY "Users can CRUD own key_points" ON public."key_points" AS PERMISSIVE FOR ALL TO PUBLIC USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));
CREATE POLICY "Users can CRUD own mind_map_edges" ON public."mind_map_edges" AS PERMISSIVE FOR ALL TO PUBLIC USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));
CREATE POLICY "Users can CRUD own mind_map_nodes" ON public."mind_map_nodes" AS PERMISSIVE FOR ALL TO PUBLIC USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));
CREATE POLICY "read own pr answers" ON public."pr_answers" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "read own pr chapter passes" ON public."pr_chapter_passes" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "read own pr craft notes" ON public."pr_craft_notes" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "read own pr questions" ON public."pr_questions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "read own pr runs" ON public."pr_runs" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can CRUD own projects" ON public."projects" AS PERMISSIVE FOR ALL TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "read own research items" ON public."research_items" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "read own research jobs" ON public."research_jobs" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Allow authenticated read" ON public."rsvps" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow public insert" ON public."rsvps" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);
CREATE POLICY "Users read own style_deltas" ON public."style_deltas" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "read own topup purchases" ON public."topup_purchases" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can CRUD own transcripts" ON public."transcripts" AS PERMISSIVE FOR ALL TO PUBLIC USING ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid())))) WITH CHECK ((project_id IN ( SELECT projects.id
   FROM projects
  WHERE (projects.user_id = auth.uid()))));
CREATE POLICY "Users read own style_memory" ON public."user_style_memory" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "read own voice dials" ON public."user_voice_dials" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "read own voice pairs" ON public."voice_pairs" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE TRIGGER blog_posts_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_chapter_contents_updated_at BEFORE UPDATE ON chapter_contents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_chapters_updated_at BEFORE UPDATE ON chapters FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ink_balances_updated_at BEFORE UPDATE ON ink_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_partners_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
REVOKE ALL ON TABLE public."analysis_moments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."audio_uploads" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."blog_posts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."book_plan_previews" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."brainstorm_sessions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."chapter_contents" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."chapters" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."deleted_account_emails" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."edit_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."enrichments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."feature_interest" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."google_drive_tokens" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ink_balances" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ink_meter_settings" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ink_rates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ink_reservations" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ink_usage" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."jobs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."key_points" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."mind_map_edges" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."mind_map_nodes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."outline_snapshots" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."partner_clicks" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."partner_commissions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."partner_payouts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."partners" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."plan_idempotency" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."pr_answers" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."pr_chapter_passes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."pr_craft_notes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."pr_questions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."pr_runs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."projects" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."rate_limit_counters" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."referrals" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."research_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."research_jobs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."rsvps" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."stripe_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."style_deltas" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."topup_purchases" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."transcripts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."user_style_memory" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."user_voice_dials" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."voice_pairs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bump_edit_counter(p_user_id uuid, p_threshold integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bump_partner_click(p_partner_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_and_deduct_tts(p_user_id uuid, p_chars integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_ms integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_partner_referral(p_user_id uuid, p_partner_id uuid, p_source text, p_email_hash text, p_bonus numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.deduct_ink(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.deduct_ink_flat(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_ink_cost numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.deduct_ink_v2(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_cache_read_tokens integer, p_cache_write_tokens integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_ink_balance(p_user_id uuid, p_email_hashes text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ink_cost_v2(p_model text, p_input_tokens integer, p_output_tokens integer, p_cache_read_tokens integer, p_cache_write_tokens integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.model_ink_factor(p_model text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.purge_expired_book_plans() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_ink_reservation(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_project_outline(p_project_id uuid, p_user_id uuid, p_chapters jsonb, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_ink(p_user_id uuid, p_operation text, p_ink_amount numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_book_plan(p_user_id uuid, p_idem_key text, p_payload_hash text, p_preview_id uuid, p_claim_hash text, p_title text, p_audience text, p_description text, p_chapters jsonb, p_as_draft boolean, p_target_words integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_ink_reservation(p_reservation_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_flat_ink_cost numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_ink_reservation_v2(p_reservation_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_flat_ink_cost numeric, p_cache_read_tokens integer, p_cache_write_tokens integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tier_ink_allotment(p_tier text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated, service_role;
SET check_function_bodies = true;

COMMIT;
