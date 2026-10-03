# Testing

Run: `bun run test` (Vitest). New suites:

| File | What it proves |
| --- | --- |
| `src/lib/__tests__/book-plan.test.ts` | Segmentation, quote verification, provenance, idea-only labeling, faithful import (4 structures), size limits, injection fencing, malformed/timeout accounting |
| `src/lib/__tests__/chatgpt-app.test.ts` | Tool journeys: anonymous preview → link → save, retries and concurrent duplicates, cross-account claims, failed-save recovery, flags, rate limits, Ink settle-once, refinement, expiry without leaks, read-tool ownership, token claim policy, analytics sanitizing |
| `src/lib/__tests__/sql-032.test.ts` | Migration 032 executed in embedded Postgres (PGlite): atomic save, draft import, idempotent replay, key conflict, double-save refusal, cross-account and wrong-token denial, expiry, rollback on failure, outline swap with snapshot, no empty-project window, snapshot cap, retention |
| `src/lib/__tests__/mcp-server.test.ts` | Real MCP SDK client ↔ our server: tool list, annotations, `securitySchemes`, widget resource MIME/CSP, a tool call, protocol validation |

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

Note on concurrency: PGlite is single-connection, so true parallel transactions are not exercised. The guarantee rests on Postgres primary-key blocking (`plan_idempotency` PK) plus `select ... for update` on the preview row; the fake store serializes to model it. Verify once against a Supabase branch database with two parallel saves.

## Not yet verified (requires access)

- Live OAuth: Supabase OAuth server enabled, real ChatGPT token accepted at `/mcp`.
- The card rendered inside ChatGPT developer mode (desktop and mobile).
- Browser journey: consent page through magic-link sign-up and email confirmation.
- `/api/outline` regenerate on a preview deployment after migration 032.

Mocked tests do not establish that a live connection works.

## Local protocol check

```
CHATGPT_APP_MCP=true CHATGPT_APP_ANON_PREVIEW=true bun run dev
npx @modelcontextprotocol/inspector   # Streamable HTTP → http://localhost:3000/mcp
```
Anonymous previews write a row to `book_plan_previews` in whatever database `.env.local` points at. Use a non-production database for this.
