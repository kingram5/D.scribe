# Staging setup and validation handoff — 2026-10-09

Read `openai-stack-rollout.md` first. Neither production provider, pricing nor production Live entitlements were changed.

## Observed bindings and blockers

- Branch was clean at `485f5d0`; existing worktrees were left untouched.
- Vercel project `d-scribe` (`prj_GBAKoUJ9g8mK6FZCLGhZZDtfqmLN`) uses Node 24.
- Existing preview Supabase URL is `https://imjkauxdlwfrblrgidgj.supabase.co`. Supabase names this project `Manuscript`; it has **no development branches**. This is an observed preview binding, **not proof that the database is staging-only**. Do not run the migrations there until its isolation from production is established.
- Existing Vercel preview bindings include the public Supabase key and service-role key. An existing sensitive `OPENAI_API_KEY` binding targets preview and production. Reuse authorized existing bindings through secure settings where supported; do not request replacement credentials unnecessarily or copy production credentials into staging by assumption.
- No D.scribe Supabase or OpenAI credentials are injected into this ChatGPT runtime. The available ChatGPT browser is signed out; environment draft/settings cannot be inspected or published from this session.
- Read-only inspection of the preview-bound database found `pr_runs` and `ink_reservations`, but neither `pr_ai_calls` nor `theo_live_sessions`. Migration history does not contain either new migration. Those observations apply to Manuscript, which remains unchanged. Separate staging is now created and migrated, as recorded below.
- Existing HTTPS preview for `485f5d0`: https://d-scribe-9g0tpprd5-kyles-projects-6adbe8c9.vercel.app . Vercel reports READY; login, callbacks and paid integrations are unverified.
- Draft PR: https://github.com/kingram5/D.scribe/pull/47 . Do not merge for activation.

## Completed isolated staging setup

The user created the Free-plan `dscribe-openai-staging` project: `fbqeamhjfsxqchixhlep`, URL `https://fbqeamhjfsxqchixhlep.supabase.co`. Manuscript was read only for schema metadata. No customer rows or auth users were copied.

Four staging migrations installed private tables, constraints/indexes, private functions, and policies/triggers. The exact two checked-in migrations are applied: `pr_provider_attempts` at `20261009195644` and `theo_live_staging` at `20261009195701`. A subsequent `staging_server_workflow_access` migration granted scoped server-only permissions. Catalog checks found 50 public tables, all with RLS enabled, zero auth users and zero projects. Client table access remains revoked. The security advisor reports informational RLS-without-policy notices for private server tables and no warning/error findings.

`deploy/staging-schema-baseline.sql` records the schema-only baseline, excluding all data and source grants. Do not reapply it to this staging database. For a new empty staging database, apply it first, then the two checked-in migrations, then `deploy/staging-workflow-access.sql`. Billing setting/rate seed rows and an authorized staging auth account are still required.

Seven branch-only Vercel preview bindings now set staging URL/public key/reference, the documented rate card, empty cohort, `PUBLISHER_READY_TEXT_PROVIDER=legacy`, and `THEO_LIVE_STAGING=false`. No generic or production bindings changed. The matching staging server secret still requires secure entry; the inherited generic preview secret must not be used for staging. New bindings require a rebuild. The ChatGPT runtime settings remain inaccessible from this session.

## ChatGPT configuration actions

In the existing **Configure secrets** and **Configure environment variables** prompts, edit the existing draft rather than replace its settings. The confirmed isolated staging reference is `fbqeamhjfsxqchixhlep`. If it is a separate project/branch, use its own URL and keys. If `Manuscript` serves production, it is not a staging-only target: choose or provision isolated staging before proceeding. Creating a paid Supabase project/branch needs a separate cost decision.

| Entry | Type | Value / destination |
| --- | --- | --- |
| `DSCRIBE_OPENAI_API_KEY` | Secret | Securely select/enter the authorized existing OpenAI credential; destination `api.openai.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Environment variable | `https://fbqeamhjfsxqchixhlep.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Environment variable | Matching project's public/anon key; never its service-role key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret | Matching staging project's service-role key; destination `fbqeamhjfsxqchixhlep.supabase.co` |
| `DSCRIBE_STAGING_SUPABASE_REF` | Environment variable | `fbqeamhjfsxqchixhlep`; required by the new preflight |
| `NEXT_PUBLIC_SITE_URL` | Environment variable | Exact chosen HTTPS preview origin |
| `OPENAI_PR_USER_IDS` | Environment variable | Comma-separated UUIDs of explicitly authorized test users in the staging project |

Append `api.openai.com` and `fbqeamhjfsxqchixhlep.supabase.co` to the existing network allowlist, preserving every existing destination. Do not add a wildcard.

Use the secure secret controls, then save both prompts and publish/apply the environment draft using the controls actually displayed. Restart/recreate the cloud runtime to load the saved revision. Saving the draft alone is not evidence of runtime injection. Vercel and the worker host have separate settings; publishing ChatGPT settings does not update them. Public Next.js variables also require rebuilding the preview.

