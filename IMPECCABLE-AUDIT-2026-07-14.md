# D.Scribe Front-End Audit — /impeccable audit (2026-07-14)

Scope: full front end — landing (landing-v2), editor + voice-match UI, dashboard, project pipeline, login, settings, pricing, ui components. Code-level audit per impeccable audit spec; landing claims live-verified against d-scribe.app at 1022px viewport.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1/4 | 3 ARIA attributes across the entire ui+editor component tree; paper-theme text fails AA |
| 2 | Performance | 2/4 | Perpetual animations + interval carousels never pause; whole landing is one 1,443-line client component |
| 3 | Responsive Design | 1/4 | Hero text collision + horizontal scroll LIVE on prod at ≤1100px; landing effectively desktop-only |
| 4 | Theming | 2/4 | Real token system exists but 172 hard-coded hex in components; landing runs its own diverged palette |
| 5 | Anti-Patterns | 3/4 | Distinctive committed brand, real font pairing; minor tells (uppercase tracked micro-labels, z-index 9999) |
| **Total** | | **9/20** | **Poor — major overhaul needed on landing responsive + app contrast** |

## Anti-Patterns Verdict
**Pass, narrowly.** This does NOT look AI-generated: the warm editorial identity (dark env + paper workspace), Playfair/Manrope pairing, and the cassette/waveform motifs are a committed brand, not category reflex. Tells that remain: tiny uppercase tracked labels repeated across mocks and panels, `z-index: 9999` on the upgrade modal, glass cards leaning decorative in places. None fatal.

## P0 — Blocking

**[P0-1] Hero layer collision + horizontal page scroll at ≤1100px (LIVE ON PROD)**
- Location: `src/app/landing-v2/page.tsx` hero section (~lines 285-360)
- Category: Responsive
- The hero is built from absolutely-positioned layers (`lv2-hero-author` at `left: 80px` with a **fixed 480px-wide h1 and `marginLeft: -47`**, tagline stack centered at 50%). At 1022px, "There's an Author" overlaps "You talk. It writes." and the body scrolls horizontally. Screenshot-verified on d-scribe.app today.
- Impact: the marketing front door renders broken text collision for every tablet/small-laptop visitor. This is the page ad traffic lands on.
- Fix: convert hero layers to a flow layout (grid/flex with minmax), kill fixed widths and negative margins, clamp the h1.
- Command: `/impeccable adapt landing-v2`

**[P0-2] Landing has no mobile implementation for its core sections**
- Location: same file; styled-jsx mobile block (~line 1424) covers only 4 classes (nav, pillars, pipeline-grid, humanai-grid)
- Category: Responsive
- `lv2-hero-author`, `lv2-hero-waveform`, `lv2-hero-tagline`, `lv2-hero-stats` (80px padding), `lv2-pipeline-dash` (**fixed `height: 1122px`**, 40/60 split), `lv2-dashboard-wrap` (`translateX(-20%)`), `lv2-brainstorm-wrap` (`marginLeft: -5%`) have **zero CSS rules anywhere** — grep-verified. They are inline-style-only with no breakpoint handling.
- Impact: on phones the hero stacks illegibly and the 1122px-tall two-pane dashboard mock is unusable. Most landing traffic is mobile.
- Command: `/impeccable adapt landing-v2`

## P1 — Major (fix before next marketing push)

