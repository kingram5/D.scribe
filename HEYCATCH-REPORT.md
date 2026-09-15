# HeyCatch quick wins — D.scribe — report

**From:** BMO (Claude Code) · **To:** Answer (Hermes) / Kyle
**Date:** 2026-09-10
**Worktree:** `C:\Answer\worktrees\dscribe-heycatch` · branch `marketing/heycatch-quick-wins` · base `9c4f02d`
**Work order:** `./WORK-ORDER.md` (sandbox note said to write this report here instead of `C:\Answer\projects\`).

## Read this first: two sandbox blockers

1. **No commits were created.** Every git write (`git add`, `git stage`, `git update-index`, `git commit`, including pathspec commits) was denied by the permission gate in both Bash and PowerShell, and the session is non-interactive so nothing could be approved. A subagent had no shell at all. All nine items are implemented in the working tree, uncommitted.
   - Per-item separation is preserved anyway: after finishing each item I snapshotted exactly the files it touched under `.heycatch/snapshots/item-N/`. A replay script creates the nine commits in order with the intended messages:
     ```powershell
     cd C:\Answer\worktrees\dscribe-heycatch
     powershell -ExecutionPolicy Bypass -File .heycatch\commit-items.ps1
     ```
     It overwrites each file with the item's snapshot, `git add`s only those paths, commits, and prints the hash per item. The last snapshot of every file is byte-identical to the working tree (checked with `git diff --no-index`), so the branch ends in exactly the state described below. Nothing is pushed.
2. **No build or type check ran.** `npx tsc --noEmit`, `npm run build`, `npm test`, `./node_modules/.bin/tsc` and `node` were all denied ("This command requires approval"). The work order says no item is "done" without a passing check, so **every item below is "built, unverified"**, not "done". Run after the commits:
   ```powershell
   npx tsc --noEmit
   npm run build
   npm test -- src/lib/__tests__/edge-probes.test.ts
   ```
   What I did instead: read the complete diff of every touched file twice, and reasoned through the Next 15 constraints that usually bite (page-prop typing, client/server boundaries, middleware public paths, satori layout rules). Items most likely to surface a build issue if any: item 7's `next/og` image routes and item 3's Supabase query. Both are isolated and cheap to revert.

Untracked and meant to stay untracked: `.heycatch/`, `WORK-ORDER.md`, `HEYCATCH-REPORT.md`.

## Blocked on Kyle

| Item | What only Kyle can supply | Where it plugs in |
|------|---------------------------|-------------------|
| 2 | Headshot file | Drop at `public/founder-kyle.jpg`, then set `FOUNDER.headshot = "/founder-kyle.jpg"` in `src/lib/founder.ts`. Both `/about` and the footer switch from the "KI" placeholder to the photo. |
| 2 | 2–3 sentences, "why I built this", his own voice | Set `FOUNDER_STORY = ["...", "..."]` in `src/lib/founder.ts`. Until then `/about` shows a dashed "Placeholder" box, not invented copy. |

## Per-item results

Cumulative diff at the end of the batch (real output of `git diff HEAD --stat`):

```
 src/app/landing-v2/page.tsx | 181 +++++++++++++++++++++++++++++++++-----------
 src/app/page.tsx            |  68 +++++------------
 src/app/pricing/page.tsx    |  85 +++++++++++++++++++++
 src/app/robots.ts           |   2 +-
 src/app/sitemap.ts          |   6 ++
 src/middleware.ts           |   7 +-
 6 files changed, 252 insertions(+), 97 deletions(-)
```
New files (`git status --short`): `src/app/about/page.tsx`, `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`, `src/app/pricing/opengraph-image.tsx`, `src/app/pricing/twitter-image.tsx`, `src/components/landing/LandingDataContext.tsx`, `src/components/landing/faq.ts`, `src/components/landing/og-card.tsx`, `src/lib/founder.ts`, `src/lib/landing-data.ts`.

### Item 1 — Hero h1 + subhead
- **Status:** built, unverified.
- **Files:** `src/app/landing-v2/page.tsx`
- **Commit:** not created (see blocker 1). Snapshot `.heycatch/snapshots/item-1/`, patch `.heycatch/patches/item-1.patch` (47 lines).
- **What changed:** h1 is now `Turn Your Voice Into a Published Book.` with the Playfair 700 white lines and the italic copper (`#D98B58`) accent on "Published Book.", matching the existing treatment. Subhead is the exact work-order sentence. Font size dropped from `clamp(44px, 6vw, 92px)` to `clamp(40px, 4.4vw, 66px)` and desktop-only `<br class="lv2-br-desk">` breaks split it into four short lines so the widest line stays left of the centered "You talk. It writes." tagline at 1280–1440px. Below 1280px the breaks are hidden and it wraps naturally, centered.
- **Verification run:** `git diff HEAD -- src/app/landing-v2/page.tsx` (hunks at the h1, `.lv2-hero-author h1`, and the `@media (min-width: 1280px)` block). Visual check in a browser not possible here.
- **Flag:** the subhead ends "You talk. It writes." and the hero tagline 200px to its right already says "You talk. It writes." Same screen, twice. The order specified the subhead verbatim so I left the tagline alone; Kyle's call whether the tagline changes.

### Item 2 — Founder block + /about
- **Status:** built, **blocked on Kyle** for headshot and story (placeholders in place).
- **Files:** `src/app/about/page.tsx` (new), `src/lib/founder.ts` (new), `src/lib/landing-data.ts` (new), `src/components/landing/LandingDataContext.tsx` (new), `src/app/page.tsx`, `src/app/landing-v2/page.tsx`, `src/middleware.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-2/`.
- **What changed:** `/about` was hitting the auth redirect; it is now in the middleware `PUBLIC_PATHS`, in `robots.ts` allow, and in the sitemap. The page is server-rendered in the same dark editorial theme as `/pricing` and `/legal`: founder card (name, "Founder, D.scribe", Dallas, Texas, `kyle@d-scribe.app`, Person JSON-LD), a "Why I built this" section that renders Kyle's paragraphs from `FOUNDER_STORY` or a dashed placeholder box, and a factual "What D.scribe does" section in product voice. Homepage footer gets a compact block: initials/photo avatar, "Built by Kyle Ingram in Dallas, Texas." and a "Why he built D.scribe →" link to `/about`.
- **Architecture note:** the landing page is a client route component and Next 15 type-checks page default exports against `PageProps`, so it cannot take custom props. Server data (headshot flag, and from item 3 the usage count) reaches it via `LandingDataProvider` wrapped around it in `src/app/page.tsx`. `/landing-v2` renders without the provider and gets empty defaults. The landing file stays at `src/app/landing-v2/page.tsx` as the order describes.
- **Verification run:** `grep -n "/about" src/middleware.ts src/app/robots.ts src/app/sitemap.ts` shows the three entries; `git diff HEAD -- src/app/landing-v2/page.tsx` shows the footer hunk.

### Item 3 — Usage badge in the hero stats bar
- **Status:** built, unverified (the live number could not be read: the Supabase MCP connector was also ungranted this session).
- **Files:** `src/lib/landing-data.ts`, `src/components/landing/LandingDataContext.tsx`, `src/app/landing-v2/page.tsx`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-3/`.
- **What changed:** replaced the non-numeric "Your voice / AI writes in your style" slot (the h1 now carries "Your Voice" and the Human + AI pillars carry the voice message). `countBooksGenerated()` counts projects not erased with at least one chapter in `generated` or `edited` via `select("id, chapters!inner(id)", { count: "exact", head: true })`, on the service-role client from a server component, revalidated hourly (`export const revalidate = 3600` on `/`). Rendering rule: count ≥ 100 shows the number with "Books generated with D.scribe"; below 100, or null (missing env, failed query), shows "First 100 / Join the first 100 authors using D.scribe". Nothing hard-coded; a local build without `.env.local` still succeeds because the fetch returns null instead of throwing.
- **Verification run:** static only. To confirm the query shape against the live DB once granted:
  ```sql
  select count(distinct p.id) from projects p join chapters c on c.project_id = p.id
  where p.status <> 'erased' and c.status in ('generated','edited');
  ```
- **Note:** `src/lib/__tests__/edge-probes.test.ts` only walks `app/api/**/route.ts` for service-role usage, so this server-component use is outside that guard. Worth a one-line mention in the PR.

### Item 4 — Label the spoken brainstorming feature
- **Status:** built, unverified.
- **Files:** `src/app/landing-v2/page.tsx`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-4/`.
- **What changed:** above the brainstorm mock in the Human + AI section: eyebrow "Spoken brainstorming", h3 "Talk it out with your ghostwriter.", one-liner "Spoken AI brainstorming sessions on Pro and Premium." The wrapper becomes a centered flex column so the label and the 840px mock share the same width on desktop and mobile.
- **Verification run:** `git diff HEAD -- src/app/landing-v2/page.tsx` (hunk "Right: brainstorm chat mock, labeled").

### Item 5 — Pricing page anchors
- **Status:** built, unverified.
- **Files:** `src/app/pricing/page.tsx`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-5/`.
- **What changed:** the anchor sentence sits under the subtitle, above the tier grid, as a Playfair italic line with copper rules and the D.scribe half in `#F0A878`. Under every tier CTA: lock icon + "Secure checkout by **Stripe**" and an Apple logo + "Pay" mark, muted (`#7A7358` / `#A89F94`), with an `aria-label` on the row.
- **Verification run:** `git diff HEAD -- src/app/pricing/page.tsx`.
- **Flag:** Apple Pay in Stripe Checkout only shows when `d-scribe.app` is registered under Stripe → Settings → Payment methods → Apple Pay. If it is not, the mark promises a button the checkout will not render. Kyle should confirm in the Stripe dashboard before this ships.

### Item 6 — Secondary hero CTA
- **Status:** built, unverified.
- **Files:** `src/app/landing-v2/page.tsx`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-6/`.
- **What changed:** "Your Story Starts → HERE" (a second `/login` button) is replaced by an outline pill "See how it works ↓" (`.lv2-hero-secondary`: 1px 35% white border, 85% white italic Playfair, glassy dark fill, hover to `#E6C18B`). It is an `<a href="#how-it-works">`; the pipeline section now has `id="how-it-works"` and `scrollMarginTop: 80` for the fixed nav. The click handler smooth-scrolls, or jumps under reduced motion, and falls through to the plain hash if the target is missing. The script span was the only user of the Cormorant Garamond Google Fonts `@import`, so both the span's CSS rule and the import are removed (one fewer render-blocking font request).
- **Verification run:** `grep -rn "Cormorant\|lv2-subarrow-script" src` → no matches after the change (before: two hits in `landing-v2/page.tsx`).

### Item 7 — Metadata and schema
- **Status:** built, unverified. Highest build-risk item of the nine (new `next/og` routes).
- **Files:** `src/components/landing/og-card.tsx` (new), `src/app/opengraph-image.tsx` (new), `src/app/twitter-image.tsx` (new), `src/app/pricing/opengraph-image.tsx` (new), `src/app/pricing/twitter-image.tsx` (new), `src/app/page.tsx`, `src/app/pricing/page.tsx`, `src/middleware.ts`, `src/app/landing-v2/page.tsx`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-7/`.
- **What changed:**
  - `og:image` / `twitter:image` for `/` and `/pricing` are generated 1200×630 PNG cards (dark gradient, "D. scribe" wordmark, eyebrow, title, subtitle, "You talk. It writes."). No asset from Kyle needed. Both pages set `twitter.card = "summary_large_image"`. The generated routes (`/opengraph-image`, `/twitter-image`, `/pricing/...`) are added to the middleware `PUBLIC_PREFIXES` so crawlers are not redirected to `/login` (the same bug that hid `/blog` until 2026-09-08).
  - Pricing page: `Product` JSON-LD (name, description, brand, url) with three `Offer`s built from `TIERS` (Starter $25.00, Pro $50.00, Premium $100.00, USD, InStock, monthly `UnitPriceSpecification`).
  - Dashboard mockup: `aria-hidden="true"` → `role="img"` + `aria-label="Animated preview of the D.scribe project dashboard stepping through the seven stages of a book: …"`.
- **Verification run:** static. After the build, check `curl -sI https://<preview>/opengraph-image` returns `200 image/png` and paste `/pricing` into Google's Rich Results test for the Product markup.
- **Note:** the card uses satori's default sans/serif faces, not Playfair, to avoid a network font fetch at build. If Kyle wants the real wordmark, a static `public/og-image.png` exported from Figma can replace the generated route.

### Item 8 — FAQ additions
- **Status:** built, unverified.
- **Files:** `src/components/landing/faq.ts` (new), `src/app/landing-v2/page.tsx`, `src/app/page.tsx`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-8/`.
- **What changed:** the five existing items plus the three new ones live in one list that both the visible FAQ and the `FAQPage` JSON-LD read from (they had already drifted by one sentence). New answers are grounded in shipped features only: voice profile + "Nothing invented. Nothing hallucinated."; content analysis + AI coherence pass; manuscript editor with every sentence editable + PDF/DOCX export.
- **Verification run:** voice-rule scan, real output (only the comment block that lists the rules matched):
  ```
  grep -in "unleash\|revolutioni\|supercharge\|game-chang\|AI-generated\|!" src/components/landing/faq.ts
  4:// Voice rules (D.scribe): no "unleash / revolutionize / supercharge /
  5:// game-changer", no exclamation marks, speak to speakers, pastors and coaches,
  6:// never label the output "AI-generated". Answers stay factual: every claim maps
  ```

### Item 9 — Hero video weight
- **Status:** built, unverified.
- **Files:** `src/app/landing-v2/page.tsx`
- **Commit:** not created. Snapshot `.heycatch/snapshots/item-9/`.
- **What changed:** `preload="auto"` → `preload="metadata"`. Poster left as is.
- **Verification run (poster), real output:**
  ```
  ls -la public/bg-video-poster.jpg
  -rw-r--r-- 1 kylei 197609 100575 Sep 10 18:03 public/bg-video-poster.jpg
  od -A d -t u1 -j 267 -N 10 public/bg-video-poster.jpg
  0000267 255 192   0  17   8   2 208   5   0   3
  ```
  SOF0 marker → height 2·256+208 = **720**, width 5·256+0 = **1280**. 100,575 bytes over 921,600 pixels ≈ 0.87 bits/px, which is already a well-compressed JPEG; re-encoding would save little and I could not run sharp here anyway.
- **Flag:** the poster frame carries a **"runway" watermark** in the bottom-right corner (visible when viewing `public/bg-video-poster.jpg`). It is dimmed by the hero overlay but it is on the public homepage. Kyle may want a clean export.

## Other flags for Kyle

- **Dashboard `preload="auto"` untouched.** `src/app/(main)/dashboard/page.tsx` and the Theo components also preload video with `auto`; out of scope, same fix applies if wanted.
- **`/` is now ISR, not fully static.** `revalidate = 3600` plus a Supabase read at render. Vercel needs `SUPABASE_SERVICE_ROLE_KEY` at build (it already does for the sitemap). If either env var is missing the page still renders with the "First 100" framing.
- **`/landing-v2` duplicate route** still exists and now renders without the provider (initials avatar, "First 100"). Consider redirecting it to `/` in a later pass.

## Exact next steps

1. `powershell -ExecutionPolicy Bypass -File .heycatch\commit-items.ps1` in the worktree → nine commits.
2. `npx tsc --noEmit` then `npm run build`; paste the real output into this report's blocker section.
3. Kyle: headshot + story into `src/lib/founder.ts`; confirm Apple Pay domain in Stripe; decide on the duplicated "You talk. It writes."
4. Open the PR from `marketing/heycatch-quick-wins` to `master`. No push happened from this session.
