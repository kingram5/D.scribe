# Architecture

```
ChatGPT ──HTTPS POST /mcp (Bearer token optional)──► src/app/mcp/route.ts
   │                                                   │ verify token (token.ts) → checkUserAccess (auth.ts)
   │                                                   ▼
   │                                       buildMcpServer(deps)  (chatgpt-app/server.ts)
   │                                                   │ tools.ts handlers
   │                         ┌─────────────────────────┼──────────────────────────┐
   │                         ▼                         ▼                          ▼
   │                 book-plan/normalize,     book-plan/generate.ts      book-plan/persist.ts
   │                 import, build (pure)     (linked + Ink only)        → Postgres RPCs (032)
   │
   ├──GET /.well-known/oauth-protected-resource ─► resource metadata → points at Supabase Auth
   └──OAuth (PKCE) ─► Supabase Auth /auth/v1 ─► redirects user to /oauth/consent (our page) ─► back to ChatGPT
```

## Modules

| Path | Role |
| --- | --- |
| `src/lib/book-plan/schema.ts` | Versioned plan contract (`schema_version: 1`), limits, audience coercion |
| `src/lib/book-plan/normalize.ts` | Source cleaning, stable segment ids `s1..sN`, prompt fencing |
| `src/lib/book-plan/import.ts` | Deterministic, word-for-word outline/draft import |
| `src/lib/book-plan/build.ts` | Proposal → validated plan: server-assigned ids/order/provenance, quote verification, gaps |
| `src/lib/book-plan/generate.ts` | D.scribe's own model path; returns usage on every exit for exact billing |
| `src/lib/book-plan/persist.ts` | Previews, claim tokens, atomic save via `save_book_plan`, retention |
| `src/lib/chatgpt-app/token.ts` | Bearer parsing, claim policy, Supabase-backed verification |
| `src/lib/chatgpt-app/tools.ts` | Tool handlers (dependency-injected, unit-tested) |
| `src/lib/chatgpt-app/server.ts` | MCP registration: tools, annotations, `securitySchemes`, widget resource |
| `src/lib/chatgpt-app/widget.ts` | The in-chat plan card (inline HTML/JS, empty CSP) |
| `src/lib/chatgpt-app/events.ts` | Funnel events with a content-free property allow-list |
| `src/app/mcp/route.ts` | Stateless streamable-HTTP endpoint, `maxDuration` 120 |
| `src/app/.well-known/oauth-protected-resource/[[...path]]` | RFC 9728 metadata (both URL forms) |
| `src/app/oauth/consent/page.tsx` | Consent screen for Supabase's OAuth server |
| `src/components/settings/ConnectedApps.tsx` | List and disconnect connected apps |
| `supabase/migrations/032_chatgpt_book_plans.sql` | Tables + `save_book_plan`, `replace_project_outline`, `purge_expired_book_plans` |

## Responsibilities

- **Authorization server (Supabase Auth):** client registration (DCR), authorization-code + PKCE, token issue/refresh, revocation, JWKS.
- **Resource server (/mcp):** token verification on every call, beta allowlist, rate limits, ownership on every read and write.
- **Consent (our page):** shows who is connecting and what it can do; approve/deny via `supabase.auth.oauth.*`.

## Invariants

- Identity only from a verified token. No tool accepts a user id.
- A save reads the plan from the stored preview, so unvalidated content cannot be saved.
- Previews never touch `projects`/`chapters`. Saves only insert new rows.
- Every DB write path is one transaction. Ink is reserved before a model call and settled exactly once.
- Pushed branches build Vercel previews against the production database, so every surface is flag-gated OFF by default.
