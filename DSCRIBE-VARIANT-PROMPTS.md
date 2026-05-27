# Variant.com generation prompts — /analysis loading screens (2026-05-27)

Three paste-ready prompts, one per concept. Each is self-contained (repeats the brand/design context) so it can be pasted independently. Pipeline = key points → voice profile → chapter outline (mind-map removed).

---

## PROMPT — Concept 2B: Book Spine Build

Build a full-page loading screen for **D.Scribe**, an app that turns a spoken-word transcript into a finished book. Design language: warm, literary, cinematic, **dark** theme. Background #241D14. Text cream #F9F7F2. Accent copper #C17A47 (hover #D98B58). Fonts: **Playfair Display** (italic serif — headlines + chapter titles), **Manrope** (sans — labels/UI), **Lora** (serif — body/transcript text).

The screen visualizes a 3-stage AI pipeline that runs over ~20–120s: (1) Extracting key points — happens in 4 chunks, (2) Building voice profile, (3) Generating chapter outline. **Simulate this progression with timers** for the demo (~1s per key-point chunk, ~2s voice, ~2s outline). A fixed bottom status bar shows a small spinning copper ring + the current stage label text. Never imply a fixed total duration; drive every reveal off stage changes. Respect `prefers-reduced-motion` (disable sweeps/slides/bounces, show final states). Build as a single self-contained React component with inline styles or Tailwind.

**Layout:** two columns, 55% / 45%, vertically centered.
- **LEFT** = the raw spoken source: a wall of faux transcript text (~12 lowercase, run-on lines, Lora 13px, line-height 1.85, color rgba(249,247,242,0.25)). Starts blurred at `blur(3px)`.
- **RIGHT** = a closed book silhouette, 150×220px, border-radius `4px 14px 14px 4px`, background rgba(193,122,71,0.15), 1px border rgba(193,122,71,0.35), large soft drop shadow, with a faint vertical "D.SCRIBE" watermark near the top.

**Motion by stage:**
- Stage 1 (key points, 4 chunks): thin horizontal "page lines" (1px, rgba(249,247,242,0.18)) slide into the book one per chunk, fading + sliding in from the left.
- Stage 2 (voice profile): a copper gradient scan-line `linear-gradient(90deg,transparent,#C17A47,transparent)` sweeps top→bottom across the LEFT transcript on a loop; the transcript de-blurs to `blur(1px)` and brightens to opacity 0.45; the book scales to 1.05.
- Stage 3 (outline): transcript fully sharpens (`blur(0)`, opacity 0.6); the book splits into a vertical stack of chapter cards (each rgba(61,52,40,0.92), 1px cream border, radius 8, Playfair italic 14px), revealed one at a time (fade + slide-up, 80ms stagger), each reading "1. <Chapter Title>". Use ~7 mock chapter titles (e.g. The First Step, Through the Valley, Finding Your Voice…).
- End: all chapters stacked; status bar reads "Your analysis is ready."

---

## PROMPT — Concept 3A: Chip Cascade

Build a full-page loading screen for **D.Scribe**, an app that turns a spoken-word transcript into a finished book. Design language: warm, literary, **light "paper"** theme. Background #FAF8F3, cards #FFFFFF, primary text #2C2419, muted text #A39B7D / #7A7358. Accent copper #C17A47. Fonts: **Playfair Display** (italic serif — headline + chapter titles), **Manrope** (sans — labels/chips/UI).

The screen visualizes a 3-stage AI pipeline running ~20–120s: (1) Extracting key points — in 4 chunks, (2) Building voice profile, (3) Generating chapter outline. **Simulate with timers** (~1s per key-point chunk, ~2s voice, ~2s outline). A fixed bottom status bar shows a small spinning copper ring + the current stage label. Never imply a fixed duration; reveal content only as stages progress. Respect `prefers-reduced-motion`. Single self-contained React component, inline styles or Tailwind.

