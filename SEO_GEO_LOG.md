# SEO + GEO implementation log

Running log for the `seo-geo` branch: what changed, what was verified and how, and what is waiting on Kyle. Newest entries at the bottom of each section.

## Ground rules on this branch
- Nothing merges to master and nothing deploys to production from here. Kyle merges.
- Work happens in its own worktree, so the main clone is never disturbed.
- No invented stats, quotes, awards or ratings in copy or structured data.
- `aggregateRating` stays out until real reviews exist.
- www is the canonical host. Never switch canonicals to the apex.

## Phase 0: audit and baseline (2026-11-14)
- **Changed:** nothing on the site. Added `SEO_GEO_AUDIT.md`, `geo-baseline.md` and `seo-geo-evidence/`.
- **Verified:**
  - Live crawl of 17 public routes with a Googlebot user agent and no JavaScript: `seo-geo-evidence/phase0-crawl-live.json`.
  - Lighthouse 12.8, mobile and desktop, on 5 pages: `seo-geo-evidence/phase0-lighthouse-live.json`.
  - curl checks of redirects, 404s, `llms.txt` and favicons.
  - 11 AI crawler user agents × 3 URLs, all 200.
- **Baseline headline:**
  - 15 of 15 sitemap URLs are index-ready (200, self-canonical, server-rendered).
  - Mobile performance: home 62, pricing 75, about 80. Desktop 89-100. SEO score 92-100.
  - `llms.txt` returns 404.
- The GEO baseline is in `geo-baseline.md`.

## Phase 1: technical SEO foundation (2026-11-14)
- **Already in place from the 10/30 crawl fixes:**
  - Server-rendered marketing pages, unique titles, www canonicals, sitemap, real 404s.
  - Apex→www and http→https 308s.
  - Not redone here.
- **Changed:**
  - `robots.ts`:
    - Added a second group naming the 11 AI and search crawlers.
    - That group repeats the exact allow and disallow lists of `*`. A crawler obeys only its most specific group, so a bare `Allow: /` group would have opened /api/ and the app to those bots.
    - Added /vs, /partners, /llms.txt and /llms-full.txt to the allow list.
  - Meta descriptions now fit in 155 characters on the 7 pages that ran long: /, /pricing, /blog, /partners and the three /vs pages, plus the root default.
    - The /vs pages build theirs from whole sentences (`fitDescription` in `src/lib/seo.ts`).
  - og:image added to /about, /blog, /vs and /vs/*. These pages' own openGraph object had dropped the inherited generated card.
  - Sitemap lastmod no longer reports the request time.
    - Fixed dates for /, /pricing and /about.
    - /blog uses its newest post's date.
  - Favicon set: added `src/app/icon.png` (192 px) and `src/app/apple-icon.png` (180 px), cut from the existing D. logo. `favicon.ico` stays.
- **Verified:**
  - Type check is clean.
  - New `seo.test.ts` (robots groups, the /partners prefix trap, description lengths) and `app-routes.test.ts` pass.
  - Full suite on a busy machine: 567 of 570 pass, 1 expected-fail. The rest were 5-second timeouts in `plans-v2.test.ts` under load; that file passes 4 of 4 on its own.
  - Re-run on an idle machine at the hero commit: 52 of 52 files, 589 passed plus 1 expected-fail.
  - Live raw-HTML checks come with the preview below.
- **Not done (needs a ruling or out of scope):**
  - The two-hop `http://d-scribe.app` redirect is a Vercel domain setting.
  - Site-wide font payload (mobile text LCP on pricing, about and partners).
  - Color-contrast fixes.
  - The "HERE" link text, which was kept on purpose.

## Phase 2: structured data and AI-readable surfaces (2026-11-14)
- **Changed:**
  - **`src/lib/structured-data.ts`** is now the one source for JSON-LD.
    - The root layout emits a single site graph on every page: Organization (`/#organization`) and WebSite (`/#website`).
    - The Organization carries the logo, `foundingDate` 2025, a support contactPoint and sameAs.
    - Pages reference those nodes by `@id` instead of repeating them.
  - **Home and /pricing:** a WebPage plus a `SoftwareApplication` (`/#software`).
    - It has `operatingSystem: Web` and offers built from `PLANS`: a free trial at $0 and Starter, Pro and Premium monthly.
    - It replaces the old pricing `Product` block and the three divergent Organization blocks.
    - No aggregateRating.
  - **/about** is an `AboutPage` about the Organization.
    - The hard-coded 25/50/100 offers are gone (they would have gone stale on the v2 price switch).
    - The Key facts "Website" row now names the www host instead of the apex.
  - **Blog posts:** `BlogPosting` (author and publisher are the Organization, per the no-personal-info rule) plus a BreadcrumbList. The blog index publisher now points at the Organization `@id`.
  - **BreadcrumbList** added to the 6 /legal pages (home > policy). The /vs pages already had theirs.
  - **FAQPage** kept on home (it has the visible FAQ). It is not duplicated onto /about, which renders the same list: Google wants a repeated FAQ marked up once.
  - **`/llms.txt`** (about 500 words) and **`/llms-full.txt`** (about 2,750 words) are served as route handlers.
    - Both are built from the constants the pages render (`PLANS`, the FAQ, the /about content, the /vs data), so prices follow the plan flag. See `src/lib/llms.ts`.
    - The /about content constants moved verbatim into `src/lib/about-content.ts` so the page and `llms-full.txt` share one copy.
    - Both paths were added to the middleware's public list, without which they 404 for crawlers.
  - **sameAs:** Instagram, TikTok, YouTube and X, each checked on 2026-11-14 (details in the code comment).
    - Facebook is left out for now.
    - The Reddit account is personal and not included.
  - No SearchAction (the site has no search). No HowTo (no tutorial pages yet).
