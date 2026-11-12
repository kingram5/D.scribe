# Acceptance and release checklist (status 2026-11-11)

`[x]` = done with evidence · `[ ]` = not done · **BLOCKED** = names the missing prerequisite.

## Repository and design

- [x] Branch, repo instructions, deployment topology, data model inspected. (No AGENTS.md; CI = bun frozen lockfile, tsc, tests, build.)
- [x] Current OpenAI plugin/MCP/auth/submission requirements verified with dated links. (`implementation-plan.md`)
- [x] Architecture, tool contracts, preview policy, data flow documented.
- [x] Unrelated changes preserved; feature branch `feat/chatgpt-app` in its own worktree; migration numbered 032 to avoid publisher-ready's 029-031.

## Product journey

- [x] Idea-only input → provisional plan + collection guidance. (book-plan.test "idea only")
- [x] Source plan has real references and gaps; fabricated quotes removed. (book-plan.test)
- [x] Existing outline/draft imports word for word. (book-plan.test, mcp-server.test)
- [ ] Preview refined and saved to the correct project: code + unit tests done; **BLOCKED** live check on a ChatGPT developer-mode connection.
- [ ] Signup, email verification and linking preserve the preview: claim design + tests done; **BLOCKED** live OAuth (Supabase OAuth server not enabled).
- [ ] Card accessible/responsive with text fallback: built (semantic HTML, focus rings, aria-live, dark mode, full text content on every tool); **BLOCKED** render check inside ChatGPT.
- [ ] Deep link opens the correct project: returns `/project/<id>`; not verified in a browser after a real save.

## Assistant saves to a book (add_to_project, /agents.md, Connect your AI) — added 2026-11-11

