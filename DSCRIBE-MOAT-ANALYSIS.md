# D.Scribe Moat Analysis — from "Claude wrapper" to proprietary tech
*Loop iteration 1 — 2026-07-12. Architecture map + first defensibility read.*

## What the tech actually is today (honest read)

Pipeline: audio upload (R2) → Deepgram transcription → word-chunker (3000w, sentence-aware overlap) →
key-points extraction (Haiku, worker microservice :3002) → voice profile (one-shot JSON linguistic
fingerprint) → mind map → outline → chapter generation (Sonnet, streamed, voice profile + humanizer
rules + narrative threading + enrichment quotes) → rewrite → coherence check → TTS → export.
Ink = token-metered credits with pre-flight floors. Supabase (15 migrations), Stripe, Sentry.

Kyle's diagnosis is correct: every unit of "intelligence" is a rented Claude call with a good prompt.
The prompts (HUMANIZER_RULES ban-list, first-person POV lock, blended/featured key points, quote
spacing rules) are genuinely good prompt IP — and 100% copyable by anyone who sees the output long
enough. Nothing today gets better with usage, and nothing uses data a competitor can't get.

**Existing assets to build on** (not starting from zero):
- `voice_profile` per user — a real data asset, currently static
- Audio + Deepgram — richer signal than the text competitors touch
- HUMANIZER_RULES — a ban-list one flip away from being a *scoring engine*
- Ink metering — per-op usage data already flowing

## The four plays (ranked)

### 1. AI-Tell Score — fastest, marketing gold (build first)
Flip HUMANIZER_RULES from prompt-side plea into an output-side **linter + score**:
- Deterministic layer: em-dash count, banned-phrase hits, negation-flip regex, rhetorical-question
  transitions, paragraph-shape uniformity, sentence-length variance.
- Statistical layer: compare generated chapter's sentence-length/rhythm distribution against the
  author's REAL distribution computed from their transcripts (we have the corpus; competitors don't).
- Surface it in the UI: "Reads-human score: 96 · Voice-match: 91." Auto-regenerate sections that fail.
- Proprietary because the baseline is per-author, not generic. Demoable in a screenshot. Cheap:
  mostly regex + stats, one Haiku pass for the fuzzy checks.

### 2. Editorial Memory — the true moat (build second)
Today the voice profile is a one-shot sample analysis. Make it **learn from every edit**:
- Diff what the user edits vs what we generated → classify the deltas (word swaps, cut phrases,
  rhythm changes) → fold into a per-user style delta store → inject into every future generation.
- Result: chapter 10 needs half the editing chapter 1 did, and that improvement lives in OUR db.
  Switching tools = starting over. That's the wrapper→moat conversion, and no prompt leak can copy it.
- Infra: an edits table + a nightly Haiku distillation job. pgvector optional at this stage.

### 3. Prosody-weighted extraction — the "listens, doesn't read" differentiator
Deepgram already returns word-level timestamps/confidence; we throw them away.
- Weight key-point relevance by DELIVERY: slowed pace, repetition, pause-before-punchline = the
  speaker's own emphasis map. relevance_score is currently hardcoded 0.8 — replace it with this.
- Detect audience events (laughter/applause) as chapter anchors for live recordings.
- Tagline writes itself: "Other tools read your transcript. D.Scribe listens to your delivery."
  Text-paste competitors structurally cannot follow.

### 4. Back-catalog brain — retention lock for the ICP
Speakers/pastors have years of material. Embed the whole corpus (pgvector on existing Supabase):
- Cross-reference new chapters against everything they've ever said: "you told this story in 2019
  with a better ending — here it is." Enrichment quotes from their OWN corpus instead of generic ones.
- Lock-in compounds with every upload; the corpus index is non-portable.

## Housekeeping found on the way
- Model drift: `claude-lite.ts` = sonnet-4-6, `claude-stream.ts` + worker = sonnet-4-20250514
  (two different pins, both a generation behind current Sonnet 5). Unify + re-bench cost/quality.
- Worker CORS is `*` on a service-role-key process (localhost-bound, but still sloppy).
- `relevance_score: 0.8` hardcoded — play #3 fixes this for real.

---

# Iteration 2 — 2026-07-12: edit-capture feasibility, schema, competitor scan

## Editorial Memory substrate ALREADY EXISTS (big head start)
- `chapter_contents` is **versioned**: unique(chapter_id, version), `generation_params` jsonb per
  version. `chapters.status` already distinguishes 'generated' vs 'edited'.
- So play #2 needs NO schema surgery for v1: diff the last generated version against the latest
  edited version per chapter → distill deltas (nightly Haiku job) → per-user style-delta store
  (one new table) → inject into generateSystem(). The hard part was the substrate; it's built.