- **/about checklist:**
  - Quotable one-paragraph definition: present.
  - Founding year (2025): present.
  - Contact email: present.
  - **Founder name and Dallas-Fort Worth: not added.** This is held by the standing no-personal-info rule; see Blocked on Kyle #1.
- **Verified:**
  - Type check is clean.
  - New `structured-data.test.ts` covers:
    - stable `@id`s and www URLs
    - logo and https-only sameAs
    - no founder, Person or SearchAction data
    - offers equal to `PLANS`, with no rating
    - breadcrumb item URLs and Article author
    - script-tag escaping
    - `llms.txt` under 2,000 words, real prices, www-only links, no ghostwriter cost figure
  - Local build and preview checks are below.
- **Rich Results Test and the Schema.org validator need a public URL.** The preview sits behind Vercel login, so those run after merge on the live site (Kyle's call when to merge).
  - Expected Rich Results warning: SoftwareApplication rich results want `aggregateRating` or `review`. That stays out until real reviews exist. It is a missing-enhancement notice, not a schema error.

## Hero video: poster first (Kyle 2026-11-14: "go with your call on the video")
- **Changed (`src/app/landing-v2/page.tsx`):**
  - **The still (LCP element).** A still of the video's own first frame, `public/bg-video-poster.webp` (WebP, 61 KB, 1280×720, the video's size), is now server-rendered in the hero.
    - It has explicit width and height and `fetchPriority="high"`. React adds the matching `<link rel="preload" as="image">`.
  - **The video, a beat later.** It mounts after `load` plus `requestIdleCallback`, then autoplays muted and looping as before. The video file is unchanged. The still hides once the video is playing.
    - Reduced Motion never mounts it. The old code paused it on the first frame, which is the same still.
    - iOS tap-to-play is kept.
    - It also calls `play()` explicitly in case the `autoplay` attribute alone does not start it.
  - **The 1×1 px mount.** Chrome measures an element for LCP once, at its first frame, and it counts a video's first frame even under `visibility:hidden`.
    - Measured with a PerformanceObserver: at full size the video's first frame out-measured the still (209,070 vs 208,884 px, because the hero box ends a fraction of a pixel taller) and became a late LCP.
    - So the video mounts at 1×1 px. It sits top-left under the fixed nav for a few frames, then goes full size.
  - **Middleware.** The matcher now excludes `.webp`. Without that, the auth gate 404s the new still for anonymous visitors. The live site already 404s `/theo-portrait.webp` the same way, though nothing links to that file.
- **Verified on a local production build:**
  - **LCP entries:** the list ends on the IMG in 4 of 4 probe runs (412×823 viewport, 1.75 DPR, one run with cache disabled). The video ends playing, visible, full size, with the still hidden.
  - **Same look:** the video box equals the hero box at mobile and desktop. Opacity is 0.5 on mobile and 1 on desktop, as on live. Screenshot pairs against the live site match.
  - **Raw HTML:** the still and its preload link are present, and there is no SSR `<video>`.
  - **Lighthouse mobile, local build, back-to-back runs on the same machine:**

