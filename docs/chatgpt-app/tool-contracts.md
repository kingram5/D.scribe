# Tool contracts

All tools: `securitySchemes` emitted top-level and mirrored in `_meta` (verified on the wire in mcp-server.test). Annotations set explicitly (`openWorldHint: false`, `destructiveHint: false` everywhere). Errors return `isError: true` and `structuredContent.error = { code, message, retryable? }`.

Error codes: `auth_required` (with `_meta["mcp/www_authenticate"]`), `access_denied`, `not_found`, `preview_expired`, `already_saved`, `insufficient_ink`, `invalid_input`, `rate_limited`, `generation_unavailable`, `plan_required`, `feature_disabled`, `conflict`, `internal`.

## preview_book_plan

- **Purpose:** build a plan preview from an idea, shared material, or an existing outline/draft. Saves nothing to projects.
- **Auth:** `noauth` or `oauth2` (`openid email`). Anonymous needs `CHATGPT_APP_ANON_PREVIEW`.
- **Annotations:** readOnly false (stores a 48 h preview), destructive false, openWorld false.
- **Input:** `mode` (`idea|source|import`), `source_text` (≤120k chars), `import_text` (≤120k), `import_kind` (`outline|draft`), `idea{reader,message,material,outcome}`, `proposed_plan`, `based_on{preview_id,claim_token}`, `title`, `audience`, `num_chapters` (3-40), `use_dscribe_model`, `refine_instruction`.
- **Paths:**
  - `import` → deterministic parse, no model, wording preserved.
  - `idea|source` + `proposed_plan` → validate, verify quotes against segments, label provenance. No spend.
  - `source` without a plan → returns numbered segments (`plan_required`, not an error) so ChatGPT can draft and cite.
  - `use_dscribe_model` → linked + `CHATGPT_APP_PAID_GENERATION` + Ink reservation; D.scribe's model drafts/refines.
- **Output:** `{preview_id, claim_token, expires_at, saved:false, plan, warnings[], source_segment_count}`; `_meta.segments` feeds the card's source quotes.
- **Limits:** 20/min linked; anonymous 10/min per `openai/subject` plus 120/min across all anonymous callers. Duration: <1 s without the model; ~20-60 s with it.
- **Billing:** only `use_dscribe_model`; reserved first, settled once with actual tokens; a pre-reply failure releases the hold.
- **Retry:** each call creates a new preview; safe.

## save_book_plan

- **Purpose:** create a NEW project from a preview; returns the project link.
- **Auth:** `oauth2` required; `CHATGPT_APP_WRITES` required.
- **Annotations:** readOnly false, destructive false (additive), openWorld false, idempotent true.
- **Input:** `preview_id`, `claim_token`, optional `idempotency_key` (default `preview:<id>`).
- **Output:** `{saved:true, project_id, project_url, replayed, plan}`.
- **Retry:** same key → same project (`replayed:true`); different payload on a used key → `conflict`; a second key on a saved preview → `already_saved`.
- **Limits:** 10/min per user.

## list_projects

- **Auth:** `oauth2`. **Annotations:** readOnly true.
- **Input:** `limit` (1-20, default 10), `cursor`. **Output:** `{projects:[{id,title,status,audience,chapter_count,updated_at,url}], next_cursor}`. Erased projects hidden.

## get_project_summary

- **Auth:** `oauth2`. **Annotations:** readOnly true.
- **Input:** `project_id` (uuid). **Output:** project metadata, chapters `{number,title,summary≤300,status}`, progress. Another account's id returns `not_found`, same as a missing one.

## get_plan_status

- **Auth:** `noauth` or `oauth2`. **Annotations:** readOnly true.
- **Input:** `preview_id`, `claim_token`. **Output:** `{status: active|saved, expires_at, project_url, plan}`; expired → `preview_expired` with no content.
