-- Staging only: server API access for Publisher-Ready and Ink; no browser grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.chapters, public.transcripts, public.key_points TO service_role;
GRANT SELECT, INSERT ON public.chapter_contents, public.pr_chapter_passes TO service_role;
GRANT UPDATE ON public.pr_chapter_passes TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.pr_runs, public.pr_answers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pr_questions, public.pr_craft_notes TO service_role;
GRANT SELECT ON public.ink_balances, public.ink_usage, public.ink_reservations, public.ink_meter_settings, public.ink_rates TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_ms integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_ink(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_ink_flat(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_ink_cost numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_ink_v2(p_user_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_cache_read_tokens integer, p_cache_write_tokens integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_ink_balance(p_user_id uuid, p_email_hashes text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ink_reservation(p_reservation_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ink(p_user_id uuid, p_operation text, p_ink_amount numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ink_reservation(p_reservation_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_flat_ink_cost numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ink_reservation_v2(p_reservation_id uuid, p_project_id uuid, p_operation text, p_model text, p_input_tokens integer, p_output_tokens integer, p_flat_ink_cost numeric, p_cache_read_tokens integer, p_cache_write_tokens integer) TO service_role;
