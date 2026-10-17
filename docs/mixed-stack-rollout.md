# Mixed stack: staging, operation and rollback

Production defaults remain `current`, `false`, `current`, `current` for text,
mixed enablement, voice and uploaded transcription. No environment credentials,
production routing, remote migrations or product prices were activated by this
branch. Node 24 and Bun 1.3.14 were used locally.

Validation and measured limitations: [evaluation record](mixed-stack-evaluation.md).

## Install and inspect

Use the existing checkout; cloud tasks are already isolated. Do not create a
worktree unless explicitly requested. `bun install --frozen-lockfile`,
`npm run test:mixed`, `npm test -- --maxWorkers=4`, and `npx tsc --noEmit` prepare
and check the branch. The extra SDK dependency is pinned to OpenAI 7.30.1;
Anthropic and Z.ai adapters use raw HTTP as this repository already does.

Apply `supabase/migrations/202610080001_mixed_stack.sql` only to a local/staging
database after existing migrations. It adds private operation/attempt/session
ledgers, service-only transaction functions and nullable answer deduplication
metadata. It does not insert vendor prices or change existing wallet rates.
Back up staging and run through a small owned project first. PGlite tests execute
the actual new SQL and the existing reservation/settlement functions; they do
not replace testing the real Supabase roles, concurrent connections and complete
historical migration chain in staging.

## Enable a bounded text cohort

1. Supply server-side `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ZAI_API_KEY` through
   the deployment's secret manager. Never put them in `NEXT_PUBLIC_*`, prompts,
   source control or review evidence. Check existing bindings first. This cloud
   onboarding service reserves `OPENAI_*` secret-binding names; do not attempt
   to work around that rule—use the supported deployment credential mechanism.
2. Allow required production APIs: `api.openai.com`, `api.anthropic.com`,
   `api.z.ai`. Z.ai uses its commercial HTTPS endpoint, not a coding-plan URL.
3. Recheck official model docs, exact parameters, availability, region and prices.
   Run one bounded text request per target, including GLM Flash. Verify refusal,
   truncation, usage/cache fields and unknown-response behavior.
4. Set `MIXED_VERIFIED_MODELS_JSON` to a server-only JSON object keyed by
   `provider/model`. Each entry has `evidence` (non-secret reference to the smoke
   and docs record) and `price`: `version`, HTTPS `source`, ISO `verifiedAt`,
   `input`, `output`, `cacheRead`, `cacheWrite` dollars per million tokens,
   and `serviceTier: "default"`. Include `cacheWrite1h` for Claude and Luna's
   `longContext: { threshold: 272000, inputMultiplier: 2, outputMultiplier: 1.5 }`.
   Observed public rates and source links are in `src/lib/ai/usage/prices.ts`;
   these are documentation evidence, not account smoke-test evidence. Recheck
   regional/account pricing before copying them into the registry. Do not
   invent rates to satisfy the gate. Reverify overridden model capabilities.
5. Set an explicit `MIXED_MAX_OPERATION_USD`. Every logical operation reserves
   this ceiling times the existing database `ink_per_vendor_dollar` multiplier;
   it is a hold, not a fixed debit. Token exposure checks can stop a call before
   dispatch. The inherited UI cost estimates are still legacy estimates: during
   staging, review this hold separately and provision only deliberate test
   balances. Updating mixed-run customer-facing estimates is a rollout gate.
6. Keep existing `INK_METER_V2=true` and `PUBLISHER_READY=true`, add a narrow
   `PUBLISHER_READY_MIXED_ACCOUNTS` UUID list, then set
   `PUBLISHER_READY_STACK=mixed` and `PUBLISHER_READY_MIXED_ENABLED=true` in
   staging. Defaults are validated only when the route is selected.
7. Run one small book through all existing stages. Inspect `ai_attempts`, pass
   versions and exactly one `ink_usage` settlement per logical operation.
   Compare source fidelity and voice with the current route using the evaluation
   rubric. Do not promote based on fixture tests alone.

Existing runs retain their snapshot; source changes after a chapter is pinned
require review, while author answers remain separate approved correction input.
There is no automatic provider fallback. The current Anthropic adapter is the
rollback route for new runs. No verified all-OpenAI PR migration existed on the
inspected remote, so this branch does not claim to retain an unimplemented
all-OpenAI pipeline.

## Reconcile a text operation

`npm run mixed:reconcile -- OPERATION_UUID` prints only attempt/accounting
metadata, never prompts or manuscript text. Check the provider's request records
before doing anything with a paid/unknown timeout. Unknown usage is not zero.

When all dispatched work is either known rejected or has a complete persisted
result, run:

```
npm run mixed:reconcile -- OPERATION_UUID resume "Non-secret evidence of resolved failure"
```

This renews the existing wallet hold atomically, records the evidence and permits
the normal stage request to resume its pinned call checkpoints. It refuses
unresolved paid work, changed inputs and budget exceptions. No model request is
sent by the reconciliation script. Budget exceptions need an explicit operator
policy decision; do not silently increase a run's ceiling or change its model.

To abandon a diagnosed failure without a customer charge, use `abandon` with
an evidence string. It refuses unresolved vendor work, releases only the Ink
reservation and preserves vendor spend. After all pending work is reconciled,
the normal run cancel action can close the run. Never delete a ledger row to
make a retry succeed. The transcript/workflow remains private under service-only
RLS and cascades on project/run deletion.

