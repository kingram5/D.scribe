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
  - Full suite: 567 of 570 pass, 1 expected-fail. The rest were 5-second timeouts in `plans-v2.test.ts` under full-suite load; that file passes 4 of 4 on its own.
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

## Blocked on Kyle
1. **Founder name and location on /about (ruling).**
   - The plan asks for "Kyle Ingram" and "Dallas-Fort Worth" on /about and in the Organization data.
   - A standing site rule (2026-09-19) says no personal info on the site: no name, location, headshot or Person schema.
   - The narrower standing rule wins until Kyle lifts it, so this branch adds neither.
   - Pick: allow the name plus the metro area only (no headshot, no street address). Entity clarity is the main thing AI engines reward on an about page. It is a five-minute change once approved.
2. **Ghostwriter cost figure (ruling).** /about says $10k-$50k and /pricing says $30k-$80k. Pick one range and give a source to cite. Until then neither figure is repeated in `llms.txt`.