- [x] Branch brought up to date with origin/master (50 commits incl. www canonicals 75569aa); conflict in middleware resolved to master's behavior; `/oauth` added to the app routes so master's new 404 rule doesn't break the consent link.
- [x] Every `transcripts` reader checked. Voice profile, voice match, the voice picker and legacy `/api/analyze` would have learned from AI-written prose (300-word full-text fallback; analysis sends the newest transcript to voice-profile). Fixed with a reserved raw segment label skipped by `authorOnlyText` / `voiceSourceText`; no migration. Key points, outline, chapters and T.H.E.O.'s briefing still use the material as the author's story.
- [x] Inserting the material starts nothing: no DB triggers or realtime listeners on `audio_uploads` / `transcripts` (migrations + code; live DB not queried), analysis runs only on the user's Analyze click. The tool spends no Ink and calls no model (tested).
- [x] `add_to_project` built: auth + ownership, both flags, 30/min, 120k cap, PK-backed dedupe (ids from project + text hash), cleanup and repair paths, structured errors, text fallback, deep link, content-free events. 25 unit tests.
- [x] `/agents.md` (www only, text/markdown, 404 while `CHATGPT_APP_MCP` is off, noindex until launch) + public path in middleware. Settings "Connect your AI" card with 3 copy prompts, shown only while `/agents.md` answers.
- [ ] **Claude: not supported in v1.** Claude's custom connectors start OAuth only on a transport-level HTTP 401 and ignore `WWW-Authenticate` / `isError` on a 200 (claude.com/docs/connectors/building/authentication.md and lazy-authentication.md, read 2026-11-11). `/mcp` answers anonymous calls with 200 and returns `auth_required` as a tool result (the OpenAI convention), so Claude would connect, list tools and never sign in. Also needed for Claude: Supabase dynamic client registration on (optional toggle, "Authentication → OAuth Server"; Supabase warns it lets any MCP client register) or a pre-registered client ID entered in Claude's Advanced settings, the redirect `https://claude.ai/api/mcp/auth_callback` accepted, and `CHATGPT_APP_ALLOWED_CLIENT_IDS` left empty (DCR registers a new client per connection). Fix when wanted: a pre-SDK gate in `src/app/mcp/route.ts` that answers an unauthenticated `tools/call` of an oauth2-only tool with HTTP 401 + `WWW-Authenticate: Bearer resource_metadata=…`. Not built: it changes the ChatGPT linking path, which has never been verified live. The page and prompts say ChatGPT only.
- [ ] Live: ChatGPT reads `/agents.md`, walks setup, links, runs `list_projects` then `add_to_project`; the saved material appears on the project page and in Analyze. **BLOCKED** on the same OAuth server + flags as below.
- [ ] Dedupe on a real database (two parallel identical saves). Modelled in a fake DB with Postgres PK semantics only.
- [ ] Privacy policy wording for "other AI assistants" and memory saves: drafted in `privacy-and-data-flow.md` under PENDING KYLE APPROVAL. **Blocks turning `CHATGPT_APP_WRITES` on in production**, not the branch.
- [ ] At launch: drop `X-Robots-Tag: noindex` from `/agents.md` (with `/chatgpt`'s noindex). Keep the memoir prompt out of the directory listing's example prompts until checked against OpenAI's plugin guidelines on memory and data minimization.

## Data, identity, and accounting

- [x] Preview cannot overwrite manuscripts (previews never touch projects/chapters).
- [x] Saves atomic; replacement explicit and recoverable (sql-032.test: rollback, snapshot, no empty window).
- [x] Duplicate requests do not duplicate data or charges (sql-032 replay; Ink settle-once test). Parallel-connection check on a real DB still owed.
- [ ] Token validation, scopes, revocation, redirects, ownership: claim policy + ownership tested; **BLOCKED** real token round trip and revocation against Supabase.
- [x] Cross-account project, preview-claim access denied (tool + SQL tests). No job access exists to test.
- [x] Ink and provider failures have defined settlement (reserve → settle once with real usage; release on pre-reply failure).
- [x] Anonymous allowance has abuse/spend controls (no model spend, flag, per-`openai/subject` limit + global ceiling, size caps, 48 h expiry).
- [x] Retention, expiry, disconnect, deletion documented and implemented (purge function, cascades, Connected apps).
- [x] Secrets, tokens and manuscript text excluded from analytics/logs (sanitizer test).

## Operations and verification

- [x] Long operations: synchronous within 120 s by design; documented decision.
- [x] Structured errors, rate limits, input limits, recovery.
- [x] Feature flags, monitoring events, cleanup, rollback documented.
- [x] tsc, lint (changed files), full test suite, `bun install --frozen-lockfile` and production build pass locally (2026-10-03: 443 passing; 2026-11-11 after the master merge and add_to_project: 677 passing + 1 expected fail). Live smoke on a local production server: discovery JSON, 5 tools listed (6 on 2026-11-11, plus `/agents.md`), junk bearer → 401 + `WWW-Authenticate`, consent link keeps `authorization_id` through login.
- [ ] Browser journeys verified: **BLOCKED** on OAuth server + flags in a safe environment.
- [ ] Real ChatGPT integration: **BLOCKED** (owner's ChatGPT developer mode + deployed endpoint).
- [x] Malicious source instructions cannot change identity/permissions (fenced as data; no identity in args).
- [x] Migration/deployment order and env template prepared (`deployment.md`, `.env.example`).

## Discovery and launch preparation

- [ ] Public pages: `/chatgpt` built (noindex until launch). Speaker-to-book and sermon-to-book pages **not started**; existing `/vs` and blog pages not yet audited.
- [ ] Metadata/canonical/sitemap/structured data: `/chatgpt` has canonical; sitemap + structured data deferred to launch.
- [x] No fabricated testimonials, endorsements, listing or recommendation claims.
- [ ] Directory description, prompts, demo, reviewer instructions: drafted in `submission.md`; screenshots **BLOCKED** on live connection; demo account not created.
- [x] Support/privacy documents match data handling: owner approved 2026-10-03; `/legal/privacy` updated on this branch (sources, sharing, 48 h retention, disconnect) and goes live with the merge.
- [x] Migration 032 applied to production 2026-10-03 and dry-run verified (see deployment.md step 1).
- [ ] Observable analytics: preview requested/completed/failed and plan saved are emitted; `link_started`, `link_completed` and `handoff_opened` are defined but **not instrumented** yet (consent page and project page). Activation is measurable now through `projects.created_via = 'chatgpt'`. No recommendation impressions exist to measure.
- [x] Beta script and feedback form drafted; no outreach done.

## Final delivery

- [x] Reviewable branch pushed with a compare link; the PR itself is opened by the owner from that link (no `gh` CLI on the build box).
- [x] Verification results supplied (`testing.md`).
- [x] Limitations and blocked live checks listed (this file).
- [x] Owner steps listed without secrets (`deployment.md`).
- [x] Production deployment and submission left to the owner.
- [x] No claim that approval or organic recommendations are guaranteed.

**Not release-ready.** Code and tests for the core journeys are done; live OAuth, live ChatGPT verification, landing pages and launch materials remain.
