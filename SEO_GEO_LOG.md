# SEO + GEO implementation log

Running log for the `seo-geo-merge` branch: what changed, what was verified and how, and what is waiting on Kyle. Newest entries at the bottom of each section.

- This branch is the merge-ready cut: Phases 0-2, Kyle's 2026-11-14 rulings and these docs.
- **The hero video change is not here.** It lives on branch `seo-geo` (commit `58d3229`) and ships separately after Kyle checks it on his iPhone.

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
  - Live raw-HTML checks come with the preview below.
- **Not done (needs a ruling or out of scope):**
  - The two-hop `http://d-scribe.app` redirect is a Vercel domain setting.
  - Site-wide font payload (mobile text LCP on pricing, about and partners).
  - Color-contrast fixes.
  - The "HERE" link text, which was kept on purpose.

## Mobile speed pass (branch `perf-mobile`, 2026-11-14)
- **Shipped on this branch: fonts.**
  - Instrument Serif is removed (nothing used it).
  - Geist (the third fallback in the body stack) and Lora (the app's serif; on public pages mostly a fallback behind Playfair, though the landing's book carousel uses it first) no longer preload. They still load wherever they paint. Home fetched the same 6 font files before and after; what changes is how many are preloaded at high priority.
  - The live site preloads 7 font files on every page (checked in its HTML); a Linux build of this branch should preload 4: Inter, Manrope, Playfair normal and italic.
  - Cormorant Garamond no longer comes from a third-party Google Fonts `@import` inside the landing page's styles. It is self-hosted by next/font with no preload and applied to its one desktop-only line.
  - The look and the copy are unchanged. The hero video code is untouched.
- **Tried, measured, and left out:**
  1. **Inlining all CSS** (Next `experimental.inlineCss`). No measured gain: home FCP stayed at 2.7 s, and the HTML is 2.4× larger on every page (home 24 KB → 59 KB gzipped).
     - The /pricing medians looked worse (perf 78 → 69, LCP 4.2 → 4.5 s), but the baseline itself ranged from 60 to 89 across rounds, so treat that as noise rather than proof of harm.
     - The App Router has no critical-CSS extraction, so a true "inline the critical part, defer the rest" isn't available without a larger CSS split.
  2. **Splitting the landing component** (the three animated below-the-fold widgets moved to a next/dynamic chunk). Home first-load JS went from 296 to 285 KB, but in 4 paired rounds TBT and LCP did not improve (medians TBT 140 → 165 ms, LCP 5.4 → 5.65 s).
     - The landing component is only about 27 KB. The weight is the 269 KB shared bundle (framework, Sentry, Supabase client, analytics) that every page loads.
- **Measurements (paired local production builds, Lighthouse 12.8 mobile, 4 rounds, before = master `203d0dd`):**
  - Home: perf 75 → 73, LCP 5.4 → 5.65 s (the LCP element is the hero video on both).
  - /pricing: perf 78 → 77.5, LCP 4.15 → 4.2 s.
  - Those runs were taken with the split included. **The shipped branch (fonts only) has no Lighthouse before/after**; any speed gain from it is unmeasured. It was not re-measured locally because Windows builds emit no font preloads at all (`next-font-manifest.json` comes out empty locally), so local runs cannot show the font change.
  - **Verified on the Vercel preview (a Linux build):** 4 font preload links on /, /pricing and /about, against 7 on live. The Google Fonts Cormorant import is gone from the preview home page.
