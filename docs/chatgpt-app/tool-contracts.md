# Tool contracts

All tools: `securitySchemes` emitted top-level and mirrored in `_meta` (verified on the wire in mcp-server.test). Annotations set explicitly (`openWorldHint: false`, `destructiveHint: false` everywhere). Errors return `isError: true` and `structuredContent.error = { code, message, retryable? }`. Six tools as of 2026-11-11 (`add_to_project` added).

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

## add_to_project

- **Purpose:** save material from the chat, or what the assistant remembers about the user's life, into one of the user's existing book projects as source material. Strongest case: a memoir writer asking ChatGPT to "save everything you remember about my life that fits my book".
- **Auth:** `oauth2` required. Needs `CHATGPT_APP_MCP` and `CHATGPT_APP_WRITES` (checked inside the tool too, not only at the route).
- **Annotations:** readOnly false, destructive false (additive only), openWorld false, idempotent true.
- **Input:** `project_id` (uuid from `list_projects`), `title` (1-200), `text` (1-120,000 chars, the same cap as `source_text`), `source_app` (`chatgpt|claude|other`), `kind` (`conversation|notes|memory`). No user field.
- **Storage:** a stub `audio_uploads` row (`file_path ""`, `status transcribed`, `file_name` like "ChatGPT memories: Childhood in Dayton") plus a `transcripts` row: `full_text` = the cleaned text, paragraphs as `segments` all labelled `ASSISTANT_SPEAKER` ("AI assistant"), `speaker_map` = that label as role `author`, `speakers_confirmed_at` set. Same pattern as T.H.E.O. sessions and YouTube imports, so key points, outline, chapters and T.H.E.O.'s briefing read it with no new code.
- **Voice:** never used to learn the author's voice. `authorOnlyText` / `voiceSourceText` skip the label (no full-text fallback), so voice profile, voice match and the voice picker ignore it; voice-profile on an assistant-only transcript keeps the existing profile and spends nothing. Analysis moments skip it. See `src/lib/speakers.ts`.
- **Output:** `{saved:true, replayed, project_id, project_title, project_url, transcript_id, title, kind, source_app, word_count}`. Text content names the book, the word count and the link. The saved text is never echoed back.
- **Retry:** both row ids derive from `sha256(project_id, cleaned text)` (`stableUuid`, UUID v8). Same text to the same project → primary-key hit → `replayed:true` with the first save's ids, whatever the title. Line-ending and paragraph-spacing differences count as the same text. A save interrupted between the two inserts is completed on retry. A row holding the derived id in another project → `conflict`, nothing touched. No migration.
- **Errors:** `auth_required` (with `mcp/www_authenticate`), `feature_disabled`, `invalid_input` (over the wire the MCP SDK's schema check rejects oversize text first with its own "too big" error; the tool description and agents.md tell the assistant to split long material), `not_found` (missing, erased or someone else's project, indistinguishable), `rate_limited`, `conflict`, `internal` (retryable; a failed transcript insert removes its stub upload).
- **Limits:** 30/min per user.
- **One save, not many:** the analysis page's Analyze reads only the newest transcript with content, so material split into five saves gets only the last piece analyzed. The tool description and `/agents.md` say to send everything in one call when it fits under 120k and split only longer material. A save also becomes the newest transcript for a user who uploaded a recording and has not run Analyze yet. Fixing Analyze itself (e.g. run over every transcript not yet analyzed) changes Ink per click and is Kyle's call.
- **Billing:** none. No model call, no Ink, and nothing starts analysis (it runs only when the user clicks Analyze in D.scribe). No DB triggers or realtime listeners exist on these tables (checked in migrations and code; the live database was not queried).
- **Fencing:** the text is stored verbatim (control characters stripped) and never interpreted; identity and target come only from the token and an owned `project_id`.
