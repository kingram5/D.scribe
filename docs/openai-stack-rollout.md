# Publisher-Ready OpenAI branch

This branch adds opt-in Publisher-Ready text routing and a staging-only Theo Live review interview. It does not enable either provider by default. It starts from master `df34467` (which already includes `cursor/refine-mobile-publisher-ready-e684` and its patches). The legacy seven-step flow, Publisher-Ready eight-counted-step flow, source ingestion, prices, and existing Ink allowances remain in place.

## Text routing and accounting

New runs select `PUBLISHER_READY_TEXT_PROVIDER=legacy|openai` (default legacy). OpenAI additionally requires the user's ID in `OPENAI_PR_USER_IDS`. Each run stores its provider, stage models/efforts, service tier, price version, and rates in `pr_runs.models`. Resuming a run uses that snapshot; changing flags affects new runs. Pre-migration runs retain legacy routing.

| Stage | Model | Reasoning |
| --- | --- | --- |
| Beats | gpt-6.1-sol | low |
| Draft | gpt-6.1-sol | medium |
| Editor review | gpt-6-astra | high |
| Coverage / interview follow-up | gpt-6.1-sol | low |
| Revision | gpt-6.1-sol | high |
| Final targeted edits | gpt-6.1-sol | medium |
| Voice sample pairs / anchor | gpt-6.1-sol | medium / low |

The adapter uses Responses streaming, strict structured output plus server schema validation, no automatic retries, no tools, and `store:false`. There is no automatic cross-provider fallback. Existing source-fidelity, quotation, revision, and author-edit protections still run. The final stage can finish without a paid call when no issues require one.

`pr_ai_calls` stores request/response IDs, raw usage, normalized result, vendor cost, the captured database Ink multiplier, and reservation/settlement state. Cached input and cache-write tokens replace the corresponding uncached input; reasoning tokens are already included in output. Prompts over 272,000 input tokens use the documented 2x input/cache and 1.5x output rates. Service tier is Standard (`default`); an unpriced returned model/tier or missing usage requires reconciliation rather than a guessed charge. Rates are for global processing, without regional premiums or tools.

Before each paid call, reserve a conservative input-byte/output-token ceiling using the existing Ink wallet and its database multiplier. Successful validated output settles actual usage once. Known refusals, invalid output, and incomplete responses record vendor expense but release the user hold without charging. Unknown transport outcomes keep the hold and block blind repurchase. `pr_step_jobs` claims each chapter/stage; `pr_commit_step` atomically saves manuscript/editor output, pass records, and the replay receipt, rejecting a changed author version.

## Staging configuration

Use Node 24 (the worker uses `--use-env-proxy`), install with `npm ci`, and supply the existing Supabase project URL, public key, and server service-role key through secure deployment settings. Apply these two new migrations to a backed-up staging database after reviewing its migration history:

- `20261008230000_pr_provider_attempts.sql`
- `20261008231000_theo_live_staging.sql`

Do not apply the unrelated historical pricing activation migration as part of this change. The disposable DB test adapts a pre-existing `023_topups.sql` function-signature issue locally and excludes `030_`; it is not evidence that a completely fresh production database can replay every historical migration unchanged.

Required text configuration:

```text
PUBLISHER_READY_TEXT_PROVIDER=openai
OPENAI_PR_USER_IDS=<comma-separated staging user UUIDs>
DSCRIBE_OPENAI_API_KEY=<secure server-side binding>
OPENAI_PR_RATE_CARD={"version":"openai-standard-global-2026-10-08","models":{"gpt-6.1-sol":{"input":2,"cached":0.1,"cacheWrite":2.5,"output":10},"gpt-6-astra":{"input":10,"cached":1,"cacheWrite":12.5,"output":50}}}
```

The rate values above were checked against official model documentation on 2026-10-08; prices are USD per million tokens. Configuration is deliberately required so deployment operators can verify current pricing. Optional model overrides are `OPENAI_PUBLISHER_READY_STANDARD_MODEL` and `OPENAI_PUBLISHER_READY_EDITOR_MODEL`; supply an exact matching verified rate entry. These model names are aliases, not immutable vendor snapshots. Response model IDs are recorded; an unpriced changed ID stops settlement. The current long-context rule must be reviewed before using other models.

