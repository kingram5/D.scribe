# D.Scribe Adjustments — Research & Brainstorm (2026-05-26)

15 items from Kyle. Each: **root cause** (grounded in code) → **proposed fix** → **decision needed?**

---

## ✅ DECISIONS LOCKED (Kyle, 2026-05-27)

| # | Decision |
|---|----------|
| 1 | Fix structure CSS (scroll + footer clearance). No-brainer. |
| 2 | Analysis pre-outline → **full-page dynamic loading animation** ("manuscript assembling" — themes/key points materializing). Spec a concept, design agent to mock options. |
| 3 | Remove Concept Map / mind map tab from /analysis entirely. |
| 4 | **Keep** torn-paper look — move `#rough-edge` filter to a background layer so text stays sharp. |
| 5 | Surface the **existing** chapter summary on notes + lightly sharpen the **outline prompt** to read reader-facing. ~$0 Ink (no separate call). NO dedicated blurb generation. |
| 6 | Surface enrich errors in UI (both pages) + harden API. No-brainer. |
| 7 | Fix TipTap caret jump (skip setContent on echo of own typing). No-brainer. |
| 8 | First-person POV rule + sanitizer pass + fix foreword "speaker's voice" wording. No-brainer. |
| 9 | Foreword → **500-700 words** (both implementations). No-brainer. |
| 10 | Expand banned AI-ism variants ("that's not X, it's Y") in prompt + sanitizer detection. |
| 11 | Scripture for **Christian Living + Faith Community**. Add a **translation picker in /structure**, shown only for those audiences, stored on project. Scripture refs must carry book + chapter:verse. |
| 12 | (a) **Dynamic max quotes by chapter length** (~1 per 700-800 words, capped: 1k→1-2, 3k→3-4), decided in the enrichment step. (b) **Distribution rule** in generate prompt: spread quotes across the chapter, NEVER stack consecutive quote paragraphs, max one per section. Keep "verbatim if used." |
| 13 | **temp = creativeFreedom × 0.0075** (ratio 1:0.75 → 0%→0.0, 50%→0.375, 100%→0.75). Revised up from 0.005 — that ceiling (0.5) was too subtle. ALSO make prompt instructions granular across the 5 UI tiers (temp is a weak lever; instruction text moves creativity more). |
| 14 | Slider persistence → **DB column** `projects.creative_freedom` (cross-device). New migration + load/save. |
| 15 | **"X already written — regenerate?" confirm popup** before any overwrite. Generate-All only writes non-generated chapters; foreword skips if exists unless confirmed; retire/guard legacy bulk worker. ALSO: **coherence pass must re-run across all chapters after any Regenerate or Generate-All retry** (currently only runs after a clean full run, never after single regenerate). |