- Frontend: TipTapEditor already emits full-text onChange + selection events; MagicEditBubble and
  RewritePromptBar are existing UI surfaces where edit INTENT is explicitly expressed — capture the
  prompt+before+after there and you get labeled training pairs for free.

## Competitor scan (web, 2026-07-12)
**Sermon lane** — Pulpit AI, Pastors.ai, Sermon Clips: sermon → 20 repurposed content pieces
(clips, devotionals, posts). Verble: sermon WRITING + slides. Nobody does voice-faithful BOOKS.
D.Scribe's lane is clear there.

**Ghostwriting lane** — closer heat:
- Voicepal: voice → drafts with style presets (creator ICP, mobile).
- ahmeego "Ghost Writer": voice fingerprint from writing samples + validates output against
  GPTZero/Pangram/Originality.ai before delivery.
- River: standalone "voice match score" analyzer — but it's an agency tool for HUMAN ghostwriters,
  not integrated into a generation loop.
- BookAutoAI: "passes AI detection, KDP-ready."

**Implication for play #1**: "passes AI detectors" is already a commodity claim and an arms race —
don't market that. Reframe as **Voice-Match Score**: measured against the author's OWN spoken corpus
(sentence-length distribution, rhythm, signature phrases from their transcripts). Per-author baseline
from real speech is something none of them have — their samples are pasted text.

**Prosody check**: prosody-weighted extraction exists only in academic work (SRI, arxiv) and
voice-agent TTS tuning. NO consumer content/book product ships delivery-weighted key-point
extraction. Play #3 is genuine whitespace and moves UP the ranking as the marketing spearhead.

## Revised ranking after iteration 2
1. **Voice-Match Score** (reframed play #1) — fastest, now with a defensible framing vs ahmeego/River.
2. **Prosody extraction** — promoted: it's the claim nobody can copy-paste ("we listen to your
   delivery"), and Deepgram timestamps are already paid for.
3. **Editorial Memory** — still the retention moat; substrate already in the DB, cheaper than estimated.
4. **Back-catalog brain** — unchanged, pairs with #3 (same corpus infra).

---

# Iteration 3 (final) — 2026-07-12: Deepgram audit, effort estimates, build order

## Deepgram/audio audit
- Utterance-level timestamps (start/end/text/speaker) ARE persisted in `transcripts.segments` jsonb.
  Word-level timestamps come back from nova-3 but are DISCARDED in `transcribeAudio()`.
- Original audio is RETAINED in R2 (deleted only on project/account deletion). Back-catalog
  re-transcription for word-level data is possible anytime: nova-3 ≈ $0.26/audio-hour.
- Consequence: **prosody v1 needs no re-transcription at all** — pace (words/sec per utterance vs
  the speaker's median) + inter-utterance pauses are computable TODAY from persisted segments.
  Word-level emphasis = one transcribe-route change (persist `words`), new uploads only.

## Effort estimates (Answer builds, Kyle approves)
| Play | Scope | Dev-days | Infra cost |
|------|-------|----------|-----------|
| B. Prosody v1 | pace/pause emphasis from existing segments → replaces hardcoded relevance_score 0.8 in key-points; word-persist for new uploads | 2-3 | ~$0 |
| A. Voice-Match Score | linter lib from HUMANIZER rules + per-author baseline stats from transcripts + UI badge + regen hook | 3-5 | ~$0 (regex+stats, optional Haiku pennies) |
| C. Editorial Memory | style-delta table + generated-vs-edited diff job + Haiku distillation + inject into generateSystem + MagicEdit/Rewrite intent capture | 4-6 | Haiku pennies/user/night |
| D. Back-catalog brain | pgvector + embed corpus + own-corpus enrichment + "you said this in 2019" | 5-8 | embeddings ~cents/user |

## Recommended build order
**Week 1: B then A** (~5-6 days combined). B is the cheapest genuine whitespace in the market and
instantly upgrades extraction quality; A is the visible badge that markets both ("Voice-match: 91").
**Week 2: C.** The retention moat. KPI = edit-distance per chapter trending down; that number
becomes marketing ("chapter 10 needs 60% fewer edits than chapter 1").
**Then D**, riding the same corpus infra, when A-C are live.

Total: ~2-3 weeks to stop being a wrapper. The proprietary claim rests on three per-user assets no
competitor can export or copy from output: spoken-voice baseline, style deltas, corpus index.

## Housekeeping (do during week 1)
- Unify model pins (claude-lite sonnet-4-6 / claude-stream + worker sonnet-4-20250514) → current
  Sonnet 5, re-bench Ink costs.
- Worker CORS `*` on a service-role process → restrict.

**STATUS: analysis complete. Loop closed 2026-07-12. Awaiting Kyle's pick to start building.**