`DSCRIBE_OPENAI_API_KEY` is supported because the managed cloud environment reserves `OPENAI_*` secret-binding names. Conventional deployments may use `OPENAI_API_KEY`. No key is sent to the browser. The environment draft declares the OpenAI key requirement and allowed API destination, but contains no actual credential. Environment settings must also allow the actual staging Supabase hostname; do not guess it.

## Theo Live service

Enable only in staging, with matching settings on the web server and a separately hosted, continuously running worker:

```text
THEO_VOICE_PROVIDER=openai
THEO_LIVE_STAGING=true
THEO_LIVE_USD_PER_MINUTE=0.05
OPENAI_THEO_LIVE_MODEL=gpt-live-1
THEO_LIVE_PRO_SECONDS=5200
THEO_LIVE_PREMIUM_SECONDS=15600
```

`VERCEL_ENV=production` blocks Live. Starter has zero Live entitlement. Pro/Premium caps are staging proposals, not changes to paid production plans. Migration of existing character-based voice usage into seconds remains a product decision; do not grant both as production allowances.

Run `npm run theo:worker` under a restart-capable service supervisor with the same database and OpenAI credentials. Do not run this as a Vercel request handler. Web requests only queue sessions and publish worker-produced SDP. A recent worker heartbeat is required before creating a session. The browser uses WebRTC; the worker controls the authenticated vendor sideband through the supported HTTPS proxy/CA configuration. Validate hosting support for long-lived WebSockets and the browser's vendor media connectivity before rollout.

One active or unresolved session per account is allowed. The server reserves all remaining seconds in the account's Ink billing period without debiting Ink or touching the legacy character budget. Vendor-enforced `expires_at` must fit the reservation, with a safety margin, before SDP is released. A remaining allowance shorter than the vendor's session lifetime can therefore be unavailable even when a few minutes remain. A worker cannot enforce a smaller hard lifetime by relying on a browser timer.

Usage updates are cumulative snapshots, not deltas. `session.closed` final usage settles voice seconds/cost and releases unused time. End, hidden/background tabs, 30-second missing client heartbeats, two-minute input inactivity, quota/expiry approach, and disabled flags request server-side `session.close`. A disconnect is not proof billing ended. Unresolved sessions retain their hold; another worker reattaches to stale known sessions solely to close them. An ambiguous create with no vendor ID needs operator reconciliation.

Theo receives the next question from the existing backend. Browser event permissions permit only session close; backend delegation reads persisted vendor transcript events, not client-supplied tool text. Event IDs and answer source keys deduplicate delivery. Accepted turns use the existing `pr_answers` contract and Sol follow-up routing; delegated text is separately metered in Ink. Raw fragments are paged from storage, retained across interruption, and shown for review. Final fragments require explicit confirmation before they become author answers. Corrections retain an audit entry. No Deepgram/ElevenLabs controller is mounted alongside the Live panel.

The UI permits typed continuation after confirmed voice closure and immediate fallback if microphone/session startup fails. During an unresolved termination it retains the transcript and waits for closure; this conservative behavior needs a staging usability review, especially for prolonged control-plane outages. It does not claim instant seamless resume of an existing vendor session. A new session resumes backend question state.

## Recovery and rollback

Monitor these service-role-only records; never expose raw provider payloads or credentials to a public dashboard:

```sql
select id,run_id,stage,state,response_id,request_id,failure
from pr_ai_calls where state <> 'settled' order by created_at;
select run_id,chapter_id,step,state from pr_step_jobs where state <> 'done';
select id,state,vendor_session_id,used_seconds,reserved_seconds,failure
from theo_live_sessions where state <> 'closed';
```