**Suggested build order:** data-loss (#15, #14, #6) → quick UI (#1, #7, #4) → prompt batch (#8, #9, #10, #11, #12, #13) → UX depth (#5, #2, #3).

---

## A. UI / CSS (4 items)

### 1. /structure — "Set Chapters/Words" button cut off by footer ribbon + "Structure Setup" header cut off at top
**Root cause:** `structure/page.tsx:127` — wrapper is `display:flex; align-items:center; justify-content:center; overflow:hidden`. The card is vertically centered but taller than the viewport (3 stepper rows + 16 wrapping audience pills + total + button). Centering pushes the top (header) above the fold and the bottom (button) behind the PageShell footer. `overflow:hidden` means you can't scroll to either. Mobile media query already fixes it (`overflow-y:auto; align-items:flex-start`) — desktop doesn't.
**Fix:** Change desktop wrapper to `align-items:flex-start; overflow-y:auto` with vertical padding (e.g. `padding:48px 0`), and add `padding-bottom` clearance for the footer ribbon. One-line-ish CSS change.
**Decision:** none. Clear fix.

### 4. /outline — sticky-note text fuzzy / hard to read
**Root cause:** `ChapterNode.tsx:60` — `filter:"url(#rough-edge)"` (an SVG turbulence/displacement filter for the torn-paper look) is applied to the **entire note div, including the text**. SVG filters rasterize + displace the element, which blurs text. The `'Kalam', cursive` font makes it worse but the filter is the real culprit.
**Fix options:**
- (a) Move `#rough-edge` to a separate absolutely-positioned background layer behind the content, leave text on a clean layer. Keeps the aesthetic, sharp text. **My pick.**
- (b) Drop the filter entirely → sharpest, but loses the hand-torn vibe.
- (c) Keep filter but bump text weight/contrast → band-aid, still soft.
**Decision:** keep the torn-paper look or not? I'd do (a).

### 5. /outline — make it deliver the "AHA / my thoughts are ORGANIZED" feeling; add a per-chapter blurb like the /generate synopsis
**Root cause:** `ChapterNode.tsx` only renders chapter number + editable title + key-point count. It never renders `chapter.summary` — even though that field exists and is already used in /generate. `onEdit` even accepts a "summary" field that's currently unreachable.
**Fix:** Surface `chapter.summary` as a 1-2 line blurb under the title on each sticky note (editable on click, truncate w/ expand). Data's already there — pure presentation. Bigger "AHA": consider a brief auto-generated "what this chapter does for the reader" line.
**Decision:** just show existing summary, or generate a punchier reader-facing blurb? (Latter = small prompt + Ink cost.)

### 7. /editor — backspace sends cursor to the bottom of the page
**Root cause (found it):** `TipTapEditor.tsx:120-129`. On every keystroke: `onUpdate → onChange(text) → parent state → content prop changes → sync effect fires → editor.commands.setContent(...)`. `setContent` rebuilds the doc and **drops the cursor to doc end + scrolls there**. When you type at the end you don't notice; when you backspace mid-document your caret gets yanked to the bottom. That's the bug exactly.
**Fix:** In the sync effect, skip `setContent` when the incoming `content` equals the editor's current text (`htmlToText(editor)`) — i.e. only re-set on genuine external changes (chapter switch, rewrite-stream injection), never on the echo of the user's own typing.
**Decision:** none. Confirmed root cause, clean fix.

---

## B. Generation Quality / Prompts (6 items)

### 8. Cut all "the author" / "the speaker" third-person references — book is first-person, in author's voice
**Root cause:** No rule forbids third-person self-reference in the prose. Worse, the **foreword prompt literally says** "authentic to the speaker's voice" (`route.ts:64` + `generate.ts:57`), nudging the model toward third person. The chapter system prompt says "write in the author's voice" but never says "never refer to the author/speaker in third person."
**Fix:** (1) Add a hard first-person POV rule to `HUMANIZER_RULES`/system: "Write entirely in first person as the author. NEVER refer to 'the author', 'the speaker', 'the writer', or narrate about them in third person." (2) Add a `sanitize-output.ts` pass catching "the author/speaker/writer" + flag for review. (3) Fix the foreword prompt wording.
**Decision:** none. Clear.

### 9. Forewords too long → lock to 500-700 words
**Root cause:** Hardcoded `~1500 words` in **two places** (`route.ts:64` inline foreword + `generate.ts:59` worker) and `target_word_count:1500`.
**Fix:** Change target to "500-700 words" in both, set `target_word_count` accordingly. (Note: there are two near-duplicate foreword implementations — worth consolidating so future changes hit one place.)
**Decision:** none.

### 10. Still too many AI-isms — "That's not X, it's Y" / "This isn't about X, it's about Y"
**Root cause:** `HUMANIZER_RULES` bans "Not X. Rather, Y." but **not** the contracted conversational variants ("That's not X, it's Y", "This isn't about X — it's about Y"). And `sanitize-output.ts` doesn't catch this pattern at all — it's prompt-only, unenforced.
**Fix:** (1) Expand the banned-pattern list with explicit variants. (2) Add a regex detector in the sanitizer to flag/soften the "not X, it's Y" antithesis structure. Note: regex can't elegantly rewrite these, so the main lever is a stronger prompt rule + maybe a light post-gen flagging pass.
**Decision:** hard-strip (risky, can mangle) vs flag-for-review vs prompt-only-but-stronger. My pick: stronger prompt + sanitizer detection that only rewrites high-confidence cases.

### 11. Scriptural quotations need chapter & verse attribution
**Root cause:** `enrich.ts` allows scripture refs only for "Faith Community" audience and never requires book/chapter:verse format. The generate prompt says nothing about scripture citation.
**Fix:** (1) In `enrich.ts`, require scripture items to include full citation (e.g. "John 3:16", translation if known) and put it in `source_title`. (2) Add a generate-prompt rule: any scripture quoted must carry book + chapter:verse inline. (3) Consider enabling scripture for "Christian Living" too, not just "Faith Community."
**Decision:** which audiences get scripture? Preferred citation style (e.g. NIV vs KJV, or leave translation-agnostic)?

### 12. Enrichment quotes feel heavy-handed / "rattling off quotes and explanations"
**Root cause:** `generate.ts:104` — "**REQUIRED ENRICHMENT QUOTES — You MUST include EVERY one... VERBATIM... all N must appear**", reinforced by recent commit "Require enrichment quotes to appear verbatim." That force = the model dumps every quote with a lead-in + explanation, mechanically. Default enrich returns 5-8 items, all `included:true`.
**Fix:** Soften the directive: "Weave in AT MOST 1-2 of these where they genuinely fit; integrate naturally, no '[Author] once said' formula; skip any that feel forced." Reduce default count, and/or default fewer to `included:true`. Trade-off: the verbatim requirement was added on purpose (quotes were being paraphrased/fabricated) — softening reintroduces some drift risk, so keep "if used, must be verbatim + attributed" but make *usage* optional.
**Decision:** target quote density per chapter (0-1? 1-2?) and keep the verbatim-if-used guard?

### 13a. Verify Creative Freedom actually affects generations
**Root cause:** It IS wired end-to-end (`generate.ts:160-178 → prompt:129`), so it's not a no-op — but the effect is weak: `creativeFreedomToInstruction` has only **3 buckets** (≤30 / ≤70 / >70) while the UI shows **5 descriptive tiers**. Sliding anywhere in 31-70 changes the instruction *not at all* and temp only marginally (`0.3 + freedom/100*0.6`, so 40→60 is just 0.54→0.66). That's why you see ~no difference.
**Fix:** Make instructions granular (match the 5 UI tiers) and widen the behavioral spread (stronger verbs at the extremes, maybe widen temp range e.g. 0.2-1.0). Quick A/B: generate the same chapter at 10 vs 90 to confirm visible delta.
**Decision:** how aggressive should the "Creative" (90+) end get — light polish→full reinterpretation, or cap it so it never strays far from transcript?

---

## C. State / Data-loss Bugs (3 items)

### 6. "Finding enrichment quotes" silently fails sometimes
**Root cause:** `outline/page.tsx:32-44` — `fetchEnrichments` only handles `res.ok`; on a 500 it does nothing but flip the button back. No error shown = silent. (The /generate page version at least `console.error`s, still no UI.) The API itself returns 500 on JSON-parse failure or empty array, but the frontend swallows it. Underlying causes of the 500: Claude returns prose-wrapped/empty/non-JSON, or 0 items.
**Fix:** (1) Surface the error in UI (inline message + retry) in both pages. (2) Harden the API: retry once on parse failure, log the raw response, return a clearer error. (3) Optionally a JSON-mode / stricter prompt to cut parse failures.
**Decision:** none for the UI fix; the API hardening depth is the only question.

### 14. Creative Freedom slider resets between chapter generations — should persist for the project's lifetime
**Root cause:** `generate/page.tsx:25` — `useState(50)`, never loaded from or saved anywhere. `creative_freedom` is **not** a project column (no migration, no API field); it's only recorded per-generation inside `generation_params` JSON. So any remount → back to 50.
**Fix options:**
- (a) **DB column** `projects.creative_freedom` (new migration) + load on mount, PATCH on change. Persists across devices/sessions — matches "for the duration of the project's lifetime." **My pick.**
- (b) `localStorage` keyed by projectId (mirrors the existing `dscribe_foreword_${projectId}` pattern) — zero backend, but per-device only.
**Decision:** DB (durable, cross-device) vs localStorage (fast, per-device)?

### 15. Generate-All-after-failure overwrites existing chapters & forewords — must NEVER overwrite without explicit "Regenerate"
**Root cause:** Mixed. The **current** client-orchestrated `generateAll()` (`generate/page.tsx:172`) already filters to `status !== "generated"`, and chapter saves *version* rather than hard-overwrite — so finished chapters are mostly safe via that path. BUT:
- **Foreword is hard-deleted every run:** both `route.ts:68` and `generate.ts:67` do `chapters.delete().eq(chapter_number,0)` then re-insert. Any Generate-All with foreword on (after all chapters succeed) destroys the existing foreword + any edits.
- **Legacy bulk worker still reachable:** `/api/jobs` still accepts `type:"generate-all"` → `runGenerateAllJob` (`generate-all.ts`) which loops **all** chapters >0 and regenerates **everything** regardless of status. A stale client, cached bundle, or the foreword `useJob` path could trip it = full overwrite.
**Fix:** (1) Guarantee Generate-All only writes chapters with no current content (status-gate, already mostly there — make it airtight). (2) Foreword: skip if one exists unless user explicitly regenerates (or confirm-prompt before overwrite). (3) Retire/guard the legacy `generate-all` job worker so nothing can trigger a blind bulk regen. (4) "Regenerate" stays the only path that overwrites a single chapter (it versions, good).
**Decision:** for an existing foreword/chapter on a retry — silently skip, or show a "X already written — regenerate?" confirm?

---

## Suggested sequencing
1. **Data-loss first** (#15 overwrite guard, #14 slider persist, #6 silent fail) — these lose user work/trust.
2. **Quick UI wins** (#1 structure, #7 backspace, #4 fuzzy notes) — high visibility, low risk.
3. **Prompt quality** (#8 POV, #9 foreword length, #10 AI-isms, #11 scripture, #12 enrichment, #13 freedom) — batch into one prompt-tuning pass + A/B.
4. **UX depth** (#5 outline blurbs, #2 analysis page, #3 remove mind map).

## Open decisions for Kyle (the ones that change the build)
- #4 keep torn-paper look? · #5 show existing summary vs generate punchier blurb? · #11 which audiences get scripture + citation style? · #12 quote density per chapter? · #13 how far should "Creative" stray? · #14 DB vs localStorage · #15 skip vs confirm on existing content · #2 design direction for the analysis page.
