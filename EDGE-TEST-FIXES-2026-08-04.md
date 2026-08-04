# Edge-Test Fixes — branch `fix/edge-test-80`

**Date:** 2026-08-04 · **Source campaigns:** `dscribe-edge-test-2026-08-02.md` (53 backend) + `dscribe-mobile-edge-test-2026-08-02.md` (27 mobile)
**Suite:** 135/135 passing, **zero `it.fails` remaining** — every probe is now a permanent regression guard. `tsc --noEmit` clean. `bun run build` clean (needs Supabase env, as in CI).

## ⚠️ Deploy order — read before merging

1. **Apply migrations 017 + 018 to prod Supabase BEFORE deploying this code.**
   The new `ensureBalance` calls the `ensure_ink_balance` RPC and **throws** if it
   is missing — deploying code first would 500 every Ink pre-flight.
   (`bump_edit_counter` has a graceful fallback; `ensure_ink_balance` deliberately does not.)
2. Migration 017 also regenerates `ink_usage.ink_cost` (drop + re-add of a stored
   generated column) and marks all existing `stripe_events` processed.
3. Migration 018 drops the whole-row public-projects RLS policy and replaces it
   with a column-scoped `public_projects` view.

## Pricing knobs introduced (sanity-check the numbers)

- `model_ink_factor`: haiku bills **0.25x**, sonnet **1.0x** (unchanged) — fixes
  model-blind pricing *without* raising any existing price (finding 12).
- `INK_PER_AUDIO_MINUTE = 0.5` (Deepgram) and `INK_PER_YOUTUBE_IMPORT = 2`
  (Supadata) — rough cost-parity with the 1-Ink-per-1000-token convention
  (finding 30). Both are constants in `src/lib/ink.ts`.

## Backend findings 1-53