**Layout:** centered column, max-width 720px. Top: a Playfair-italic 30px headline "Reading your transcript…" that switches to "Your analysis is ready." at the end. Below: three stacked white cards (radius 16, 1px border rgba(44,36,25,0.08), padding 24), each with a Manrope 11px uppercase letter-spaced (0.1em) label in #A39B7D: "KEY POINTS", "VOICE PROFILE", "CHAPTERS".

**Stage gating:** a card whose stage hasn't started is dimmed (opacity 0.35) + blurred (`blur(1.5px)`); it un-dims/sharpens when its stage begins. A completed card gains a 3px copper left border.
- **KEY POINTS:** as the 4 chunks complete, theme "chips" pop in (scale 0.85 → 1.08 → 1 over 300ms) — pill shape, background rgba(193,122,71,0.12), 1px border rgba(193,122,71,0.3), color #C17A47, Manrope 13px. Use ~8 mock single-word themes (grace, redemption, calling, resilience, purpose, doubt, renewal, legacy). A live counter below reads "N themes found…".
- **VOICE PROFILE:** once active, 3 trait chips fade in staggered (150ms) — Conversational, Narrative-driven, Scripture-anchored — in a muted variant (grey text/border).
- **CHAPTERS:** once active, show ~7 shimmering skeleton rows (height 30, radius 8, copper-tinted shimmer) that then resolve into Playfair-italic 15px chapter titles "1. <Title>".

---

## PROMPT — Concept 3B: Vertical Timeline ⭐ (priority)

Build a full-page loading screen for **D.Scribe**, an app that turns a spoken-word transcript into a finished book. Design language: warm, literary, **light "paper"** theme. Background #FAF8F3, primary text #2C2419, muted text #A39B7D / #7A7358. Accent copper #C17A47. Fonts: **Playfair Display** (italic serif — headline + chapter titles), **Manrope** (sans — labels/chips/UI).

The screen visualizes a 3-stage AI pipeline running ~20–120s: (1) Extracting key points — in 4 chunks, (2) Building voice profile, (3) Generating chapter outline. **Simulate with timers** (~1s per key-point chunk, ~2s voice, ~2s outline). A fixed bottom status bar shows a small spinning copper ring + the current stage label. Never imply a fixed total duration; reveal content only as stages progress. Respect `prefers-reduced-motion` (no pulse/bounce, instant states). Single self-contained React component, inline styles or Tailwind. The user should feel like they're watching their book's structure assemble in real time.

**Layout:** centered column, max-width 640px. Playfair-italic 30px headline at top ("Reading your transcript…" → "Your analysis is ready."). Below: a **vertical timeline**.
- A 2px left rail (rgba(44,36,25,0.08)) that progressively **fills copper (#C17A47) top→bottom** as stages complete — animate fill height 33% → 66% → 100%.
- **Three step nodes** on the rail, each with a Manrope 11px uppercase (0.1em) label: "Key Points", "Voice Profile", "Chapter Outline".
  - Locked node = hollow 10px circle (2px border rgba(44,36,25,0.2)).
  - Active node = filled 12px copper dot with an expanding **pulse ring** (animated box-shadow).
  - Done node = filled 12px copper dot with a white checkmark.
- Content under each node is dimmed (opacity 0.3) until that step becomes active.

**Step content:**
- Step 1 (Key Points): theme chips pop in per extraction chunk (pill, bg rgba(193,122,71,0.12), 1px border rgba(193,122,71,0.3), #C17A47, scale bounce) + a "N themes found" counter. ~8 mock themes.
- Step 2 (Voice Profile): 3 trait chips fade in staggered (Conversational, Narrative-driven, Scripture-anchored).
- Step 3 (Chapter Outline): ~7 shimmering skeleton rows that resolve into Playfair-italic 14px chapter titles "1. <Title>".
- End: rail fully copper, all nodes checked, headline → "Your analysis is ready."
