# /analysis Loading Screen — Design Mockups (2026-05-27)

Goal: replace the boring centered-card + thin progress bar (item #2) with a dynamic, full-page, on-brand loading experience.
Source: ui-ux-designer agent, 6 specs (2 versions × 3 concepts). Pipeline is **key points → voice profile → chapter outline** (mind-map stage removed per item #3).

> Note: the full motion specs for 1A, 1B, and 2A were not retained from the agent session (a continuation call misfired). They are **non-finalists**, so only summaries appear below. The finalists (2B, 3A, **3B**) are fully specified.

---

## 🏆 RECOMMENDATION
- **Best overall: 3B (Themes Materializing — Vertical Timeline).** Only concept that shows the user's REAL output appearing in real time (theme chips, voice traits, chapter skeletons), can't fake-finish before the work completes, lightest lift (~40 lines CSS, no new deps), and matches the existing analysis-page visual language exactly.
- **Fastest upgrade from today: 1B.** ~60-80 lines, no deps.
- **Avoid: 2A** unless Framer Motion is added to the project (janky in pure CSS = worse than a spinner).

Plan: prototype 3B live in the test env so Kyle can watch it, then tune. (Possibly 3B + 1B side by side.)

---

## Concept summaries

**1️⃣ Ink-write**
- 1A — animated ink stroke "writes" across a dark page; skeleton lines shimmer in and resolve into chapter titles. (summary only)
- 1B — full-page parchment, Playfair italic headline, three step rows, chunk counter parsed from `analyzeStep`. Agent's "fastest upgrade." (summary only)

**2️⃣ Transcript→Book**
- 2A — transcript words drift in from edges and converge into chapter cards. Needs Framer Motion (not in project). AVOID in pure CSS. (summary only)
- 2B — fully specified below.

**3️⃣ Themes materializing**
- 3A & 3B — fully specified below. 3B is the overall winner.

---

## Concept 2 — v2B: Book Spine Build (pure CSS, no Framer Motion)

Two-column 55/45. Left: faux "raw transcript" (Lora, blurred, low-opacity) that de-blurs as steps complete. Right: a book cover silhouette that grows page-lines, then splits into stacked chapter cards.

**Motion:** transcript clip-reveals in (staggered 40ms/line, blur(3px)); book cover fades in; step 1 adds page-lines; step 2 = copper scan-line sweep down the left panel + text sharpens + book `scale(1→1.05)`; step 3 = book splits into N stacked page-cards with Playfair-italic chapter titles, transcript fully sharpens.

**Key tokens:** left col `Lora 13px/1.8, color rgba(249,247,242,.25→.55), blur(3px→0)`; book `100×150, radius 4px 12px 12px 4px, bg rgba(193,122,71,.15)`; scan line `linear-gradient(90deg,transparent,#C17A47,transparent)`; page card `bg rgba(61,52,40,.7), Playfair italic 14px`.

**Variable timing:** scan line runs once per step trigger, not a loop — no fake duration. **Reduced-motion:** static text, instant book, no scan. **Deps:** pure CSS + SVG.

---

## Concept 3 — v3A: Chip Cascade

Three stacked section cards (Key Points / Voice Profile / Chapters). Steps 2 & 3 start dimmed+blurred (`opacity .35, blur 1.5px`) so the user sees what's coming (recognition > recall). Each card unlocks when its `analyzeStep` fires.

**Motion:** headline "Reading your transcript…" fades in; section 1 activates; per key-point chunk a chip pops `scale(0→1.08→1)` (300ms) and a counter ticks ("7 themes found…"); on complete, copper left-border accent; section 2 unlocks → 3 voice-trait chips (Cadence/Tone/Style, skeleton→placeholder); section 3 unlocks → N chapter skeleton rows shimmer, resolve to real titles. Headline cross-fades to "Your analysis is ready."

**Key tokens:** headline `Playfair italic 28px`; section label `Manrope 11px/700 caps, #A39B7D`; chip `bg rgba(193,122,71,.12), border rgba(193,122,71,.3), radius 20, #C17A47`; locked `opacity .35, blur 1.5px`; chapter row `36px, shimmer, resolved Playfair italic 14px`.

**Variable timing:** chips/sections only fire on real pipeline events — never lies. **Reduced-motion:** all chips at once, no bounce, sections full-opacity, final count only.

---

## Concept 3 — v3B: Vertical Timeline ⭐ WINNER

Single centered column (max-width 640). Left vertical rail connects three step nodes; rail fills copper top→bottom as steps complete. Same chip/skeleton reveal logic as 3A but as a top-down 3-step pipeline the user's eye tracks downward.

**Motion:**
- T+0: full timeline renders. Active node (step 1) `12px, #C17A47, box-shadow 0 0 0 4px rgba(193,122,71,.2)`, pulsing. Inactive nodes `10px, border 2px rgba(44,36,25,.2)`, content below at `opacity .3`.
- Per chunk: chip `opacity0,scale(.85)→opacity1,scale(1)` 200ms ease-out; counter increments.
- Step transition: active node fills copper + checkmark SVG; rail fills via `linear-gradient(to bottom, #C17A47 0%, rgba(44,36,25,.08) X%)` animating X 33%→66%→100% (400ms each); next node activates with pulse; content `opacity .3→1` (300ms).
- Step 2: voice-trait chips (150ms stagger). Step 3: chapter skeletons shimmer → real titles. Rail fully copper. Headline → "Your analysis is ready." crossfade.

**Key tokens:** rail `border-left 2px rgba(44,36,25,.08)`, fill `#C17A47`; node active `12px #C17A47 + pulse`; node done `+ checkmark`; node locked `10px border 2px rgba(44,36,25,.2)`; step label `Manrope 11px/700 caps #A39B7D → #2C2419 on activate`.
```
@keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(193,122,71,.4)} 50%{box-shadow:0 0 0 8px rgba(193,122,71,0)} }
```

**Variable timing:** purely event-driven off `analyzeStep` changes — no timers, can't fake-finish. **Reduced-motion:** no pulse, no rail-fill animation (instant color), no chip bounce, counter instant.

**Why it wins:** real output in real time (perceived-performance research — NN/g progress indicators); honest about uneven 20-120s timing; known step-list pattern (Jakob's Law, zero learning cost); lightest lift (~40 lines CSS, reuses existing `float`/`spin` keyframes); brand-matched so the resolve into the real UI is seamless.

**Files to modify:**
- `src/app/(main)/project/[projectId]/analysis/page.tsx` — the `!hasAnalysis` block, specifically the `analyzing &&` block (~lines 378-401)
- `src/app/globals.css` — add `@keyframes chipPop`, `pulse`, `shimmer`, `railFill`; move the inline `analysisProgress` keyframe here too.
