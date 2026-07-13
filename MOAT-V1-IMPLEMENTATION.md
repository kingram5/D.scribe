# Moat v1 — Implementation Plan (feature/moat-v1)
*Target: plays 1-3 built by 2026-07-13. Kyle-approved 2026-07-12.*

## Play B — Prosody-weighted extraction
1. `src/lib/prosody.ts` — pure functions:
   - per-utterance pace (words/sec) vs speaker median, pause-before-utterance
   - emphasis score 0-1 per utterance; per-word emphasis map aligned to full_text word indices
     (chunker slices the same whitespace word array, so chunk ranges map 1:1)
2. Worker (`worker/analyze-worker.js`): load `segments` alongside `full_text`; per chunk inject a
   "delivery analysis" block (top emphasized moments) into the key-points prompt; set
   `relevance_score` from emphasis overlap with supporting quotes (replaces hardcoded 0.8).
3. Transcribe route: persist word-level timings on new uploads (`TranscriptSegment.words?`).

## Play A — Voice-Match Score
1. `src/lib/voice-match.ts`:
   - `lintAITells(text)` — banned-phrase/em-dash/negation-flip/rhetorical-transition densities →
     reads-human score 0-100 (single source of truth for the banned list, shared with prompts)
   - `buildVoiceBaseline(transcripts, voiceProfile)` — sentence-length distribution, contraction
     rate, signature phrases from the author's REAL speech
   - `voiceMatchScore(text, baseline)` → 0-100 + breakdown
2. `src/app/api/voice-match/route.ts` — POST {chapter_id}: compute both scores on latest content,
   cache into `chapter_contents.generation_params.scores`, return breakdown.
3. `src/components/editor/VoiceMatchBadge.tsx` — on-demand score chip in the editor.

## Play C — Editorial Memory
1. Migration `016_editorial_memory.sql`: `edit_events` (magic_edit / rewrite_bar / manual_save
   intent pairs), `style_deltas` (generated-vs-edited diff summaries), `user_style_memory`
   (distilled per-user memory jsonb). RLS on all three.
2. Capture: chapter-content PATCH computes sentence-level diff vs last generated version →
   `style_deltas`; rewrite route logs instruction+before+after → `edit_events`.
3. Distill: `src/app/api/voice-memory/route.ts` — Haiku over recent deltas/events → upsert
   `user_style_memory.memory` {avoid, prefer, phrase_swaps, notes}.
4. Inject: `generateSystem()` gains optional styleMemory section; generate route loads it.

## Deliberately NOT in v1
Model-pin unification (separate PR), back-catalog brain (play D), nightly distill scheduler
(on-demand + post-save threshold for now), UI for browsing edit history.

## Verification gates
- `bun run typecheck` + existing vitest suite green per play
- Prosody: unit test on synthetic segments (slow+pause utterance outranks fast one)
- Voice-match: unit test — AI-slop sample scores < clean human sample
- Editorial memory: PATCH inserts delta row; generateSystem includes memory block
- Deploy: preview/test env only (dscribe.kingram.work), never straight to prod