**[P1-1] Paper-theme text ramp fails WCAG AA across the whole app workspace**
- Location: `src/app/globals.css` `.paper-theme` (lines 129-150)
- Category: Accessibility · WCAG 1.4.3
- Measured: `--text-secondary` #7A7358 on #F4F1E8 = **4.21:1** (needs 4.5); `--text-tertiary` #A39B7D = **2.47:1**. Secondary/tertiary text is most of the pipeline UI's copy.
- Fix: darken the ramp (secondary → ~#6A6350 gets ≥4.5; tertiary needs a full step darker or size promotion).
- Command: `/impeccable polish paper-theme ramp`

**[P1-2] State colors tuned for dark theme are unreadable on paper theme**
- Location: `VoiceMatchBadge.tsx` scoreColor() (#34d399 / #fbbf24 / #f87171), `--ds-success` not overridden in `.paper-theme`
- Category: Accessibility / Theming
- Measured on paper: amber **1.48:1**, green **1.70:1** — the voice-match scores (12px bold) in the editor stats bar are effectively invisible-contrast. Dark theme passes (9.16).
- Fix: theme-aware state tokens (`--ds-warn`, `--ds-success` overridden per theme), point scoreColor at tokens.
- Command: `/impeccable polish` (state tokens)

**[P1-3] Accessibility baseline missing across components**
- Locations: `login/page.tsx` (input uses placeholder as its only label), landing carousel (`‹`/`›` glyph-only buttons + unlabeled dot buttons), `VoiceMatchBadge` popover (no `aria-expanded`, no Escape close), `InkUpgradeModal` (fixed-div modal, no focus trap, no `role="dialog"`), **no custom `:focus-visible` styles anywhere in globals.css**
- Category: Accessibility · WCAG 1.3.1 / 2.1.2 / 2.4.7 / 4.1.2
- Impact: keyboard and screen-reader users can't reliably log in, dismiss overlays, or perceive controls. 3 ARIA attributes exist across the entire ui+editor tree.
- Command: `/impeccable harden` (a11y pass)

**[P1-4] Landing pillars section body text at 2.75:1**
- Location: `landing-v2/page.tsx` ~line 489: `color: "#7b651a"` on `backgroundColor: "#312109"`
- Category: Accessibility · WCAG 1.4.3
- Fix: lift toward the section's ink (#F4E8D1 family) or use an alpha of it.
- Command: `/impeccable polish`

## P2 — Minor

- **[P2-1] Three parallel styling systems.** Design tokens + 172 hard-coded hex in components + Tailwind utility classes + styled-jsx + inline-style objects. The landing defines its own palette constant `P` (#FAF8F3 paper) that near-duplicates but diverges from app tokens (#F4F1E8). Command: `/impeccable extract` (consolidate tokens).
- **[P2-2] z-index anarchy.** 1, 5, 30, 50, 100, **9999** (InkUpgradeModal). Build the semantic scale. Command: `/impeccable polish`.
- **[P2-3] Touch targets.** VoiceMatch chip (~14px tall, padding 0), carousel dots, 11-12px interactive text — all far below 44px. Command: `/impeccable adapt`.
- **[P2-4] Perpetual animation cost.** setInterval carousels (2.6s) + SMIL orbits + infinite CSS keyframes run while off-screen/hidden; `DashStepAnim` re-injects `<style>` tags every step switch. IntersectionObserver is already used for reveals — extend it to pause loops. Command: `/impeccable optimize`.
- **[P2-5] Whole landing is one 1,443-line "use client" component.** Hero, carousels, FAQ all hydrate as one unit. Split static sections into server components. Command: `/impeccable optimize`.

## P3 — Polish
- Title-attribute-only tooltips (VoiceMatchBadge) — invisible to touch users.
- Uppercase tracked micro-labels repeated across every panel/mock — brand grammar drifting toward the eyebrow tell.
- Duplicate near-identical token layers in globals.css (`:root` declared twice, legacy `--background` set unused).

## Systemic Patterns
1. **Dark theme was designed; paper theme was derived** — every contrast failure lives on paper. The derivation didn't re-check ratios or re-map state colors.
2. **Inline styles as the primary styling vehicle** — tokens exist but components bypass them, which is why the two themes drift and why responsive rules have nowhere to live.
3. **Desktop-first landing built at one viewport** — absolute positioning + fixed pixel dimensions with breakpoints added only where a grid collapsed.

## Positive Findings
- Committed, distinctive brand identity — passes the slop test; the cassette/waveform/paper motifs are genuinely yours.
- Playfair × Manrope is a real contrast-axis pairing, used consistently.
- `prefers-reduced-motion` honored on the landing (JS matchMedia + CSS kill switch) and analysis screen.
- MagicEditBubble does keyboard right: Escape handling, focused input flow.
- IntersectionObserver reveals with proper disconnect; float animations are transform/opacity-only.
- SEO/schema layer (FAQ/Org/WebPage JSON-LD, canonical, OG) is genuinely strong.

## Recommended Actions (priority order)
1. **[P0] `/impeccable adapt landing-v2`** — rebuild hero + pipeline sections as flow layouts with real breakpoints (fixes both P0s and touch targets).
2. **[P1] `/impeccable polish`** — paper-theme text ramp + theme-aware state tokens + pillars section color + z-index scale.
3. **[P1] `/impeccable harden`** — a11y baseline: login label, focus-visible system, modal semantics/focus trap, popover Escape, carousel labels.
4. **[P2] `/impeccable extract`** — one token vocabulary; fold the landing `P` palette into `--ds-*`; burn down the 172 hex.
5. **[P2] `/impeccable optimize`** — pause off-screen loops, split the landing client component.
6. **[final] `/impeccable polish`** — verification pass; re-run `/impeccable audit` to score the delta.
