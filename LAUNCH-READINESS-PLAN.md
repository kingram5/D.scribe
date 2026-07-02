# D.Scribe — Production Launch Readiness Plan

**Date:** 2026-06-01 · **Repo:** `github.com/kingram5/manuscript` · **Stack:** Next.js 15 (App Router) · React 19 · Supabase · Stripe · Cloudflare R2 · Deepgram · Anthropic · Sentry/Axiom · Vercel

Built from a 6-dimension code audit (security/RLS, billing/entitlements, observability/reliability, architecture/build, testing/CI, legal/compliance). Every finding cites `file:line`.

---

## VERDICT

Your peer was **directionally right, but "way off" is wrong.** D.Scribe is much further along than that — the production *scaffolding* is already here:

**Already done well (do NOT redo):**
- Stripe webhook **verifies signatures + is idempotent** via `stripe_events` PK conflict (`api/stripe/webhook/route.ts:50,62`). This is the part most people get wrong. You got it right.
- **RLS is enabled with correct `auth.uid()` policies on the core tables** — projects, chapters, transcripts, enrichments (`001_initial_schema.sql:186-256`).
- Auth + ownership checks (`requireAuth` + `.eq("user_id", user.id)`) on **every** data route — no IDOR found in the core routes.
- Structured logging (pino → Axiom) is well-built (`lib/logger.ts`), Sentry is instrumented (client/server/edge), rate-limiting exists, output sanitization exists, env-driven Stripe price IDs (no hardcoded test/live keys), audio upload MIME+size validation, presigned R2 URLs that expire.

**But it is genuinely NOT launchable as-is.** There's a cluster of specific blockers that cause real damage the instant you (a) remove the email allowlist and (b) take real money. The honest timeline to "safe paid public launch" is **~1.5–2 focused weeks solo**, with a **~4–5 day "stop-the-bleed" subset** that covers the things that actively lose money/data/trust. "100% launchable today" isn't real — but the path is short and well-defined.

**The single most important fact:** nearly every API route uses the Supabase **service-role client** (`lib/supabase.ts` `createServerClient()`), which **bypasses RLS**. So RLS is only a *backstop* — security rests on hand-written ownership checks (which are mostly correct) and on the RLS holes below being closed.

---

## MERGE STATUS — Reconciled with Hermes (2026-06-01)

Two independent audits (Claude + Hermes) cross-checked. **No material conflicts — the audits corroborate each other.** Deltas folded in:

