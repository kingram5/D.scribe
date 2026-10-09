# Mixed stack validation record

Tested on the feature branch against master `df34467efc07f13d26f3e67574e747d53e598669`,
using Node 24.19.0 and Bun 1.3.14. Production routing remains off.

## Reproducible checks

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Pass; both dependency lockfiles updated, Bun frozen install verified. |
| `npm run test:mixed` | 67 passed across provider/usage, PostgreSQL transaction and pipeline/export tests. |
| `npm test -- --maxWorkers=4` | 633 passed, 1 existing expected failure. |
| `npx tsc --noEmit` | Pass. |
| `npx eslint` on all changed/new TypeScript files | Pass. |
| `npm run lint` | Existing repository failures: 18 errors, 34 warnings, including `.heycatch` CommonJS and existing React hooks issues. Not changed in this branch. |
| `npm run build` with the existing CI placeholder environment | Pass; 93 pages generated. No production credentials used. |
| `git diff --check` | Pass. |

Build environment matches `.github/workflows/ci.yml`: placeholder public
Supabase URL/anon key, service-role key, Stripe key/webhook and Starter/Pro/Premium
price IDs. These permit route generation, not real database or payment access.
Expected placeholder fetch and existing metadata-base warnings are not live
integration evidence. No remote migration or production configuration was applied.

## What the tests establish

- Exact provider payload boundaries, incremental SSE/Unicode handling, strict
  response shape, refusal/truncation handling, and raw usage retained on failure.
- OpenAI cache reads/writes and reasoning are not counted twice; Claude cache
  input is disjoint, TTL prices differ, and long-context pricing is explicit.
  Groq vendor duration has its documented minimum independently of customer Ink.
- A completed call replays without another request; only rejected 429s retry,
  at most three times. Unknown paid work, changed inputs, cancellation and budget
  exceptions cannot silently dispatch another paid call.
- The actual new SQL runs in PGlite alongside existing reservation/settlement
  and PR migrations. Tests exercise ownership, competing holds, exactly-once
  completion, stale-version rejection and rollback on failed settlement.
- Live reserves existing voice characters, requires an approved conversion,
  rejects a second active session, retains an orphan hold, and refunds once
  after cumulative vendor duration is known. Only author speech becomes source.
- Source IDs/timestamps/speakers survive normalization; citations must identify
  real source and verbatim quotations. Premium review triggers independently of
  audit sampling. These checks do not prove semantic entailment or factual truth.
- Twenty small fictional excerpts exercise the existing draft/edit/revise/final
  contracts and DOCX exporter. They include memoir, expert nonfiction, sparse
  evidence, fragmented chronology, multiple speakers, emotional material and
  author corrections. Model responses are explicit fixtures, not generated
  evaluations. Two additional tests check Sonnet-only final repair and quotation
  protection.

PGlite is a real PostgreSQL engine in a single process, not a production
Supabase deployment or a multi-connection concurrency/load test. Apply the full
migration history to staging and verify real roles, locks and rollback there.

## Quality and delivery cost: not yet measured

No authorized representative customer excerpt corpus, provider credentials,
real recordings or Live browser session was available. The 20 synthetic cases
are contract coverage, not 20 quality comparisons. No all-OpenAI Publisher-Ready
baseline was found; the separate Live PR is not that baseline.

| Measure | Evidence available |
| --- | --- |
| Source fidelity, chronology, attribution and voice quality | Fixture invariants only; human comparison pending. |
| Real input/output/cache/reasoning tokens and vendor invoice | None; normalization uses synthetic usage fixtures. |
| Model latency, retry/repair rate, premium token share | Not measured. Audit percentage is a configuration, not measured escalation. |
| Uploaded multilingual/word-timestamp accuracy | Mock response contract only; real recording comparison pending. |
| Live interruption, iOS/Safari, tab closure and host outage | Lifecycle logic/SQL tests only; real browser/vendor fault tests pending. |
| 50,000 words + 90 Live minutes + 150 upload minutes | Original $9.63 scenario remains a forecast, not an invoice, entitlement or hard cap. |

Before promotion, select at least 20 authorized representative excerpts. Run
small bounded samples on the current route and this branch with identical source,
voice settings and targets. Use any all-OpenAI baseline only after identifying
its actual implementation. Blind-review invention, source attribution,
chronology, author voice, quotation integrity, useful questions and unnecessary
rewrites. Reject fabricated facts/quotes even if average rubric scores improve.
Record route/price snapshot, request IDs, tokens/cache/reasoning, elapsed time,
repairs, escalations, review outcomes and measured vendor cost per case. Keep
manuscripts and recordings out of logs and PR evidence.

## Remaining rollout decisions

See [operator instructions](mixed-stack-rollout.md) and [call map](mixed-stack-call-map.md).
The production gates are real provider/account smoke tests, the full staging
migration, reviewed excerpt/audio/browser quality, and supervised Live fault
recovery. Also calibrate the inherited customer-facing run estimates for the
new routes and approve the conversion from existing voice characters to seconds.
A future word-based customer meter or new minutes entitlement requires its own
pricing/migration decision; neither is enabled here. The pre-PR interactive
Analysis job system and legacy large/multispeaker transcription remain unchanged.

## Edge-case follow-up (2026-10-09)

Seven additional cases test contradictory cache TTL totals, non-finite/negative
word timestamps, invalid Live timing and interrupted paid-result persistence.
Five cases failed before fixes, exposing three validation defects. Cache totals
now require a consistent breakdown, raw words are validated before filtering,
and invalid Live timing requests closure. Paid-result recovery already preserved
its result and cost without redispatch.

After fixes: 74 mixed-stack tests and 640 full-suite tests pass, with the same
one expected failure. TypeScript and changed-file ESLint pass. These are local
contract tests; real vendor/browser failure injection remains a staging gate.