| # | Disposition |
|---|---|
| 1 | **Fixed** — `clientIp()` prefers platform `x-real-ip`, else RIGHTMOST XFF entry |
| 2 | **Fixed** — per-email limiter keys on `canonicalizeEmail()` (new `src/lib/email.ts`) |
| 3 | **Fixed** — expired-entry eviction, null-row detection with its own log line. Fail-open fallback retained deliberately (availability over strictness), now documented |
| 4 | **Fixed** — registrable-suffix match + trailing-dot normalisation |
| 5 | **Fixed** — empty/whitespace quotes filtered, quotes deduped |
| 6 | **Fixed** — empty transcript → zero chunks (nothing billable) |
| 7 | **Fixed** — lookback clamped to chunk length, trim guarded |
| 8 | **Mitigated** — IP gate now runs FIRST and sequentially, so a blocked IP can't burn the victim's per-email counter. Per-email lockout from distributed IPs is inherent to the control; accepted |
| 9 | **Fixed** — two-phase idempotency (`processed` flag): handler failure leaves the event retryable; duplicate deliveries of a finished event still no-op |
| 10 | **Fixed** — revocation only on full refund (`charge.refunded === true` or amount check); partial refunds logged and retained |
| 11 | **Fixed** — `SELECT … FOR UPDATE` in `deduct_ink` (+ flat variant); returned balance comes from the UPDATE |
| 12 | **Fixed** — `model_ink_factor()` in cost + regenerated `ink_cost` column |
| 13 | **Fixed** — lazy refill now lives in `ensure_ink_balance`, reachable from the read path that used to block the stranded user |
| 14 | **Fixed** — `ensureBalance` checks errors and throws; no more fabricated in-memory wallets |
| 15 | **Fixed** — `deduct_ink` fallback creates an EMPTY wallet; trial policy centralised in `ensure_ink_balance` behind the anti-farming check; TS hashes canonical + raw forms |
| 16 | **Fixed** — `Number()` wrap before `.toFixed` |
| 17 | **Fixed** — unknown/missing tier metadata logs loudly and does NOT activate |
| 18 | **Mitigated** — `freezeInk` checks the LIVE subscription status and skips the freeze if it has recovered (the dangerous stale-freeze direction). Full event-ordering (timestamp comparison) not implemented |
| 19 | **Fixed pattern-wide** — non-streaming routes parse before billing and never surface a billing failure as a product error; streaming routes settle usage exactly once incl. error/cancel. True reservations (hold at pre-flight) not implemented — locks + cost-aware floors bound the exposure |
| 20 | **Fixed** — each delete's error checked before the auth user is removed |
| 21 | **Fixed** — R2 cleanup fail-closed: enumeration failure or any per-key failure aborts BEFORE the key rows drop; no more `{deleted:true}` over surviving audio. **Bonus find: cleanup selected a nonexistent `r2_key` column and swallowed the error — it had deleted nothing since it shipped.** Now reads `file_path` |
| 22 | **Fixed** — canonical + raw hashes written on delete, both checked at signup |
| 23 | **Fixed** — `content` validated (400), version race retried on unique-violation |
| 24 | **Fixed** — brainstorm streams deltas raw; sanitizer reserved for assembled prose |
| 25 | **Fixed** — via 28 (navigate untouched); pattern grammar corrected if ever reactivated |
| 26 | **Fixed** — sanitizer never rewrites inside straight/curly quotes |
| 27 | **Fixed** — em dashes converted only between word characters; leading/interruption dashes survive |
| 28 | **Fixed** — sanitizer consults `SOFT_TELLS` at module load; `leverage` added to the soft set |
| 29 | **Fixed** — `content-type` forced into the presigned signature; server echoes the signed value and the client PUTs exactly it (paired with M-cross below) |
| 30 | **Fixed** — `transcribe` + `youtube` metered via `deduct_ink_flat`, cost-aware pre-flights (`checkInk` with operation) |
| 31 | **Mitigated** — metered + cost-gated; the 4.5-min poll loop itself retained |
| 32 | **Fixed** — `file_name` slugified for the object key; display name unchanged in DB |
| 33 | **Fixed** — `confirm-upload` HEADs the object, 400s if absent, reconciles real size |
| 34 | **Fixed** — input tokens read from `message_start` |
| 35 | **Fixed** — brainstorm/generate/streamClaude abort upstream on client cancel and settle usage exactly once. No per-fetch timeout (Vercel `maxDuration` bounds it) |
| 36 | **Fixed** — 300-char entry cap + whitespace collapse on every memory string |
| 37 | **Mitigated** — length caps + newline collapse close the structural injection; content-level review of model output is not deterministically checkable |
| 38 | **Fixed** — distillation saved before billing |
| 39 | **Fixed** — atomic `bump_edit_counter` RPC (racy fallback if unmigrated) |
| 40 | **Fixed** — `transcribe` rejects any `file_path` not prefixed by its own `project_id/` (server-written keys always are) |
| 41 | **Fixed** — migration 018: whole-row public policy replaced by a column-scoped view |
| 42 | **Documented, no change** — `for all` policies are a deliberate architecture; the one place a client-writable column crossed server trust (40) is closed |
| 43 | **Fixed** — large/unserializable objects dropped from `extra` |
| 44 | **Fixed** — query string stripped from `request.url`, `query_string` deleted |
| 45 | **Fixed** — breadcrumbs capped + URL-stripped; `user` reduced to id |
| 46 | **Fixed** — logger unwraps `{ message, code, details, hint }` objects |
| 47 | **Fixed** — per-IP rate limit (30/hr) on `log-client-error` |
| 48 | **Fixed** — `requireAuth` re-checks the allowlist every request (env lookup, cheap) |
| 49 | **Fixed** — one `MODELS` map in claude-lite, imported everywhere (incl. generate's hardcoded id); structural probes prevent re-divergence |
| 50 | **Fixed** — `TruncatedJsonError` signal + parse-before-bill in the three consumer routes |
| 51 | **Mitigated** — `maxDuration = 300`, chapter queries batched (≤8 in flight). In-memory PDF/DOCX build remains; streaming export is an architecture change, flagged as follow-up |
| 52 | **Fixed** — first block of type `text` found, not assumed at index 0 |
| 53 | **Fixed** — RFC 5987 `filename*` with ASCII fallback |

## Mobile findings M1-M27

| # | Disposition |
|---|---|
| M1/M20 | **Fixed** — `maximumScale` deleted; comment warns against reintroduction (it never worked on iOS and broke Android zoom) |
| M2 | **Fixed** — mobile block `vh` → `dvh` (3 rules) |
| M3 (+b) | **Fixed** — `viewportFit: "cover"` + `env(safe-area-inset-bottom)` on the fixed nav (PageShell + mobile CSS) and shell padding |
| M4 | **Fixed** — nav links: 14px/14px padding + `min-height: 44px` |
| M5 | **Documented, no change** — the `!important` force-undo architecture is fragile but rebuilding it blind risks every mobile page; the magic `100px` clearance is now safe-area-aware |
| M6 | **Fixed** — `@dnd-kit/*` (3 packages) removed |
| M10 | **Fixed** — OutlineEditor drag on Pointer Events + `pointercancel` + `touch-action: none`; chapter reordering now possible on touch |
| M11 | **Fixed** — MagicEditBubble, VoiceMatchBadge, UserMenu dismiss on `pointerdown` (+ a fourth instance the campaign missed: the transcript page's custom scrollbar thumb, also converted) |
| M12 | **Fixed** — bubble clamped to viewport; anchored BELOW the selection on small screens (the OS selection callout owns the space above) |
| M13 | **Fixed** — `AnalysisLoadingScreen` dynamically imported, `ssr: false` |
| M14 | **Documented, no change** — mind-map backend still has no frontend; `@xyflow`/`@dagrejs` left pending a product decision |
| M15 | **Fixed** — XHR upload with progress %, rendered as a bar in RightPanel |
| M16 | **Fixed** — one automatic retry + 30-min timeout. Multipart/resumable upload not implemented — flagged as follow-up for 500 MB-class files |
| M17 | **Fixed** — MediaRecorder candidate list led by `audio/mp4`; explicit error if nothing matches |
| M18 | **Fixed** — `releaseMicrophone()` on every failure path; error message no longer lies about permissions |
| M19 | **Fixed** — per-file `uploadError` state rendered in the UI; server messages reach the user |
| M21/M22 | **Measured/informational** — payload addressed via M23; per-section overflow clipping confirmed correct |
| M23 | **Fixed** — `preload: false` on geistMono/kalam/instrumentSerif |
| M24/M27 | **Fixed** — all 11 explicit sub-16px text fields bumped to 16; probe scan window hardened (it was attributing neighbouring elements' sizes to inputs) |
| M25 | **Fixed** — consent buttons `min-height: 44`; Privacy Policy link tap area grown via padding/negative margin |
| M26 | **Fixed** — `enterKeyHint="go"` + `spellCheck={false}` on the login email |
| M-cross | **Fixed together with 29** — client PUTs the server-signed content type (fallback `application/octet-stream` when `file.type` is empty), so signing the type does not break iOS uploads |

## Known leftovers (deliberate)

- Pre-existing lint error in `ConsentBanner.tsx` (setState in effect) — predates this branch, CI does not lint.
- Pre-existing scrollbar-thumb hover animation (`width`/`margin-left` transition, transcript page) — decorative desktop chrome; flagged for the next `/impeccable audit` with a browser open.
- Probe-file notes: several probes were REWRITTEN (not just promoted) where their assertion shape predated the chosen fix — each carries a comment explaining the new contract.