## Uploaded audio

Independent flag `UPLOAD_TRANSCRIPTION_PROVIDER=groq` requires `GROQ_API_KEY`,
`GROQ_TRANSCRIPTION_ACCOUNTS`, `GROQ_CAPABILITY_VERIFICATION`, and a verified
`GROQ_VERIFIED_PRICE_JSON` (`version`, `source`, `verifiedAt`, `usdPerHour`).
Allow `api.groq.com`.

`GROQ_SINGLE_SPEAKER_UPLOAD_IDS` is deliberately explicit: the current upload
schema has no trustworthy diarization-requirement field. Only audited
single-speaker recordings at most 25 MB are eligible. Others keep Deepgram.
No frontend speaker-label control is removed. Segment and word timestamps are
required; language is auto-detected unless supplied, never translated to English.
The chunk normalizer preserves offsets and drops only exact duplicate timed
segments; automatic chunk encoding of large recordings is not implemented and
large recordings stay on the capable legacy route. YouTube is unchanged.

The original audio remains in R2. Groq's result and actual duration/cost are
stored before an atomic transcript+existing flat-Ink settlement. Vendor cost
uses the precise reported duration with Groq's ten-second minimum; the existing
customer duration rounding remains independent. Repeat requests
reuse the transcript. Failures preserve their result/hold for reconciliation;
do not resend ambiguous jobs. The current per-minute customer Ink price is
preserved independently of Groq's vendor cost. Groq commercial retention and
language/timestamp parity must be reviewed with real recordings before canary.

## Live Studio

Voice selection is independent of text routing. It can run for an owned existing
PR run, with a separately pinned delegated-text snapshot. It is available only
in the second interview, not in unrelated brainstorm workflows.

- Set `THEO_VOICE_PROVIDER=openai_live`, narrow `THEO_LIVE_ACCOUNTS`, and
  `THEO_LIVE_CAPABILITY_VERIFICATION` after real tests. Supply the OpenAI key,
  verified Live `THEO_LIVE_VERIFIED_PRICE_JSON` (`version`, `source`,
  `verifiedAt`, `usdPerMinute`), and verified Luna entry in the model registry.
- Set `THEO_LIVE_BACKEND_MAX_USD` separately for delegated text. Normal planning
  uses Luna low effort. The explicit server switch
  `THEO_LIVE_DIFFICULT_PLANNING=true` pins Sonnet high effort for a difficult
  session and additionally requires its credential and verified registry entry.
- Approve an actual conversion from the **existing** character entitlement to
  Live seconds, then set `ink_meter_settings.live_chars_per_second` in staging.
  No conversion is assumed or inserted by the migration. Reservations debit
  the existing monthly/top-up voice allowance up front and refund unused
  amounts once on confirmed close. They cannot also spend the same characters
  on legacy TTS. No 90-minute or 50,000-word entitlement is granted.
- Deploy `npm run live:worker` on a supervised persistent Node 24 host with DB
  credentials, HTTPS API access and WebSocket access to `api.openai.com`. It must
  restart automatically and have an external liveness monitor. Proxy and CA
  trust are retained (`NODE_USE_ENV_PROXY=1` for HTTP, HTTPS proxy agent for WS).
  It is **not** a Vercel function. The default listener is loopback port 3003.
- Set a random secret `THEO_LIVE_SUPERVISOR_TOKEN` of at least 32 characters on
  both app and worker, and an HTTPS `THEO_LIVE_SUPERVISOR_URL` (loopback HTTP is
  allowed only for local development). Protect the service from public access.
- `THEO_LIVE_MAX_SECONDS` defaults to 300, with a hard 5,400-second config bound.
  The server watches elapsed time, client heartbeat (30 seconds) and speech
  inactivity (90 seconds). Browser pause, backgrounding and End request a real
  `session.close`; a muted mic is never considered a billing pause.
- The trusted sideband persists user/Theo transcript deltas with event-ID
  deduplication. The browser cannot set model instructions or delegation via
  its restricted data channel. Native author text is saved as an answer on
  confirmed close; it is not sent through full transcription again. The question
  remains available for typed correction/follow-up; the app does not assert
  that every spoken answer resolves it.
- Unknown final duration, lost sideband, failed persistence and interrupted
  creation retain a reconciliation hold and block concurrent sessions. Restart
  recovery attaches to a known vendor session and requests closure; it does
  not open a replacement. A create timeout before its vendor ID is known needs
  provider-side investigation. A complete supervisor-host outage cannot enforce
  a shorter vendor session lifetime by itself: fault-test the deployed monitor
  and recovery path before offering Live. SDK `expires_at` is not a configurable
  session-duration cap, and this implementation does not pretend it is.
- Only one voice component is mounted. Typed input remains available on failure.
  Resume starts a new billable session with persisted author answers. iOS/Safari
  microphone permission, playback unlock, interruption, tab closure, host crash
  and reattachment need real browser/vendor testing; they are not verified here.

## Rollback

Turn off new mixed routing and set voice/transcription back to `current`. Do not
rewrite existing snapshots. Complete or reconcile in-flight text operations;
keep the Live supervisor up until every vendor session has confirmed close.
Do not drop additive tables or refund a reservation twice. Inspect unknown
attempts and orphan sessions before stopping the worker. Returning to legacy
routes never auto-converts existing balances or Stripe entitlements.