For `pr_ai_calls.state='observed'`, retry `pr_settle_ai_call(id)` with a service-role database session; it is idempotent. For `pending`/`reconciliation`, match provider records by request/response/client-request ID and capture final usage before invoking `pr_observe_ai_call` and settlement. `store:false` means retrieval of the full response is not guaranteed. Never mark unknown calls free or release reservations based only on elapsed time. If final output cannot be recovered, settle vendor expense with a null result/failure (no user debit), retain the incident record, and explicitly authorize a new attempt through an operator-reviewed recovery. This branch intentionally has no automatic paid retry button for unknown outcomes.

For a chapter job needing reconciliation, first inspect its saved pass/version, all associated provider attempts, and the current author version. Completed receipts replay without recharging. Do not delete claims to force a retry or overwrite newer author content. A failed transaction may be retried only after an operator establishes which paid outputs can be reused and that the inputs still match. Recovery that requires a different manuscript version needs a new reviewed run.

For voice, retain the worker while draining sessions. Use the authenticated sideband to request closure and reconcile final vendor usage. If no vendor ID survived creation, use provider request records/support; do not free the hold without evidence. Expiry bounds vendor lifetime but does not establish exact final usage.

Rollback: set text provider to `legacy` for new runs, disable the Live flag, and keep the worker running until sessions close. Saved OpenAI runs remain pinned; stop their execution operationally if a complete outage is needed. Preserve provider tables, receipts, and holds. Reverting UI/routing code does not undo charges or justify dropping accounting tables.

## Validation and remaining activation gates

Offline validation on this branch:

- Unit/contract suite: 51 files, 583 passing tests, one pre-existing expected failure. Includes two synthetic memoir/expert workflows using the real pipeline core with mocked provider responses; these are not quality benchmarks.
- Disposable PostgreSQL 17 integration suite: 23 checks for migrations, concurrent claims, idempotent settlement, multiplier changes, insufficient funds, unknown outcomes, author-version conflict, Live deduplication/accounting, audited corrections, and client-role denial.
- TypeScript and production build with the repository's CI placeholder service configuration. Placeholders do not validate login, paid APIs, or production data.
- Built-server smoke check: homepage HTTP 200 with D.scribe content; unauthenticated Live API HTTP 401.
- Targeted new-file lint passes. Repository-wide lint reports 18 errors in unchanged files (and 33 warnings) and remains disabled in CI.

Reproduce with `npm test`, `npx tsc --noEmit`, and `npm run build` using the project's CI build environment. Run `DSCRIBE_TEST_DATABASE_URL=<disposable local PostgreSQL URL> npm run test:openai-db`; it creates/drops a unique test database and rejects nonlocal hosts. Do not use a shared or production cluster.

`npm run eval:openai -- authorized-fixture.json pinned-config.json` runs the actual text adapter/core with no customer wallet. It requires `PR_EVAL_CONFIRM=yes` and `PR_EVAL_MAX_USD` (positive, maximum 25), with <=1500 target words and <=15000 source characters. It reserves a conservative budget before each request and writes outputs, usage, cost, errors, and elapsed time beneath ignored `evals/publisher-ready/results/`. Use the same authorized memoir and expert excerpts as the existing `eval:pr` legacy arms; no customer manuscripts were copied for this build. Unknown outcomes need cost reconciliation before repeating. The legacy harness has its own billing behavior and is not covered by this runner's hard limit.

Before enabling a cohort: verify actual model access, compare blind source fidelity/voice/editor usefulness on both excerpts, reconcile an actual bill, and exercise an authenticated staging run end to end. Test iOS/Safari and desktop mic permission, autoplay, interruption, backgrounding/screen lock, disconnect, worker restart, quota exhaustion, corrections, final-fragment confirmation, typed continuation, author edits, and exports. Prove actual vendor closure and usage after browser disappearance. None of these live checks or quality comparisons have been performed without credentials and an HTTPS staging deployment. No measured per-book price is claimed.

Official references checked:

- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/models/gpt-live-1
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/live-conversations
- https://developers.openai.com/api/docs/guides/live-delegation
- https://developers.openai.com/api/docs/guides/voice-latency-cost