- **What would move mobile scores next (separate work):**
  - The poster-first hero (branch `seo-geo`, waiting on Kyle's iPhone check). The video is the home LCP.
  - Trimming the shared bundle on marketing pages (Sentry init runs twice; HeyCatch, Supabase client).
  - /pricing showed CLS 0.117 locally, before and after. Live /pricing measures CLS 0 (Lighthouse, 2026-11-14), so it is a local-build artifact: Windows builds emit no font preloads, so fonts swap late.
  - A real critical-CSS split of the 170 KB global stylesheet.

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
  - **Founder name and metro area: not added.** This is held by the standing no-personal-info rule; see Blocked on Kyle #1.
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

## Hero video (not on this branch)
- Poster-first hero: the still loads as the LCP element and the video starts after load + idle.
- It is on branch `seo-geo` as commit `58d3229`, with its measurements in that branch's log and `seo-geo-evidence/hero-lighthouse-local.json`.
- It is held until Kyle checks it on a real iPhone (Low Power Mode on and off).
- Paired local runs moved the LCP element from the video to the still, but LCP time did not reach green. The next lever is render-blocking CSS and fonts.
- Nothing on this branch depends on it: no middleware `.webp` change, no poster image, no landing-page change.

## IndexNow (branch `indexnow`, 2026-11-14)
- **Key file:** `public/37914b4d2ff2dd4260d62c0be0a12eaa.txt`, served at https://www.d-scribe.app/37914b4d2ff2dd4260d62c0be0a12eaa.txt and listed in the middleware's PUBLIC_PATHS (without that, the auth gate 404s it).
  - The key is public by design: IndexNow proves ownership by fetching that file. No secrets anywhere.
- **Ping:** `scripts/indexnow-ping.mjs` (plain Node, no dependencies).
  1. Checks that the key file is live on www.
  2. Reads every URL in the live sitemap.
  3. POSTs them in one call to https://api.indexnow.org/indexnow, which shares the ping with Bing, Yandex, Seznam, Naver and others.
  - If the key file isn't live yet, it sends nothing and exits 0. `--dry-run` prints the payload.
- **When it runs:** `.github/workflows/indexnow.yml` fires on GitHub `deployment_status` events, only when Vercel reports a successful **Production** deployment, so the new sitemap and key file are already live. It can also be run by hand (workflow_dispatch). No repository secrets are used.
- **Verified:**
  - Unit tests (key file content, middleware entry, sitemap parsing, payload shape, workflow trigger) pass.
  - A dry run against live www read all 15 sitemap URLs. The key file is not live yet (404 until this merges), so the real ping was correctly skipped.
  - **After merge:** run the workflow once by hand (Actions, then IndexNow ping, then Run workflow) or wait for the next production deploy, and check for HTTP 200 or 202 in the job log.

## Kyle's rulings (2026-11-14, "yes" to all four picks)
1. **Founder name and metro on /about: done.**
   - The name and metro live in `src/lib/founder.ts` (`FOUNDER_NAME`, `BASED_IN`). Nothing else personal was added: no phone, street address or headshot.
   - **/about, value statement:** this sentence is appended: "D.scribe was founded in 2025 by Kyle Ingram and is based in Dallas-Fort Worth."
   - **/about, Key facts:** new rows "Founder: Kyle Ingram" and "Based in: Dallas-Fort Worth".
   - **Organization JSON-LD:** `founder: {Person, name: "Kyle Ingram"}`, plus `foundingLocation` and `location` set to Place "Dallas-Fort Worth".
     - Not `areaServed`: D.scribe is web software sold everywhere, and `areaServed` would read as a local-only service.
   - **`llms.txt` and `llms-full.txt`:** both carry the same founding sentence.
2. **Ghostwriter cost: one sourced range, everywhere.**
   - Source: **Reedsy, "How Much Does It Cost to Hire a Ghostwriter? [Rates and Fees]"** (updated Jun 2, 2026), https://reedsy.com/blog/guide/ghostwriter/cost-to-hire/
   - The quoted line: "a professional ghostwriter typically costs between $18,000 and $50,000 for nonfiction books". Checked 2026-11-14.
   - **Why Reedsy:** it gives one clear nonfiction range, and D.scribe's books are nonfiction. Gotham Ghostwriters' pricing page contradicts itself: its Basic tier is $40k-$60k in the table but $30k-$60k in the text.
   - **The constant:** `src/lib/ghostwriter-cost.ts`.
   - **/about:** "A professional ghostwriter typically costs $18,000 to $50,000 for a nonfiction book, according to Reedsy's pricing guide. D.scribe starts at $25 per month. Same outcome: a finished manuscript in your voice." It is followed by a linked "Source: Reedsy, …" line.
   - **/pricing:** "A professional ghostwriter typically costs $18,000 to $50,000 for a nonfiction book, according to Reedsy (linked), and the writing takes months."
     - The old unsourced "12–24 months" became "months", which the source supports.
   - **/pricing share image:** same range, with "(Reedsy)".
   - **`llms-full.txt`:** now includes that differentiator with the source URL.
   - **Guard:** a test fails if any of those files drops the shared constant or brings back an old figure.
3. **`kyle@d-scribe.app` stays** in the site-wide Organization data and `llms.txt`. No change.
4. **This merge cut:**
   - `seo-geo-merge` was built off fresh `origin/master` (`75569aa`).
   - It carries Phase 0, 1 and 2 plus the GEO results (cherry-picked), these docs, and the rulings above.
   - It leaves out the hero commit `58d3229` and everything in it: the poster image, the middleware `.webp` change and the landing-page change.

5. **Facebook Page added to `Organization.sameAs`** (https://www.facebook.com/profile.php?id=61594585703328).
   - The Page stopped showing the personal phone number (verified 2026-11-14 ~3:40pm).
   - The Page's public email stays dscribe.admin@gmail.com (Kyle's choice). That does not touch the site, so `kyle@d-scribe.app` remains the site contact.
   - The site has no visible social-link row, so sameAs is the only place it goes.
- **Verified (merge branch):**
  - Type check is clean.
  - Full suite: 52 of 52 files, 595 passed plus 1 expected-fail.
  - Local production build (`ce13e8e`): the structured-data check passes on 15 public pages.
  - The founding sentence, the Founder and Based in rows, and the Organization `founder`, `location` and `foundingLocation` all appear in the raw HTML.
  - The Reedsy range and its linked source appear on /about and /pricing. `llms.txt` and `llms-full.txt` carry both.
  - The /pricing share image returns 200.
  - No hero still is on the page, as intended.
- **Caught and fixed in that build check:** the /about comparison had lost the "$" before the plan price ("starts at 25 per month"). It now reads "$25", and a test pins it.

## Still open (Kyle or BMO)
1. **Hero (branch `seo-geo`, `58d3229`).** Kyle checks it on his iPhone: Low Power Mode off, the video starts a beat after load; on, the still holds and one tap starts it. It then ships on its own on top of master.
2. **After merge:** run Google's Rich Results Test and the Schema.org validator against www. Previews sit behind Vercel login, so neither tool can read them.
   - Expected Rich Results notice: SoftwareApplication wants `aggregateRating` or `review`. That stays out until real reviews exist.
3. **GEO coverage (logins).** Claude, Grok and the Perplexity website need a signed-in session, so they are "not checked" in the baseline.
   - For the weekly checker (Phase 6), the OpenAI, Gemini and Perplexity keys already exist.
   - Claude cannot use an API key under the subscription-only rule. It would run through a signed-in browser or the Claude Code CLI on the subscription.
4. ~~Facebook in sameAs~~: done (rulings item 5).
5. **Not done, needs a ruling or access:**
   - The `http://d-scribe.app` two-hop redirect (Vercel domain setting).
   - The landing-page performance pass: critical CSS, font families, splitting the client component.
   - An on-page FAQ for /pricing (copy).