| Run | Before (Phase 2 build) | After (this commit) |
|---|---|---|
| Simulated throttling (Lighthouse default), 2 runs each | perf 69, LCP 5.3 s (element: video), TBT 300-330 ms | **perf 74-75, LCP 5.1 s (element: the still), TBT 160-170 ms** |
| Applied (devtools) throttling | perf 63, LCP 3.0 s (one outlier run at 32 / 5.8 s) | perf 61-62, LCP 3.1 s |

  - CLS is 0.005-0.006 in all runs, unchanged.
  - **Honest read:** the LCP element moved from the video to the still, and blocking time roughly halved. LCP itself is still not green.
    - LCP is now pinned to first paint: FCP is 2.7-3.0 s on this machine.
    - First paint is held back by 3 render-blocking stylesheets (Lighthouse estimates 1.15 s of savings) and the landing page's JavaScript.
    - Live mobile before this branch: perf 62, LCP 6.3 s.
  - The next perf steps are separate work: inline or trim the critical CSS, cut the 16 declared font families, and split the 1,700-line client landing component.
  - Earlier local runs on this PC came in about 20 points lower across the board (machine load). Only the paired runs above are compared.

## Blocked on Kyle
1. **Founder name and location on /about (ruling).**
   - The plan asks for "Kyle Ingram" and "Dallas-Fort Worth" on /about and in the Organization data.
   - A standing site rule (2026-09-19) says no personal info on the site: no name, location, headshot or Person schema.
   - The narrower standing rule wins until Kyle lifts it, so this branch adds neither.
   - Pick: allow the name plus the metro area only (no headshot, no street address). Entity clarity is the main thing AI engines reward on an about page. It is a five-minute change once approved.
2. **Ghostwriter cost figure (ruling).** /about says $10k-$50k and /pricing says $30k-$80k. Pick one range and give a source to cite. Until then neither figure is repeated in `llms.txt`.
3. **The support email in site-wide data (non-blocking).** `kyle@d-scribe.app` was already public on /about. It now also appears in the Organization `contactPoint` on every page and in `llms.txt`. The 2026-09-19 rule lists "email", so say if it should come out. Pick: keep it, because a support address is the contact AI engines look for.
4. **Real-iPhone check of the hero (2 minutes).** Open the preview on an iPhone: once with Low Power Mode off (the video should start by itself a beat after load) and once with it on (the still holds; one tap starts the video). Headless Chrome cannot test iOS autoplay rules.
5. **Merge (ruling).** Open a PR from `seo-geo` and merge when ready. After it is live, run Google's Rich Results Test and the Schema.org validator against www. Previews sit behind Vercel login, so neither tool can read them.
6. **GEO coverage (logins).** Claude, Grok and the Perplexity website need a signed-in session to answer, so they are "not checked" in the baseline.
   - For the weekly checker (Phase 6), the OpenAI, Gemini and Perplexity keys already exist.
   - Claude cannot use an API key under the subscription-only rule. It would run through a signed-in browser session or the Claude Code CLI on the subscription.
7. **Facebook in sameAs.** The Facebook Page is left out pending a change to the Page's public contact details (reported separately).
8. **Not done, needs a ruling or access:**
   - The `http://d-scribe.app` two-hop redirect (Vercel domain setting).
   - The next landing-page performance pass: critical CSS, font families, splitting the client component.
   - An on-page FAQ for /pricing (copy).

## Preview verification (2026-11-14)
- **Branch pushed:** `seo-geo` at `58d3229` (hero commit).
- **Vercel preview:** https://d-scribe-1yjxw0rsm-kyles-projects-6adbe8c9.vercel.app (status "Deployment has completed"). It sits behind Vercel login and returns a 302 to Vercel SSO when fetched anonymously.
- **Checked from a signed-in browser tab, reading raw responses (no JavaScript rendering):**
  - `/robots.txt` = 200, with the named AI-crawler group.
  - `/llms.txt` = 200, 501 words. `/llms-full.txt` = 200, 2,752 words.
  - `/` = 200, JSON-LD Organization + WebSite + WebPage + SoftwareApplication + FAQPage, the still and its preload in the HTML, no SSR video.
  - `/pricing` = 200, Organization + WebSite + WebPage + SoftwareApplication.
  - `/about` = 200, AboutPage.
  - `/legal/terms` = 200, BreadcrumbList.
  - `/vs/dictate` = 200, FAQPage + BreadcrumbList.
  - `/bg-video-poster.webp`, `/icon.png`, `/apple-icon.png` and `/sitemap.xml` = 200.
  - An unknown path = 404.
- **Lighthouse through the signed-in browser profile (needed to get past Vercel login; warm cache, extensions present, so not comparable to the paired local runs):**
  - Live home: perf 72-73, LCP 1.5-1.6 s (element: video).
  - Preview home: perf 54 then 75, LCP 5.6 s cold then 1.7 s warm (element: the still).
  - Preview SEO scores 58 only because Vercel sends `noindex` on preview deployments.
