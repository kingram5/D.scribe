# Mixed-provider call map

Branch: `feat/publisher-ready-mixed-model-stack`. Base: current remote master
`df34467efc07f13d26f3e67574e747d53e598669` (2026-10-08 inspection).

Remote heads were inspected. The separate `cursor/gpt-live-studio-a81b` head
`b24df40f92597a8f2aca57bd7dd44da5383d9e3c` contains Live WebRTC work and a
`gpt-5.6-terra` Responses backend, but no Publisher-Ready OpenAI migration. Its
client-reported Live billing does not satisfy this assignment's supervision
requirements. It was inspected, not merged or overwritten. No dependency PR is
required. GitHub confirms that work is open as [PR #43](https://github.com/kingram5/D.scribe/pull/43). No all-OpenAI Publisher-Ready migration was found in the inspected remote heads or open PRs.

## Actual stages and calls

The existing seven-stage navigation and the separately flagged Publisher-Ready
v2 navigation remain unchanged. In this checkout v2 already has eight numbered
stages plus Export; the handoff's seven conceptual labels are not additional
jobs. `generate/page.tsx` starts the draft-only PR run. Editor Review invokes
`edit`; Interview covers author answers; Final Draft invokes `revise`/`final`.
There is only one full draft generation. Revisions use focused patches.

| File / function | Existing route | New selected workload | Contract and persistence |
| --- | --- | --- | --- |
| `api/transcribe/POST` | Deepgram nova-3 | Groq whisper-large-v3-turbo for explicitly audited single-speaker upload IDs | Same transcript segments, word timestamps, word/speaker counts. Original audio retained. Large/unknown/multispeaker uploads stay on Deepgram. |
| `api/audio/youtube`, `api/analyze/*`, `api/outline`, legacy `api/generate` | Existing Supadata/Claude flows | Unchanged | Upstream ingestion, interactive Analysis and outline UI remain intact. This branch does not globally replace Claude model strings. |
| `publisher-ready/mixed.ts: mixedStep(draft)` | No separate PR source organization/analysis existed | Luna organize, GLM analysis of relevant chapter source | Immutable source ledger, organization IDs and evidence-linked findings are saved as operation results. These are chapter-scoped supporting calls, not additional manuscript generations. |
| `core.ts: coreDraft` beat plan | Sonnet 5 low | GLM-5.3-Flash low | Existing beat schema, with runtime validation and verbatim source-quote checks. |
| `core.ts: coreDraft` prose | Sonnet 5 medium | Sonnet 5.5 medium | Existing audience/voice/style/speaker prompts and sanitization; same streaming progress channel and chapter content contract. |
| `core.ts: coreEdit` | Fable 5.1 high | GLM-5.3 high | Existing scores, craft notes and author questions, plus evidence-linked structured issues. |
| `mixed.ts: mixedExecutor(edit)` | No independent premium review | Opus 5.5 high | Mandatory issue triggers and deterministic chapter audit selection. Both reviewers' notes/questions survive. Unresolved issues become author questions. |
| `interview.ts: coveredByEarlierAnswer` | Sonnet 5 low | Luna low | Existing coverage boolean/index schema; deduplicated logical operation by pending question and answer IDs. |
| `interview.ts: submitAnswer` | Sonnet 5 low | Luna low | Persist answer before asking one follow-up; repeated mixed answer submissions share an answer/operation identity. |
| `core.ts: coreRevise` | Opus 5.5 high | Sonnet 5.5 medium | Mixed adapter requests unique find/replace patches and reconstructs the existing `{chapter, change_log}` contract. Quotes and untouched text are preserved by code. |
| `mixed.ts: mixedFinal` | Sonnet 5 generated final edits | Luna findings, optional Sonnet repair | Luna never supplies manuscript replacements. Sonnet patches pass existing quotation-preservation logic. Neighboring chapter text is included for continuity. |
| `worker/mixed-live.ts` | Legacy TTS + Deepgram utterances | GPT-Live WebRTC, client delegation to Luna | Browser receives SDP only, permanent key stays server-side. Trusted sideband persists native transcript events and cumulative vendor duration. Explicit difficult-planning configuration uses Sonnet. |
| `lib/export/*`, `api/export/*` | Application DOCX/PDF/Drive code | Unchanged, no model call | Existing latest-chapter and ownership contracts. Synthetic fixtures exercise the existing DOCX generator. |

The pre-PR interactive Analysis flow remains on its current provider. The new
source organization/analysis calls live inside mixed PR drafting and examine its
selected evidence. Moving the entire pre-PR analysis job system would require a
separate project-level run/rollback design; do not describe that older UI's calls
as migrated by this branch.

## Billing and recovery seams

Current PR calls use `recordInkUsage` with the existing v2 cost-plus multiplier.
Mixed calls never pass arbitrary model strings through its unknown-model price
fallback. Instead they use the same `reserve_ink` and
`settle_ink_reservation_v2` wallet primitives with an explicit verified cost.
No Stripe prices, plan allotments, top-ups or entitlements change.

`pr_runs.models.mixed` pins models, provider-specific effort, prices, verification
reference, audit percentage, prompt version and budget. `ai_operations` pins
chapter input, source version and input hash. `ai_attempts` records every dispatch,
provider request ID, raw usage, actual spend and result. A completed call is a
checkpoint. Route flags affect new runs only. Duplicate stage completion replays
its committed result without a second version or debit.

Manuscript version, editor questions/notes, pass record and customer settlement
commit in one database transaction. A stale editor version, missing usage,
budget exception or settlement error leaves the manuscript untouched. Customer
charges exclude failed platform attempts; business spend remains recorded.
Ambiguous network failures are never automatically repeated. Only rejected
429s have automatic bounded backoff (three total attempts). No automatic
provider fallback or manuscript-level repair loop is enabled.

Reconciliation is explicit, audited and service-only. See the rollout guide.
No second wallet or production manuscript-word meter is introduced. The
operation settlement is the policy seam for a later separately approved meter.

## External API evidence

Official registry artifacts inspected with normal checksum/TLS verification:

- OpenAI SDK 7.30.1: `gpt-6-luna`, `gpt-live-1`, `/live`, WebRTC SDP,
  `client.data_channel`, client delegation, trusted sideband `session.close`,
  transcript deltas and cumulative `usage.seconds`.
- Anthropic SDK obtained from the official npm package: Sonnet 5.5/Opus 5.5,
  adaptive thinking and `output_config`; no custom sampling in the adapter.
- Groq SDK from the official npm package: transcription (not translation),
  Whisper Turbo, verbose JSON, segment/word timestamps and optional language.

Official documentation was also fetched on 2026-10-08 after network access
became available:

- [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): model,
  effort and standard/cache pricing, including the >272k-input pricing tier.
- [OpenAI Live](https://developers.openai.com/api/docs/guides/live): WebRTC,
  client delegation, server-side closure and cumulative duration accounting.
- [Claude models](https://platform.claude.com/docs/en/models/sonnet-5-5/overview)
  and [pricing](https://platform.claude.com/docs/en/about-claude/pricing): adaptive
  thinking, output configuration, cache TTL prices and standard long-context rates.
- [Z.ai chat completions](https://docs.z.ai/api-reference/llm/chat-completion)
  and [pricing](https://docs.z.ai/guides/overview/pricing): commercial endpoint,
  GLM-5.3/Flash IDs, low/high/max efforts and cached-input usage. The adapter
  does not send OpenAI-only `stream_options` to Z.ai.
- [Groq speech-to-text](https://console.groq.com/docs/speech-to-text): Turbo,
  multilingual transcription, segment/word timestamps, $0.04/audio hour and
  a minimum billable 10 seconds per request.

`src/lib/ai/usage/prices.ts` records the observed public text prices with sources;
it does not activate routing or prove account access. Live's observed public
rate is $0.05/minute, billed per second, separate from delegated text. Reverify
prices, region and account access with bounded smoke calls before activation.
No real provider request, recording, or vendor invoice was available for this
implementation. Z.ai cached storage is advertised as limited-time free and must
be rechecked when creating a price version. No tools or regional endpoints are
requested by the adapters. Unknown usage remains unresolved, never free.
