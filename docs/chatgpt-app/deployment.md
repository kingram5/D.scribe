# Deployment

Nothing here has been run against production. Each step names who does it.

## Order

1. **Apply migration 032** (owner, Supabase SQL editor or MCP on the owner's word). Additive only: new tables, functions, one nullable column. Back up first with a Supabase snapshot. Verify:
   `select proname from pg_proc where proname in ('save_book_plan','replace_project_outline','purge_expired_book_plans');` returns 3 rows.
2. **Merge the branch.** With all flags unset, the only live change is `/api/outline` using the one-transaction swap (it falls back to the old write if 032 is missing) and the Settings "Connected apps" card (hidden until a grant exists).
3. **Enable Supabase OAuth server** (owner, dashboard: Authentication → OAuth Server):
   - Enable the OAuth 2.1 server.
   - Authorization path: `/oauth/consent` with site URL `https://www.d-scribe.app`.
   - Enable dynamic client registration (ChatGPT registers itself), or pre-register ChatGPT and put its client id in `CHATGPT_APP_ALLOWED_CLIENT_IDS`.
   - Allowed redirect: `https://chatgpt.com/connector_platform_oauth_redirect` (plus the exact URI shown on the ChatGPT app management page).
   - Check the JWT signing setup. If ChatGPT requires `aud` = the resource URL, add a custom access-token hook that sets it, then set `CHATGPT_APP_EXPECTED_AUDIENCE`.
4. **Set Vercel env (Production)**: `CHATGPT_APP_MCP=true`, `CHATGPT_APP_RESOURCE_URL=https://www.d-scribe.app/mcp`. Leave `ANON_PREVIEW`, `PAID_GENERATION` and `WRITES` off for the first connection test, then turn on one at a time.
5. **Developer-mode connection** (owner's ChatGPT account): add `https://www.d-scribe.app/mcp` as a connector, link the account, run the demo script in `submission.md`.
6. **Submission** (owner, after org verification on the OpenAI Platform dashboard).

Preview deployments share the production database and live Stripe. Do not set any `CHATGPT_APP_*` flag on Preview without pointing it at a separate database.

## Health checks

- `GET /.well-known/oauth-protected-resource` → JSON with `resource` and `authorization_servers` (404 when the flag is off).
- `POST /mcp` with `{"jsonrpc":"2.0","id":1,"method":"tools/list"}` and header `Accept: application/json, text/event-stream` → 5 tools.
- `POST /mcp` with `Authorization: Bearer junk` → 401 with `WWW-Authenticate: Bearer resource_metadata=...`.
- Logs: `chatgpt_app.*` events in Axiom; `preview_failed` / `save_failed` rates.

## Rollback

- Fastest: unset `CHATGPT_APP_MCP` (endpoint and discovery go 404) or `CHATGPT_APP_WRITES` (saves stop). No redeploy of code needed beyond the env change.
- Disable the OAuth server in Supabase to cut every ChatGPT token.
- Code revert is safe; migration 032 can stay (unused tables). To drop it: `drop function save_book_plan(...)`, `replace_project_outline(...)` only after reverting `/api/outline`, then the tables.

## Spend controls

- Anonymous path never calls a paid model.
- Paid generation is per-user Ink-gated (reservation before the call) and rate-limited (20/min).
- Kill switch: `CHATGPT_APP_PAID_GENERATION`.