Keep activation flags at their disabled defaults until credentials, database isolation, migrations, pricing and spending approval are established. For the subsequent controlled staging run, use the exact text and Live variables in `openai-stack-rollout.md` on both web and worker, including the explicit cohort. Set `VERCEL_ENV=preview` on the standalone worker; Vercel supplies this for its preview. Preserve all unrelated variables and use branch-scoped preview overrides rather than shared/production edits. Check that the Publisher-Ready UI/backend feature flags are enabled for this branch's preview; flags scoped to another branch do not automatically apply.

Rates were rechecked against the official Sol, Astra and Live model pages on 2026-10-09 and match the rollout guide. Retain the guide's exact rate-card version and values unless new vendor documentation requires a replacement version. Model listing alone is not evidence that a paid request or usage settlement works.

## Database and authentication

The migrations below are already installed on the new staging project. On any additional staging target, verify isolation and inspect migration history before applying only `20261008230000_pr_provider_attempts.sql`, then `20261008231000_theo_live_staging.sql`, recording their history entries. Both add accounting/transcript state, RLS and service-role-only functions; they depend on the existing Publisher-Ready and Ink schema. Do not replay the historical migration directory, the unrelated `030_` pricing activation, or the disposable test's local `023_topups.sql` adaptation on shared databases. Afterward verify tables, function permissions, RLS, idempotent settlement and denied client-role access.

Set the staging Supabase Auth redirect allowlist to the exact preview's `/auth/callback` and `/auth/confirm` paths (including callback query strings according to Supabase's supported redirect matching rules). Preserve existing entries. The Google OAuth provider callback is the staging Supabase `/auth/v1/callback`, not the application's callback. Use staging OAuth configuration and verify that both Google and email login return to the preview, preserve the selected project, and never redirect to production. Ensure the existing email allowlist admits only the authorized test users. Do not weaken Vercel Deployment Protection.

## Persistent worker and runtime checks

`deploy/theo-live-staging.service` is an uninstalled systemd template, not an active service. Use a host with persistent Node 24 processes and long-lived outbound WebSocket/proxy support. Install the reviewed branch in `/opt/dscribe`, run `npm ci`, create an unprivileged `dscribe` service account, and securely provision `/etc/dscribe/staging.env` with matching staging settings. Keep this file out of source control and readable only by authorized administrators. Adjust Node/npm paths to the host's actual Node 24 installation. Install the unit and enable/start `theo-live-staging` only after the staging prerequisites and budget are satisfied. No worker host was available in this session.

Run `npm run staging:preflight` in the actual web/worker runtime after saved settings are injected. It validates credential presence, explicit cohort, HTTPS, the operator-pinned project reference, and the application's real provider configuration validators without displaying secret values or spending money. It cannot independently prove that the operator-pinned database is isolated or that supplied rates are current.

After migrations and service startup, run `npm run staging:preflight -- --remote`. This makes read-only table/heartbeat and OpenAI model-list checks; it does not create calls, sessions or writes. Failures report categories without raw provider/database payloads. Passing is not a substitute for authenticated inference, media or billing validation. Run it on both hosts; matching environment drafts do not prove matching running processes.

## Spending and acceptance evidence

No paid requests were made. User-approved initial budget: **$10 total**, including OpenAI text and Live, delegated backend calls and any legacy comparison calls. The user approved this first-round spending cap; no paid calls have occurred. Limit each memoir/expert excerpt to the existing harness's 15,000 source characters and 1,500 target words; confirm fixture authorization before using it. Never use customer manuscripts without explicit authorization. Use sequential runs with a shared spend ledger; `PR_EVAL_MAX_USD` is per runner invocation, not a global or legacy/voice cap. Set each invocation to its remaining allocated text budget (always <=25), use `PR_EVAL_CONFIRM=yes` only after approval, and reconcile unknown outcomes before another purchase. Worker restart/quota tests must fit vendor-enforced lifetime reservations, not rely on browser timers.

Record request/response/session IDs, pinned model/rates, vendor usage/cost, wallet reservations and final settlement evidence privately. Compare both excerpts blind for source fidelity, voice and editor usefulness. Complete an authenticated Publisher-Ready run through edits/export. Test microphone permission/audio/autoplay, persisted fragments, confirmation, audited corrections, typed continuation, desktop and iOS/Safari, background/screen lock, disconnect, worker restart and quota exhaustion. Require vendor final closure/usage after browser disappearance; a disconnected browser is not proof that billing stopped.

This session reran 52 test files: 596 passing tests and one expected failure. TypeScript and preflight-file lint passed. The preflight correctly rejects this unconfigured runtime; synthetic configuration smoke checks passed for valid settings and rejection of production/mismatched project targets. On the existing HTTPS preview, the homepage returned HTTP 200 with D.scribe content and unauthenticated `/api/theo/live` returned HTTP 401. These HTTP checks used authorized Vercel protection access, without an application login. The earlier 30 disposable PostgreSQL checks and placeholder build results were not rerun and remain offline evidence. Actual model access, billing reconciliation, authenticated workflows and device/vendor tests remain pending.