**Net-new from Hermes (added below):**
- **[P0] Mass-assignment in project PATCH** — `api/project/[id]/route.ts` passes the client `updates` object straight into `.update(updates)` on chapters + key_points with no field allowlist. Ownership is checked, but a user can write arbitrary columns. Whitelist updatable fields server-side. *(Verify exact allowlist at implementation.)* — added to Phase 4.
- **[P0] `log-client-error`** bumped P1→P0 (Hermes's call) — unauth + no size cap + no rate limit + forwards raw to logger/Sentry = cheap flood/cost-DoS + leak.

**Resolved non-issue:** Hermes couldn't reproduce a "DEV auth-bypass." Correct — there isn't one. Neither audit found a hardcoded DEV_USER skip; `auth.ts` + `middleware.ts` (allowlist gating) are clean on that axis. No phantom P0 in this plan.

**Confirmed alignment:** the 60s kill-switch is in `api/jobs/route.ts` (`maxDuration=60`); `generate` itself is already 300 — so the fix targets the jobs ceiling/queue, not generate. Both audits agree on every RLS hole, Sentry gap, and the legal/tracking risk.

**Ownership & review gates:**
| Track | Owner | Review gate |
|---|---|---|
| Phases 0–4 — code (DB, billing, reliability, build/CI, signup) | **Claude** (hands on the live repo) | **Hermes** signs off on auth / billing / Sentry / consent diffs before each is marked done |
| Phase 5 — legal/content (ToS, Privacy, AUP, DMCA, consent-banner + disclosure copy) | **Hermes** | **Claude** wires the copy into the app + consent gate; copy must match shipped code (e.g. no "audio not retained" claim until `mip_opt_out` lands) |

Single source of truth = **this file** (Claude executes from it in-repo). Hermes delivers legal copy as separate artifacts. No forked master plan.

---

## IN-FLIGHT — Unsupervised hardening batch (2026-06-01, Kyle away ~1hr)

Low-risk, file-only, no prod. **`tsc --noEmit` clean** — only the 2 pre-existing errors remain (`generate/route.ts:298`, `stripe/webhook/route.ts:71`). Awaiting Hermes review + a full `bun run build` before merge. Nothing deployed.

- ✍️ **Sentry PII scrub** (Phase 2 P0) — new `sentry-scrub.ts` + `beforeSend: scrubEvent` + `sendDefaultPii:false` in all 4 inits (`sentry.client/server/edge.config.ts`, `instrumentation-client.ts`). Strips request bodies, auth headers/cookies, content-bearing `extra` keys.
- ✍️ **Security headers** (Phase 4 P1) — `next.config.ts` `headers()`: HSTS (no preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`. Permissions-Policy + CSP + HSTS-preload deferred (need feature/build verification).
- ✍️ **`log-client-error` hardening** (Phase 4 P0) — 16KB body cap (Content-Length + post-read), field truncation, newline-strip on scalar fields. Per-IP rate limit left as a TODO.

- ✍️ **`.env.example`** (Phase 3 P1) — created, grep-verified all vars (incl. `WORKER_PORT`, which the audit missed); excludes runtime built-ins; `.gitignore` exception added so it actually commits.

**Update (post-review):** Sentry scrub revised per Hermes review — now also truncates `message` + `exception.values[].value` text (the *primary* leak channel — `captureException(new Error(userText))`) and uses a value-shape `extra` filter (drop long non-safe strings, keep ids/flags). Cap values (500 text / 200 extra) **confirmed by Hermes** — Sentry + headers + `log-client-error` all review-cleared. `log-client-error` byte-length nit fixed. `tsc --noEmit` clean throughout; `bun run build` remains the pre-merge gate.

Deferred to the supervised session: `withSentryConfig` wrap (needs build test), `project/[id]` field-allowlist (data-write logic), all of Phase 1 billing.

---

## SHIPPED — Phases 0-3 substantially complete (2026-06-04)

Three deploys this session:
- **Phase 0** (DB hardening, `013`) — applied + verified on prod earlier.
- **Retire** (Phase 1 fix #2 + the double-charge + the +40 bonus) — `ea0fed5` on **master**, migration `014` applied. Legacy job system + second credit wallet gone; one wallet (Ink) now.
- **Phase 1-3 hardening** — `3b6cdaa`, **DEPLOYED + VERIFIED on prod (www.d-scribe.app), merged to master 2026-06-04.** Build type-checked (ignoreBuildErrors off), source maps uploaded to Sentry (org/project `dscribe`, release `3b6cdaa`). Runtime verify: `/api/health` 200 (db up), `/api/ink` 200 (metering intact). Hermes-reviewed (freeze-keeps-tier model approved). 27/27 tests.
  - *P1 billing:* `checkInk` cost-aware (per-op floors, `ESTIMATED_COST`); Stripe webhook freeze-on-`payment_failed` + revoke-on-`refunded`/`dispute` + status-aware `subscription.updated`; `recordInkUsage` failures logged not swallowed.
  - *P2 observability:* `withSentryConfig` (source maps + `/monitoring` tunnel) + `GET /api/health`.
  - *P3 build:* the 2 latent type errors fixed, `typescript.ignoreBuildErrors` removed (build type-checks now), 27 vitest money-path tests, `.github/workflows/ci.yml`.

- **Phase 4-5 hardening** — `6a240c1`, **DEPLOYED + VERIFIED on prod (www.d-scribe.app), merged to master 2026-06-05.** Hermes-reviewed (email gate = the only flag, cleared by Kyle's "ship gate"). Runtime verify (Kyle's authed session): `/api/ink` 200 (email gate did NOT lock him out — confirmed email), `/api/health` 200, `/legal/terms` 200 (public), `/api/account/delete` 405 (deployed, POST-only, no deletion). Source maps uploaded. **This closes Phases 0-5 of the plan.**
- **UI follow-ups** — `e0d18e2`, DEPLOYED + VERIFIED on prod, merged to master 2026-06-05: `/settings` page (account deletion behind a type-DELETE confirm → POST /api/account/delete → sign out; + Stripe customer-portal link), UserMenu "Settings & billing" link, `/discover` DMCA "Report it" link (read path already exposes only is_public + safe fields). `/settings` 200 live. (18+ signup checkbox skipped per Kyle.)
  - *P5 legal/data rights:* consent gating — TikTok/LinkedIn pixels OFF until marketing consent (closes the pixels-without-consent active liability); `ConsentBanner` + `lib/consent.ts` cookie store. Data erasure — R2 cleanup on project delete + `POST /api/account/delete` full teardown (cancel Stripe → delete R2 → delete DB → `auth.admin.deleteUser`, scoped to caller); `lib/storage-cleanup.ts`. Deepgram `mip_opt_out`. Legal pages `/legal/{terms,privacy,dmca,acceptable-use}` from Hermes's `docs/legal/` drafts (server-rendered, **noindex + DRAFT until counsel-final**).
  - *P4 signup hardening:* email-confirmation gate (`requireAuth` 403 + middleware redirect — **RISK: verify Supabase "Confirm email" is ON or it bounces unconfirmed users**); `transcribe` + `audio/youtube` gated (Ink presence + rate limit); mass-assignment allowlist extended to chapters/key_points/transcripts; deleted `/cinematic` + `/landing-classic` + `/nodum` (+ dropped from PUBLIC_PATHS); `/legal/*` public.
  - *Still deferred:* CAPTCHA/Turnstile + disposable-email + per-IP signup limits; zod body validation; fail-closed rate limiting everywhere; `/discover` public-read hardening; account-delete + 18+ signup UI; process items (Supabase backups, PCI SAQ-A, DMCA agent registration, counsel review of the legal copy).

**Still open (deferred / lower priority):**
- *Phase 1:* anti-farm signup gating (free-trial 10 Ink still farmable via delete+re-signup); TTS limit drift (P2); downgrade-abuse (P2); full reserve/hold cost-aware (the floor check is the pragmatic P0 — not a token-exact hold).
- *Phase 2:* Sentry alert rules (dashboard); **add `SENTRY_AUTH_TOKEN` in Vercel** or source maps won't upload.
- *Phase 3:* eslint still suppressed (zod / eslint-config-next toolchain crash — needs a `zod` override); make the CI `tsc` step blocking once stable.
- *Phase 4* (signup hardening) + *Phase 5* (legal/consent) — not started.
- **Stripe dashboard:** verify the webhook is subscribed to `invoice.payment_failed` + `charge.refunded` + `charge.dispute.created`, or the new handlers never fire.

---

## CRITICAL PATH (at a glance)

| Phase | Theme | Why it blocks launch | Effort |
|---|---|---|---|
| **0** | DB hardening (3 SQL migrations) | Any free user can grant self unlimited credits / wipe rate limiter / drain others' balances | **0.5 day** |
| **1** | Billing integrity | Half the product is free; paying users double-charged; refunded users keep access | **2 days** |
| **2** | Reliability + observability | "Generate All" silently dies & loses user work; you're blind to prod errors; manuscripts can leak to Sentry | **1.5 days** |
| **3** | Build integrity + minimal CI/tests | Shipping with type errors suppressed; zero tests on the money path | **2 days** |
| **4** | Public-signup hardening + infra hygiene | Removing the allowlist exposes everything; trial farming; no security headers | **1.5 days** |
| **5** | Legal + data rights | No ToS/Privacy; tracking pixels fire without consent (active liability); can't truthfully delete user data | **1 day + templates** |

**Minimum to safely take money** = Phase 0 + 1 + the PII/Sentry + double-charge items from Phase 2 + the legal "active liability" items (pixels, ToS/PP) from Phase 5. **~4–5 days.**

---

## PHASE 0 — DB Hardening (do this first, it's almost free)

Three small SQL migrations. Highest impact-to-effort ratio in the whole plan. Write as `013_security_hardening.sql`.

> **STATUS (2026-06-01):** `013_security_hardening.sql` is **WRITTEN + Hermes-reviewed** — revoke verified safe against every call site (`credits.ts`, `ink.ts`, `tts.ts`, `scripts/run-pipeline.mjs` all use the service-role client). **Decisions locked:** Vercel Pro, Ink-only wallet, Iubenda. **APPLIED + VERIFIED on prod 2026-06-01** ✅ — Kyle ran it via the Supabase SQL editor; post-apply check confirms all 4 holes closed (RLS now ON for `stripe_events`/`rate_limit_counters`/`blog_posts`; `usage_overrides` world-open policy replaced with read-own; `deduct_ink`/`check_and_deduct_tts`/`decrement_credit` revoked from anon/authenticated, granted to service_role only). Drift caught during preflight: `blog_posts` was already RLS-on (handled idempotently). Note: applied as a comment-free block (Monaco dropped newlines after comments mid-type, which would've commented out 3 statements — caught on verify, retyped clean). Covers items 1–3 below; the dup-`011` renumber (item 4) is a separate file/process fix deferred to the apply step.
>
> **Apply method (found 2026-06-01 via `scripts/setup-supabase.sh`):** Supabase CLI — `npx supabase db push` (project linked, ref `imjkauxdlwfrblrgidgj`). CLI is run via `npx` (not global). `db push` needs an interactive `npx supabase login` + DB password, so it runs at **Kyle's machine**, not headless. `db push` applies ALL pending migrations → drift-check (`npx supabase migration list`) FIRST to confirm 013 is the only pending file. Apply sequence: `login` → `migration list` (post result to War Room) → `db push` → verify RLS on + app works.

- [ ] **[P0] Lock down `usage_overrides` RLS** — `003_credits.sql:37-40` ships `for all using (true) with check (true)`. Any logged-in user can hit the PostgREST endpoint with the public anon key and `upsert` themselves `bonus_credits: 9999999`, or read/modify **every other tenant's** quota. Replace with select-only `using (user_id = auth.uid())`; drop the write policy (app writes via service role). **(S)**
- [ ] **[P0] Enable RLS on 3 unprotected tables** — `stripe_events` (009), `rate_limit_counters` (010), `blog_posts` (011) have **no RLS at all** → fully exposed to the anon key. Consequences: attacker reads everyone's Stripe billing history; **deletes their own `rate_limit_counters` rows to get unlimited AI calls**; inserts/publishes arbitrary `blog_posts` (stored-XSS on public pages). `alter table … enable row level security;` — deny-all to clients for events/counters; `select where published = true` for blog. App writes via service role, so nothing breaks. **(S)**
- [ ] **[P0] `REVOKE EXECUTE … FROM public` on the SECURITY DEFINER RPCs** — `deduct_ink`, `check_and_deduct_tts`, `decrement_credit` (004/006/012/003) take a `user_id` *parameter* and are callable by any authenticated user via `supabase.rpc(...)` → **drain another user's balance**. `revoke execute on function … from public, anon, authenticated;` (service role still works). **(S)**
- [ ] **[P1] Fix duplicate migration number** — two files numbered `011` (`011_blog_posts.sql`, `011_creative_freedom_and_scripture.sql`). Renumber one to `013`/`014`; **verify both are actually applied in prod** (drift risk). **(S)**
- [ ] **[P0-verify] Confirm prod migration state** — run `npx supabase db remote commit` (or `db diff`) to confirm the prod DB matches these migration files. If you've been applying SQL by hand in the dashboard, you may already have drift. **(S)**

---

## PHASE 1 — Billing Integrity (the revenue-protection sprint)

Right now an adversarial free user gets most of the product for free, and paying users get over-charged. Both are launch-blockers.

> **STATUS (2026-06-01):** Fix #1 (meter the free routes) **WRITTEN + tsc-clean, Hermes-reviewed**. All 7 routes now meter: `analyze` (added missing preflight `checkInk` + metered all 3 calls — key-points summed across chunks, voice + mind-map charged sequentially after `Promise.all`), `outline`, `coherence`, `analyze/key-points`, `analyze/voice-profile`, `analyze/mind-map`, `outline/expand`. Pattern: `askClaude`→`askClaudeWithUsage` + `await recordInkUsage` before the success return (charge failure → request failure, no free content). **Build (2026-06-01): compiled successfully** — the batch is code-clean; local `next build` only fails at static prerender of `/blog` (needs `NEXT_PUBLIC_SUPABASE_URL`, absent in the build sandbox; pre-existing, `/blog` untouched). Real green-build gate = a Vercel build with env → deploy to a Vercel **preview** first, then promote. **SHIPPED TO PROD 2026-06-04** ✅ — branch `hardening-and-metering` (commit `3a5e30c`) deployed via `vercel deploy --prod`, aliased to www.d-scribe.app. Preview validated the build (48/48 pages); prod runtime verified: `/api/outline/expand` ("Preview New Chapters", $0 before) charged **7.66 Ink** recorded as `outline` — a charge impossible pre-deploy. Phase 0 (already applied) + the hardening batch shipped in the same deploy. Branch not yet merged to master (prod runs the branch build directly). Remaining Phase 1: #2 kill legacy wallet + double-charge + the +40 bonus, #3 webhook payment-failed/refund, #4 cost-aware `checkInk`.
>
> **RETIRE part 1 — frontend cutover (2026-06-04):** Branch `retire-job-system` (commit `7fa0924`), `tsc --noEmit` clean (zero NEW errors). Executes fix #2's "retire `/api/jobs`" path. **Discovery:** the analyze flow was *already* off the job system — `runAnalysis()` calls the direct metered routes (`/api/analyze/*`, `/api/outline`); `analyzeJob = useJob()` + its completion effect were dead code (`start()` never called) → deleted. The standalone "Generate Foreword" button was the **only** remaining live `/api/jobs` caller → switched to a direct `fetch('/api/generate',{type:'foreword'})` (mirrors the inline generate-all path; 402→upgrade modal + refresh). **Bonus hole closed:** the foreword branch of `/api/generate` was gate-only (`checkInk`, no `recordInkUsage`) — even the "direct route" leaked foreword tokens. Now `askClaudeWithUsage` + `recordInkUsage(...,"foreword","quality",usage)`; added `"foreword"` to `InkOperation` (label only — `deduct_ink p_operation` is text, no DB change). 4 files, +43/−39. **HELD pending:** Hermes review → Kyle deploy OK → prod verify (foreword charges Ink via GET /api/ink breakdown). **Part 2 (after verify):** delete `/api/jobs` + `/api/jobs/[id]` + `lib/workers/*` + `useJob.ts` + `credits.ts` + the +40 bonus; `/api/credits` → thin Ink read; migration `014` drops `user_credits` + `usage_overrides` + `decrement_credit`. Part 2 also resolves the double-charge (jobs:65/88/134) and the +40 bonus once the job route is gone.
>
> **UPDATE (2026-06-04, same session):** Part 1 **DEPLOYED + VERIFIED on prod** ✅ — `7fa0924` promoted preview→`vercel deploy --prod` (aliased www.d-scribe.app, target production READY). Live verify on the "E2E Test - YouTube Sermon" project: one 614-word foreword charged **2.515 Ink** (balance 1173.185→1170.67, lifetime_used +2.515, `breakdown.foreword`=2.515 — key absent pre-deploy). Success-only billing + 402-isolation both Hermes-gated and code-confirmed. Part 2 **COMMITTED** `ea0fed5` (13 files, +27/−1858): deleted `/api/jobs`(+`[id]`) + `lib/workers/*` (5) + `lib/jobs.ts` + `useJob.ts` + `credits.ts` (+40 bonus dies with it) + `scripts/run-pipeline.mjs`; `/api/credits` rewired to `getInkBalance` (same `{balance}` shape, useCredits/CreditBadge unaffected); `014_drop_legacy_credits.sql` written + HELD. `tsc` clean (only the 2 pre-existing), zero source hits on every deleted symbol. Preview build running. **HELD for:** Hermes bless + Kyle go on the part-2 prod deploy → then Kyle applies 014 **comment-free in the Supabase SQL editor** (like 013, to dodge the Monaco newline-drop bug). Branch still not merged to master (prod runs the branch build directly, as with the hardening batch).
>
> **DEPLOYED + VERIFIED on prod (2026-06-04):** Part 2 `ea0fed5` promoted via preview(47/47 green)→`vercel deploy --prod` (`dpl_GgW9m8WhBy34GmyPXD1W2Q57VymH`, aliased www.d-scribe.app, target production READY). Hermes blessed the cut after independent verify. Prod runtime check: `GET /api/jobs` → **404** (route deleted; was 405 on the old build), `/api/credits` → **200 `{balance:1170.67}`** served from Ink (matches the wallet — rewire confirmed). **Migration 014 handed to Kyle** to apply now that prod no longer references the legacy objects (comment-free: `drop function if exists decrement_credit(uuid);` + `drop table if exists usage_overrides cascade;` + `drop table if exists user_credits cascade;`). **Pending:** Kyle applies 014 → then merge `retire-job-system` → master. The whole retire (fix #2 + the double-charge + the +40 bonus) is then closed.

- [ ] **[P0] `/api/analyze` is completely unmetered** — `analyze/route.ts:18-216` has no `checkInk` and no `recordInkUsage`. It runs N Haiku key-point calls + voice-profile + mind-map. A free user `curl`s it on a loop = unlimited Claude spend on your dime. Add pre-flight `checkInk` + `recordInkUsage` per call (mirror `/api/generate`). **(S)**
- [ ] **[P0] "Gate-only" routes never deduct** — `analyze/key-points`, `analyze/voice-profile`, `analyze/mind-map`, `outline`, `outline/expand`, `coherence` all call `checkInk` but **never `recordInkUsage`**. Ink balance is immortal → one Starter purchase (or the free 10) buys unlimited use of the entire analyze→outline front half. Wire `recordInkUsage` into all six. **(M)**
- [x] **[P0] Collapse the two parallel wallets** ✅ DONE 2026-06-04 — retired `/api/jobs` + `credits.ts` outright; `/api/credits`→Ink; `ea0fed5` + migration 014 dropped the legacy tables. — `/api/jobs` meters the **legacy** `user_credits` system (`credits.ts`, `decrement_credit`) which **Stripe never funds** (the webhook only writes `ink_balances`). Everything else uses `ink_balances`. Two different wallets = guaranteed money/UX bugs. Retire `credits.ts` and route `/api/jobs` through `ink.ts`, or retire `/api/jobs` (the generate page already client-orchestrates per-step). **(M)**
- [~] **[P0] Remove the trial-farming + hardcoded +40 bonus** ⟶ +40 bonus REMOVED 2026-06-04 (credits.ts deleted). Anti-farm STILL PENDING — `ink.ts` free 10 Ink on signup remains farmable (gate behind verified email + email-hash trial tracking). — `credits.ts:32-41` grants `TEST_USER_BONUS_INK = 40` to **every** new user (comment literally says *"remove this block when going public"*). Plus `ink.ts:45` grants 10 free Ink keyed on a fresh-per-signup UUID. Delete-account → re-signup mints fresh balances forever. Remove the bonus; gate the free trial behind verified email + track consumed-trial by email hash. **(S to remove bonus / M to anti-farm)**
- [ ] **[P0] `checkInk` is a presence check, not a cost check** — `ink.ts:56` returns `allowed` whenever `balance > 0`. A user with 0.5 Ink triggers a 16-Ink chapter gen; for streaming routes the content is **delivered before** the fire-and-forget deduct fires (`generate/route.ts:286`). Use `/api/ink/estimate` to check `balance >= estimated_cost`; reserve/hold Ink before streaming, reconcile after. **(M)**
- [x] **[P0] Double (sometimes triple) Ink deduction per job** ✅ DONE 2026-06-04 — the offending `/api/jobs` route (deducted at :65/:88/:134) is deleted; direct metered routes each deduct exactly once. — `jobs/route.ts:65` deducts before the worker, `:88` deducts again on success, `:134` a third time in dev. Every `generate-all` chapter charges 2×. Paying users drained → instant churn + chargebacks. Deduct exactly once. **(S)**
- [ ] **[P1] No `invoice.payment_failed` / refund / dispute handling** — webhook handles `subscription.deleted` and `invoice.payment_succeeded` but not `payment_failed`, `charge.refunded`, or `charge.dispute.created`. A `past_due` (failed-card) subscriber keeps full Pro tier + Ink for the entire Stripe dunning window; refunded users keep access. Handle `payment_failed`/`past_due` → freeze entitlements; refund/dispute → revoke. Better: derive entitlement from **live `subscription.status`**, not the denormalized `tier` column. **(M)**
- [ ] **[P1] Stop `.catch()`-swallowing money operations** — `recordInkUsage(...).catch(console.error)` in `generate/route.ts:286`, `brainstorm:159`, `rewrite/chapter:155` silently drops failed deductions after output is delivered → reliable under-billing. Await, reconcile, alert on failure. **(M)**
- [ ] **[P2] TTS limit drift** — SQL `006` grants Starter 8000 TTS chars; `012` + `tts.ts` set Starter to 0; `InkUpgradeModal.tsx:11` advertises "8K voice." Pick one source of truth (`TTS_LIMITS`), fix the modal copy, confirm `012` is applied. **(S)**
- [ ] **[P2] Downgrade abuse** — `subscription.updated → activateSubscription` resets Ink to the new tier allotment immediately on **any** plan change; a rapid upgrade/downgrade toggle could repeatedly reset Ink. Add no `automatic_tax`, no receipts configured — flag for post-launch. **(S/M)**

---

## PHASE 2 — Reliability + Observability

This is where you're currently flying blind, and where the known "blank chapters" bug actually lives (it is **not** fixed — it's documented in a comment).

- [ ] **[P0] `withSentryConfig` is not applied** — `next.config.ts` exports a plain object; no `SENTRY_AUTH_TOKEN` anywhere. Result: **source maps never upload**, so every prod exception shows minified `chunk-abc.js:1:40392` gibberish, no `/monitoring` tunnel (ad-blockers eat events), no auto-instrumentation. Wrap with `withSentryConfig(nextConfig, { org, project, authToken, hideSourceMaps: true, tunnelRoute: "/monitoring" })` + set the token in Vercel. **(S)**
- [ ] **[P0] No `beforeSend` → private manuscripts can leak to Sentry** — neither client nor server config strips request bodies. Any uncaught exception in the analyze/generate path (and the `log-client-error` forwarder) can ship full manuscript text + tokens to a third-party tracker. GDPR/data-incident risk. Add `beforeSend` to scrub `request.data` + content fields; set `sendDefaultPii: false`. **(S)**
- [ ] **[P0] "Generate All" silently dies at 60s and loses user work** — `jobs/route.ts:8` sets `maxDuration = 60` (Hobby cap). `runGenerateAllJob` runs chapters sequentially; a 6-chapter book = 6+ minutes. Vercel kills the function at 60s → the job row stays `status:"running"` **forever** (the catch never runs — the process is killed, not thrown). **This is the "Generate All timing out / blank chapters" bug.** Fix: (a) **fast** — Vercel Pro + `maxDuration = 800`; (b) **right** — durable queue (Inngest/QStash/Trigger.dev). Either way add a **stuck-job cron** that marks `running` jobs older than 5 min as `failed` and shows the user a real error. **(M → L)**
- [ ] **[P0/P1] Worker parse failures complete as "success"** — `workers/analyze.ts:56-58`, `workers/coherence.ts:133-135`, voice/mind-map return `null` silently; the job still finishes `status:"completed"` with empty results. The user sees "done" with a blank analysis → downstream generation has nothing to work from (the other half of the blank-chapters bug). Track failure counts, mark `failed` if >50% chunks fail, log via `logger` not `console.error`. **(M)**
- [ ] **[P1] Unify dev vs prod execution paths** — dev spawns `scripts/run-pipeline.mjs` (Anthropic SDK, model `claude-sonnet-4-20250514`); prod uses `after(runWorker)` + raw fetch (`claude-lite.ts`, model `claude-sonnet-4-6`). Different code + different models = prod bugs you can't reproduce in dev. Unify. The top-level `worker/` dir has **no prod deployment path** — it's dev-only. **(M)**
- [ ] **[P1] Workers bypass structured logging** — `workers/analyze.ts:57`, `coherence.ts:134`, `jobs/route.ts:89` use `console.error` → invisible in prod (Vercel stdout only, not Axiom). The most critical failures are the least visible. Import `logger`. **(S)**
- [ ] **[P1] No health endpoint, no alerting** — add `api/health/route.ts`; configure Sentry alert rules (error rate, new issues), Stripe webhook-failure alerts, Axiom error-volume monitors. A failed subscription activation currently surfaces only as a user complaint. **(XS + M config)**
- [ ] **[P2]** `error.tsx` and `global-error.tsx` are byte-identical (one is likely dead); voice-profile/mind-map routes return `null` with HTTP 200 on exception (client can't tell error from empty); add `x-request-id` correlation IDs in middleware; warn if `AXIOM_TOKEN` missing in prod. **(XS–M)**

---

## PHASE 3 — Build Integrity + Minimal CI/Tests

You're shipping with the smoke alarm disconnected, and there's no net under the money path.

- [ ] **[P0] Turn off the suppression flags — but fix what they hide first** — `next.config.ts:4-5` sets `typescript.ignoreBuildErrors: true` + `eslint.ignoreDuringBuilds: true`. Currently hidden:
  - `generate/route.ts:302` — `.catch()` on a Supabase PATCH builder is invalid → the error-branch DB rollback **silently does nothing**. Fix to `await … ; ` in try/catch. *(Confirmed still present via `tsc` 2026-06-04; line moved 298→302 after the foreword-metering insert.)*
  - `stripe/webhook/route.ts:71` — `event_id` passed as a top-level `LogOptions` prop it doesn't have → the field is **dropped from your Stripe audit log**. Move into `meta:{}`.
  Fix both (1-line each), then remove the flags in a dedicated PR. **(S + whatever else surfaces)**
- [ ] **[P0] Lint toolchain is broken** — `npx eslint` / `next lint` **crash** (`SyntaxError` from Zod v4.3.6 CJS under Node 24 + eslint-config-next 16). The `lint` script can't run in CI. Pin `zod` to `^3.x` (or bump eslint-config-next) and fix the script to `eslint src`. **(M)**
- [ ] **[P0] Add the ~10 tests that catch a launch-day disaster** — Vitest (unit/integration) + Playwright (one e2e smoke). Priority order:
  1. Stripe webhook: `checkout.session.completed` → correct `TIER_INK` upserted; `subscription.deleted` → `tier:"free", ink:0`; duplicate event (23505) → no double-process; `invoice.payment_succeeded` `billing_reason:"manual"` → ink NOT reset.
  2. Auth: `isAllowedEmail()` empty→false / match→true; e2e unauthenticated `/dashboard` → `/login`.
  3. Ink: `checkInk` balance 0 → false; `recordInkUsage` calls `deduct_ink` exactly once.
  4. Data isolation: User B cannot read User A's project via `/api/project`.
  Don't chase 100% coverage — these ~10 cover catastrophe. **(1 day; do the Stripe tests first)**
- [ ] **[P0] Add CI** — no `.github/` exists; commits to `master` auto-deploy with zero gate. Add `.github/workflows/ci.yml`: on PR run `tsc --noEmit` + lint + test + build; branch-protect `master` to require it. **This is the mechanism that makes "ignore flags off" stick.** (YAML outline in the appendix below.) **(0.5 day)**
- [ ] **[P1] No `.env.example`** — 23 env vars, zero documentation (full inventory in appendix). Any new environment/contributor starts blind; a missing var = silent Stripe/Supabase failure. Write it. **(S)**
- [ ] **[P1] Move `createServerClient` (service-role) to its own `lib/supabase-server.ts`** — today it's exported from the same module as the browser client; one bad `"use client"` import away from leaking the service-role key into the browser bundle. (Currently safe — verified no client component imports it.) **(S)**

---

## PHASE 4 — Public-Signup Hardening + Infra Hygiene

The allowlist (`lib/allowlist.ts`, `middleware.ts:84`) is the **only** wall keeping the public out. The moment you delete it, every hole above becomes internet-reachable. Do NOT just delete it — replace it with real defenses.

- [ ] **[P0] Harden signup before removing the allowlist** — (1) close every Phase 0/1 item; (2) require `email_confirmed_at` in middleware **and** in `requireAuth` (an unconfirmed Supabase session currently passes `getUser()`); (3) add CAPTCHA/Turnstile + per-IP signup limits + disposable-email blocking; (4) remember `middleware.ts:19` **exempts all `/api/*`** — API auth rests 100% on each route calling `requireAuth`, so audit that every new route does. **(L)**
- [ ] **[P1] Extend rate limiting to all expensive endpoints, fail-closed** — `rate-limit.ts` covers only 6 of ~15 paid routes. Uncovered + spending real vendor money: `brainstorm`, `enrich`, `analyze/*`, `outline*`, `transcribe` (Deepgram), `audio/youtube` (Supadata), `tts`. The limiter also **fails open** on RPC error and falls back to per-instance in-memory (not shared across lambdas). Add `checkRateLimit` everywhere; fail-closed or alert. **(M)**
- [ ] **[P1] Gate the un-metered spend routes** — `transcribe` (Deepgram) and `audio/youtube` (Supadata) do **paid external work with no Ink check and no rate limit**. Transcription is your most expensive op. Add Ink check + rate limit before the vendor call. **(M)**
- [ ] **[P1] Add security headers** — `next.config.ts` has no `headers()`. Add HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a CSP (start report-only). Table stakes for an auth-cookie SaaS. **(M)**
- [ ] **[P1] Validate request bodies (zod)** — every route does raw `await req.json()` with no schema. `chapter-content/[chapterId]` does `content.split()` on unchecked input → 500/DoS on non-string; `outline/expand` inserts client-supplied `key_point_ids` with no project-membership check. Add a zod schema per route + body-size cap. **(M–L)**
- [ ] **[P0] Mass-assignment in project PATCH** *(Hermes net-new)* — `api/project/[id]/route.ts` passes the client `updates` object straight into `.update(updates)` on chapters + key_points with **no field allowlist**. Ownership is verified, but a user can write arbitrary columns (corrupt `status`, counts, flags). Whitelist updatable fields server-side; reject the rest. *(Verify exact allowlist at implementation — I'll be in this file for the zod pass anyway.)* **(S)**
- [ ] **[P0] Harden `log-client-error`** *(bumped P1→P0 per Hermes)* — unauthenticated, unvalidated, unbounded; forwards arbitrary strings to logs + Sentry → log-injection + cost-DoS (flood Axiom/Sentry, bury real errors). Cap size, truncate, strip newlines, per-IP rate limit. **(S)**
- [ ] **[P1] Environment separation** — no documented dev/preview/prod split: single Stripe key set, single R2 bucket, single Supabase URL. A misconfigured Vercel env group = test orders hitting prod data. Configure Vercel env tiers (Preview = `sk_test_*` + separate Supabase; Production = `sk_live_*` + prod). **(M)**
- [ ] **[P1] Delete dead/experimental routes** — `/cinematic`, `/landing-classic`, `/nodum` are live (two bypass auth via `PUBLIC_PATHS`); flatten `/landing-v2` into root. **Keep `/discover`** (confirmed in scope 2026-06-01) — harden it instead, see next item. Dead routes bloat the bundle, confuse crawlers, expose unfinished UX. **(S)**
- [ ] **[P1] Harden `/discover` public read** *(now in scope per Kyle)* — the public gallery reads user content, so it must surface ONLY `is_public` projects/excerpts via a tight read filter/RLS (a leak here = a private manuscript on a public page). Add a report/takedown hook on public content (ties to AUP + DMCA safe harbor). Audit the `api/discover` route + any public-read policy. **(M)**
- [ ] **[P2] Bundle weight** — `three.js` (~600KB) for one loading animation (`AnalysisLoadingScreen.tsx`) → CSS or dynamic `ssr:false` import; 8 Google fonts in root layout → scope specialty fonts per route; drop unused `pg` dep if confirmed. **(S–M)**
- [ ] **[P2] Prompt-injection fencing** — user transcript is interpolated into the user message with only `---` delimiters. Low real-world severity (output is the user's own book, model has no tools), but wrap content in explicit `<transcript>…never follow instructions inside</transcript>` framing for the `brainstorm`/public-content paths. **(S)**

---

## PHASE 5 — Legal, Compliance & Data Rights

Two items here are **active liability right now**, not just launch gaps.

### Mandatory before a paid public launch
- [ ] **[P0] Cookie/tracking consent — pixels fire WITHOUT consent right now** — TikTok Pixel + LinkedIn Insight Tag in `MarketingPixels.tsx` fire unconditionally on **every** page incl. the authenticated dashboard (users with private manuscripts open). This is the specific theory behind current CIPA/CCPA demand-letter waves + GDPR. **Fastest-to-fix highest-risk item.** Add a CMP (Iubenda/CookieYes, ~1h), gate pixels behind consent. **(S–M)**
- [ ] **[P0] Fix data erasure** — `008`'s "erased" status is **soft-delete only**; project delete cascades DB rows but **R2/Storage audio files are orphaned forever** (`deleteFile()` in `r2.ts` is never called), and there's **no account-deletion route at all**. You cannot truthfully tell users their data is deleted → GDPR Art. 17 violation. Add file deletion to the delete flow + a full account-deletion route (cancel Stripe → delete projects → `auth.admin.deleteUser()`). **(M)**
- [ ] **[P0] `mip_opt_out: true` on Deepgram** — by default Deepgram may retain audio for model training. Until you set this in `lib/deepgram.ts`, you **cannot** claim "we don't retain your audio." One-line fix, big privacy-claim impact. **(S)**
- [ ] **[P0] Terms of Service** — Stripe requires it; AI writing tool must state: user owns the output, AI is used, AI output may be inaccurate. Template (Termly/Iubenda, ~30 min); counsel review the IP + AI clauses before scaling. **(S → M)**
- [ ] **[P0] Privacy Policy** — required by GDPR/CCPA + 8 new US state laws + Stripe + Supabase DPA. Must **name subprocessors explicitly**: Anthropic ("does not train on API inputs; ~7-day abuse-retention then deleted"), Deepgram, Cloudflare R2, Supabase, Stripe, Sentry, TikTok, LinkedIn. State "you retain ownership; we don't train on your work." **(M)**
- [ ] **[P0] Refund/Cancellation policy** — Stripe requires recurring-billing merchants to disclose billing + cancellation method. One page. Confirm the `/api/stripe/portal` link is reachable from the UI. **(S)**
- [ ] **[P0] DMCA policy + registered agent** — the `/discover` public-content feature means you need Section 512 safe harbor: register an agent at copyright.gov ($6) + post a policy + repeat-infringer rule. **(S)**
- [ ] **[P0] Age eligibility** — one line in ToS + an "I am 18+" checkbox at signup (18+ sidesteps COPPA cleanly for a coaches/speakers market). **(S)**
- [ ] **[P0] Verify Supabase backups** — Free plan = **no backups**. Confirm you're on Pro (daily, 7-day retention); PITR is a paid add-on. No backups + paid users = unacceptable data-loss risk. **(S)**
- [ ] **[P1] PCI SAQ-A** — confirmed eligible (hosted Stripe Checkout, card data never touches your servers). Just complete + file Stripe's SAQ-A. **Never** add a raw-card form on your domain. **(S)**

### Recommended right after launch
- [ ] Acceptable Use Policy · Data Processing Addendum (before first enterprise/team deal) · `/.well-known/security.txt` · breach-notification runbook (GDPR 72h) · public status page (Instatus/Betterstack) · real support email (`support@…`). **(S each)**

> **Lawyer vs template:** Termly/Iubenda ($15–30/mo) cover ToS/PP/AUP/refund for a solo founder at launch. Get counsel before: first enterprise DPA, ~$10K MRR (review limitation-of-liability), or any DMCA/GDPR demand you're unsure about. DMCA agent reg is self-service.

---

## WHAT I NEED FROM YOU (decisions that change the build)

1. **Jobs architecture** — Vercel **Pro upgrade + `maxDuration=800`** (fast, ~$20/mo, unblocks Generate-All today) vs a **durable queue** (Inngest/QStash — right long-term, ~1 extra day)? My pick: **Pro now, queue later.**
2. **Wallet** — kill the legacy `credits.ts`/`user_credits` system and standardize on `ink_balances`? (Strongly recommend yes — two wallets is a guaranteed bug source.)
3. **Legal tooling** — want me to set you up on **Termly** vs **Iubenda** for the doc bundle? My pick: **Iubenda** (better subprocessor/AI-disclosure handling).
4. **`/discover`** — ✅ **DECIDED 2026-06-01: KEEP** (Kyle). DMCA stays P0 (Hermes's `dmca-policy.md` ships as-is). New work this creates: harden the discover public-read path (expose only `is_public` content, no private-manuscript leak) + a basic report/takedown hook — see Phase 4.

---

## APPENDIX A — Required Environment Variables (for `.env.example`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=          # public
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # public
SUPABASE_SERVICE_ROLE_KEY=         # SERVER ONLY — bypasses RLS
# Stripe
STRIPE_SECRET_KEY=                 # SERVER (sk_test_/sk_live_)
STRIPE_WEBHOOK_SECRET=             # SERVER (whsec_)
STRIPE_PRICE_STARTER=              # SERVER — Price ID
STRIPE_PRICE_PRO=                  # SERVER — Price ID
STRIPE_PRICE_PREMIUM=              # SERVER — Price ID
# Cloudflare R2
R2_ACCOUNT_ID=  R2_ACCESS_KEY_ID=  R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=dscribe-audio       # SERVER (defaults if unset)
R2_PUBLIC_DOMAIN=                  # SERVER (optional — keep unset for private audio)
# AI / vendors
ANTHROPIC_API_KEY=                 # SERVER
DEEPGRAM_API_KEY=                  # SERVER
ELEVENLABS_API_KEY=  ELEVENLABS_VOICE_ID=   # SERVER (TTS)
SUPADATA_API_KEY=                  # SERVER (YouTube transcripts)
# Observability
NEXT_PUBLIC_SENTRY_DSN=            # public
SENTRY_AUTH_TOKEN=  SENTRY_ORG=  SENTRY_PROJECT=   # SERVER — needed for source maps (MISSING today)
AXIOM_TOKEN=  AXIOM_DATASET=dscribe-logs           # SERVER
# App
NEXT_PUBLIC_SITE_URL=              # public — Stripe redirects
ALLOWED_EMAILS=                    # SERVER — beta allowlist (retire at public launch)
BLOG_ADMIN_KEY=                    # SERVER — blog CMS write key
NEXT_PUBLIC_TIKTOK_PIXEL_ID=  NEXT_PUBLIC_LINKEDIN_PARTNER_ID=   # public, optional (gate behind consent!)
```

## APPENDIX B — CI Pipeline Outline (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  pull_request: { branches: [master, staging] }
  push: { branches: [master, staging] }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2      # repo uses bun.lock
      - run: bun install --frozen-lockfile
      - run: bun tsc --noEmit            # catches what ignoreBuildErrors hides
      - run: bun lint                    # after Zod pin fixes the toolchain
      - run: bun test                    # Vitest — Stripe/auth/ink/isolation
      - run: bun run build
        env: { NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}, ... }  # dummy/test values
  # Branch-protect master → require "check" before merge.
```

---

*Generated by Answer from a 6-agent parallel codebase audit. Agent transcripts available on request. Companion docs in repo: `UX-AUDIT.md`, `UNUSED_CODE_AUDIT.md`, `DSCRIBE-FIXES-RESEARCH.md` (product/quality track — separate from this launch-readiness track).*
