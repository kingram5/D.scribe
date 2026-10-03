# Acceptance and release checklist (status 2026-10-03)

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
- [x] tsc, lint (changed files), full test suite (443 passing, 71 of them new), `bun install --frozen-lockfile` and production build pass locally. Live smoke on a local production server: discovery JSON, 5 tools listed, junk bearer → 401 + `WWW-Authenticate`, consent link keeps `authorization_id` through login.
- [ ] Browser journeys verified: **BLOCKED** on OAuth server + flags in a safe environment.
- [ ] Real ChatGPT integration: **BLOCKED** (owner's ChatGPT developer mode + deployed endpoint).
- [x] Malicious source instructions cannot change identity/permissions (fenced as data; no identity in args).
- [x] Migration/deployment order and env template prepared (`deployment.md`, `.env.example`).

## Discovery and launch preparation

- [ ] Public pages: `/chatgpt` built (noindex until launch). Speaker-to-book and sermon-to-book pages **not started**; existing `/vs` and blog pages not yet audited.
- [ ] Metadata/canonical/sitemap/structured data: `/chatgpt` has canonical; sitemap + structured data deferred to launch.
- [x] No fabricated testimonials, endorsements, listing or recommendation claims.
- [ ] Directory description, prompts, demo, reviewer instructions: drafted in `submission.md`; screenshots **BLOCKED** on live connection; demo account not created.
- [ ] Support/privacy documents match data handling: policy additions drafted, **owner approval** needed before publishing.
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
