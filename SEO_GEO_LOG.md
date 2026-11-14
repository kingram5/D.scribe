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

## Phase 3b: "How did you hear about us?" (branch `signup-attribution`, Kyle approved 2026-11-14)
- **Where it appears:**
  - Sign-up is Google or a magic link, with no form, so the question is a first-run dialog in the signed-in app's layout.
  - It shows for an account that has no answer and no project yet, before the first book.
- **Required:** there is no skip or close control, and Continue stays disabled until an option is chosen. The API rejects a missing or unknown answer with a 400.
- **Options:** the plan's 13, verbatim, shuffled on every showing with Other last. Other opens an optional free-text box (200 characters).
- **Passive capture (first visit, this browser):** the landing path plus `utm_*` only, the referrer's origin and path (query stripped), a no-referrer flag and a timestamp, kept in localStorage under `ds_first_touch`.
  - Never on app or auth paths.
  - Skipped and cleared when the visitor has declined analytics in the cookie banner.
  - Sent once, with the answer, then cleared.
  - "Nothing captured" is stored as `null`, which is different from "captured, no referrer".
- **AI tagging (server):** the POST route tags chatgpt.com / chat.openai.com, perplexity.ai, claude.ai, gemini.google.com and copilot.microsoft.com by exact host or subdomain (never a substring match), plus `utm_source` values such as `chatgpt.com`.
  - Inputs are browser-supplied, so treat them as a signal, not proof.
- **Storage:** new table `user_attribution`, one row per account (there is no profiles table).
  - Migration: `supabase/migrations/033_signup_attribution.sql`. It is 033 because 032 is the ChatGPT app's.
  - RLS matches 031: read your own row only. All writes go through server code with the service role.
  - The row is deleted with the account (cascade), plus a best-effort explicit delete in `/api/account/delete`.
  - Rollback: `supabase/rollbacks/033_signup_attribution_rollback.sql`, kept outside `migrations/` on purpose.
- **Fails soft:** with the table missing or any query failing, GET says the question isn't needed and POST answers 200 `{stored:false}`. A deploy before the migration cannot block signup.
- **Admin:** `/admin/attribution`, behind the same admin gate as `/admin/partners` (session only).
  - It shows answers by source, by UTC week (last 12), what people said vs what the first-visit referrer shows, the AI self-reported vs passive gap, conversion to paid by source, and the "Other" answers.
  - "Paid" means on a paid plan now: tier is not Free and the account is not a comp partner account.
- **Verified:**
  - Type check is clean.
  - Full suite: 54 of 54 files, 622 passed plus 1 expected-fail.
  - New tests cover: required answer (400 and disabled Continue), shuffle keeping Other last, persistence (first touch never overwritten, app paths skipped, cleared on declined analytics), AI tagging including look-alike hosts, fail-soft GET and POST, admin summary, and the SQL value lists matching the code.
  - The dialog UI was checked as a static render in headless Chrome at 390 px and 1280 px. It has not been seen in the signed-in app.
- **Deploy order:**
  1. Kyle runs `033_signup_attribution.sql` in the Supabase SQL editor.
  2. Merge. Either order is safe, but migration first means answers are captured from the first deploy.
- **Kyle items:**
  - Run the migration.
  - The privacy policy does not mention referrer or UTM collection or the signup question. Consider one line before this goes live.
