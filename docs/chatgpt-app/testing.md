# Testing

Run: `bun run test` (Vitest). New suites:

| File | What it proves |
| --- | --- |
| `src/lib/__tests__/book-plan.test.ts` | Segmentation, quote verification, provenance, idea-only labeling, faithful import (4 structures), size limits, injection fencing, malformed/timeout accounting |
| `src/lib/__tests__/chatgpt-app.test.ts` | Tool journeys: anonymous preview → link → save, retries and concurrent duplicates, cross-account claims, failed-save recovery, flags, rate limits, Ink settle-once, refinement, expiry without leaks, read-tool ownership, token claim policy, analytics sanitizing |
| `src/lib/__tests__/sql-032.test.ts` | Migration 032 executed in embedded Postgres (PGlite): atomic save, draft import, idempotent replay, key conflict, double-save refusal, cross-account and wrong-token denial, expiry, rollback on failure, outline swap with snapshot, no empty-project window, snapshot cap, retention |
| `src/lib/__tests__/mcp-server.test.ts` | Real MCP SDK client ↔ our server: tool list (6), annotations, `securitySchemes`, widget resource MIME/CSP, a tool call, `add_to_project` linking challenge, protocol validation |
| `src/lib/__tests__/chatgpt-add-to-project.test.ts` | `add_to_project` (2026-11-11): flags (WRITES, MCP), unauthenticated, another account's / erased / missing project, rate limit, 120k cap, empty text, stored rows and labels, no Ink / no model / only 3 tables touched, dedupe replay, whitespace-equivalent replay, 3 concurrent duplicates land once, interrupted-save repair, failed-insert cleanup, planted-id refusal, injected instructions stored as data and never echoed, voice exclusion (pure, mixed under 300 words, relabel, full-text edit, baseline unchanged, moments and T.H.E.O. author lines), derived ids |
| `src/lib/__tests__/voice-exclusion-routes.test.ts` | `/api/analyze/voice-profile` on assistant-only material keeps the existing profile with no Ink reserved and no model call; the author's own recording still trains; `/api/voice-match` returns 409 when only assistant text exists |
| `src/lib/__tests__/chatgpt-agents-md.test.ts` | `/agents.md`: 404 with the flag off, `text/markdown` + canonical with it on, HEAD for the Settings card, apex → 308 www; content names the exact `/mcp` resource on www even with an apex `NEXT_PUBLIC_SITE_URL`, carries the rules, names no assistant but ChatGPT; the three Settings prompts |
| `src/lib/__tests__/app-routes.test.ts` (existing) | `/agents.md` and `/oauth/consent` are covered by the middleware's public / app lists (otherwise master's 404 rule hides them) |

## Brief scenarios

| Scenario | Covered by | Kind |
| --- | --- | --- |
| Transcript supplied | book-plan "transcript supplied" | unit |
| Existing outline imported | book-plan "faithful import", mcp-server round trip | unit + protocol |
| Idea only | book-plan "idea only" | unit |
| Anonymous preview then linking | chatgpt-app "anonymous preview, then linking" | unit (fake store) + SQL |
| Another account guesses an ID | chatgpt-app ownership + SQL cross-account | unit + SQL |
| Retry / concurrent duplicate | chatgpt-app + SQL replay | unit + SQL (see note) |
| Provider timeout / malformed output | book-plan generatePlan + chatgpt-app Ink tests | unit |
| Insufficient Ink | chatgpt-app | unit |
| Existing project selected | Saves only create new projects; `replace_project_outline` snapshot tests | SQL |
| Malicious instructions in source | book-plan fencing test; identity never from args (mcp-server schema check) | unit |
| Preview expires | chatgpt-app + SQL | unit + SQL |
| Component fails | Every tool returns full text content; checked in mcp-server | protocol |
| Assistant saves memories to a book | chatgpt-add-to-project "stores the material" | unit (fake DB with real PK semantics) |
| Assistant retries a save | chatgpt-add-to-project replay + concurrency | unit |
| AI prose reaching the voice profile | chatgpt-add-to-project voice block + voice-exclusion-routes | unit + route (mocked services) |

Note on concurrency: PGlite is single-connection, so true parallel transactions are not exercised. The guarantee rests on Postgres primary-key blocking (`plan_idempotency` PK) plus `select ... for update` on the preview row; the fake store serializes to model it. Verify once against a Supabase branch database with two parallel saves.

## Not yet verified (requires access)

- `add_to_project` against a real Postgres: the dedupe rests on the `audio_uploads` / `transcripts` primary keys returning 23505, modelled in the fake DB, not run on PGlite or a branch database.
- `/agents.md` read by ChatGPT, and ChatGPT following it through setup and a first save.

- Live OAuth: Supabase OAuth server enabled, real ChatGPT token accepted at `/mcp`.
- The card rendered inside ChatGPT developer mode (desktop and mobile).
- Browser journey: consent page through magic-link sign-up and email confirmation.
- `/api/outline` regenerate on a preview deployment after migration 032.

Mocked tests do not establish that a live connection works.

## Results 2026-11-11 (after merging origin/master)

- Before any new code (merge only): `tsc` clean, 640 passed + 1 expected fail.
- After `add_to_project`, `/agents.md`, the card and voice exclusion: 677 passed + 1 expected fail (57 files; 37 new tests), `tsc` clean, eslint on changed files 0 errors (4 pre-existing hook warnings in the transcript page), `bun install --frozen-lockfile` no changes, `bun run build` passes (`/agents.md` dynamic).
- Local production server with `CHATGPT_APP_MCP=true`: `/agents.md` 200 `text/markdown` through the middleware, HEAD 200, apex Host → 308 www; `tools/list` returns 6 tools with top-level `securitySchemes`; unauthenticated `add_to_project` returns the `auth_required` tool result with `mcp/www_authenticate` (HTTP 200, which is the ChatGPT convention and the reason Claude cannot sign in, see launch-checklist.md); anonymous `/oauth/consent?authorization_id=…` → `/login?next=` with the id kept; unknown path 404.

## Local protocol check

```
CHATGPT_APP_MCP=true CHATGPT_APP_ANON_PREVIEW=true bun run dev
npx @modelcontextprotocol/inspector   # Streamable HTTP → http://localhost:3000/mcp
```
Anonymous previews write a row to `book_plan_previews` in whatever database `.env.local` points at. Use a non-production database for this.
