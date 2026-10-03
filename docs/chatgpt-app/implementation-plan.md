# D.scribe ChatGPT app: implementation plan and status

Branch: `feat/chatgpt-app` (cut from `origin/master` 14eb1d6 on 2026-10-03).
Spec: `IMPLEMENTATION-BRIEF.md` (2026-10-02). Checklist: `launch-checklist.md`.

## Platform facts checked 2026-10-03

OpenAI renamed the Apps SDK docs to "plugins". Pages read on 2026-10-03:

| Topic | URL | What it fixed in the design |
| --- | --- | --- |
| MCP server | https://developers.openai.com/plugins/build/mcp-server.md | Streamable HTTP at `/mcp`; `@modelcontextprotocol/sdk` + zod; `structuredContent` / `content` / `_meta` split |
| Auth | https://developers.openai.com/plugins/build/auth.md | OAuth 2.1 + PKCE S256; CIMD preferred, DCR allowed; RFC 9728 metadata; `aud` must match `resource`; per-tool `securitySchemes`; `_meta["mcp/www_authenticate"]` triggers linking |
| UI | https://developers.openai.com/plugins/build/chatgpt-ui.md | MIME `text/html;profile=mcp-app`; `_meta.ui.resourceUri` (+ `openai/outputTemplate` alias); `_meta.ui.csp`; postMessage bridge |
| Directory rules | https://developers.openai.com/plugins/plugin-guidelines.md | All three annotations explicit; **no selling of digital goods, subscriptions or credits, including freemium upsells**; demo account with sample data; org verification |
| Supabase OAuth server | https://supabase.com/docs/guides/auth/oauth-server and /mcp-authentication | Supabase Auth can be the authorization server (DCR, PKCE, JWKS, consent page we host, grants list/revoke) |

## Decisions (reversible unless noted)

1. **Authorization server = Supabase Auth's OAuth 2.1 server**, not hand-rolled. D.scribe is only the resource server plus a consent page. Rationale: maintained, same user table, revocation built in.
2. **Anonymous previews never call D.scribe's model.** ChatGPT has no per-person identity we can trust, so "one free preview per person" is not enforceable. Instead, ChatGPT's own model drafts the plan and `preview_book_plan` validates it, verifies every quote against the user's material, labels provenance and renders it. Anonymous spend is storage only, behind `CHATGPT_APP_ANON_PREVIEW` and an IP-hash rate limit. D.scribe's own model (`use_dscribe_model`) is linked-only, billed in Ink through the existing reservation/settle path.
3. **Saves always create a new project.** No tool replaces an existing outline. The website's regenerate keeps its replace behavior but now runs in one transaction with a recoverable snapshot.
4. **No async jobs in v1.** A plan is one model call (two on a malformed reply); it fits the 120 s function budget. `get_job_status` from the brief became `get_plan_status` (preview state + saved link). Revisit if generation grows.
5. **Commerce (launch-blocking rule):** the widget and tool text never link to checkout or pricing. Out of Ink returns a plain explanation and a link to Settings (balance), which the guidelines allow as information.
6. **Billing code reuse:** D.scribe-model plans bill as the existing `outline` Ink operation, so no ledger schema change.
7. **Migration number 032**, not 029: 029-031 belong to `feat/publisher-ready` and 029/031 are already on prod.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Assessment, verified platform rules, architecture | Done (this folder) |
| 2 | Shared planning service + non-destructive persistence | Done; SQL proven on embedded Postgres |
| 3 | OAuth resource server, MCP endpoint | Code done; live OAuth blocked on Supabase OAuth server setup (owner) |
| 4 | ChatGPT card + end-to-end saving | Code done; not yet seen inside ChatGPT (needs developer-mode connection) |
| 5 | Signup continuity, allowances, accounting, controls | Done in code: claim tokens, flags, rate limits, Ink settle-once, retention |
| 6 | Public pages, analytics, submission package | Partial: `/chatgpt` page + events + submission draft; speaker/sermon landing pages not started |
| 7 | Live verification, beta, deployment | Not started (needs owner access) |

Realistic remaining effort after this pass: about 2 weeks of focused work, mostly live verification and launch materials, plus OpenAI review time.
