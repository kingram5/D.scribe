# D.Scribe SEO + GEO audit (Phase 0 baseline)

Run 2026-11-14 against the live site, https://www.d-scribe.app. Read-only: nothing on the live site was changed to produce this.

## Stack and hosting
- Next.js 15 App Router on Vercel. Supabase handles auth and data.
- Every public marketing page renders on the server. The raw HTML carries the title, description, canonical, H1 and body text without JavaScript.
  - The home page is a client component, but it is server-rendered too (1,601 words in the raw HTML).
- **Canonical host: `https://www.d-scribe.app`.**
  - `https://d-scribe.app/*` returns 308 to www.
  - `http://www.d-scribe.app/` returns 308 to https.
  - `http://d-scribe.app/` takes two hops (308 to https apex, then 308 to www). Minor; this is a Vercel domain setting.

## Baseline numbers

### Indexing readiness
- **Sitemap: 15 URLs, all return 200, all carry lastmod, all self-canonical on www.**
- Crawled 17 public routes from the home page plus the sitemap:
  - The 15 sitemap URLs.
  - `/login`: blocked in robots.txt. No canonical, and its title duplicates home. Harmless while blocked.
  - `/discover`: noindex on purpose; it is an empty shell with 0 public books.
- Unknown paths return a real 404 (`/this-does-not-exist-xyz` = 404, `/blog/nonexistent-post` = 404). App paths send anonymous visitors 307 to `/login?next=`.
- robots.txt is served, has a `Sitemap:` line, and disallows only app and API paths.
- **AI crawler access: all 11 user agents in the plan get 200** on `/`, `/pricing` and `/robots.txt`. Each was tested twice, once with the bare UA string and once with a browser-style UA embedding it, so no Vercel firewall or WAF rule blocks them.
  - The 11: GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, anthropic-ai, PerplexityBot, Google-Extended, Bingbot, CCBot, Applebot-Extended.
- `/llms.txt` = 404. `/llms-full.txt` = 404.

### Per-route crawl (Googlebot UA, no JavaScript)
| Route | Status | Title len | Desc len | H1 | Words | JSON-LD types |
|---|---|---|---|---|---|---|
| / | 200 | 56 | **165** | There's an Author Inside You | 1,601 | Organization, WebPage, FAQPage |
| /pricing | 200 | 58 | **175** | Write your book. Pick the plan that fits. | 438 | WebPage, Organization, Product |
| /about | 200 | 16 | 76 | Why I built this | 1,320 | Organization |
| /blog | 200 | 51 | **192** | Turning your voice into a published book | 107 | Blog |
| /vs | 200 | 27 | 117 | How D.scribe compares | 143 | none |
| /vs/builtwritten | 200 | 36 | **214** | D.scribe vs Built&Written | 559 | FAQPage, BreadcrumbList |
| /vs/squibler | 200 | 31 | **161** | D.scribe vs Squibler | 510 | FAQPage, BreadcrumbList |
| /vs/dictate | 200 | 30 | **239** | D.scribe vs Dictate | 540 | FAQPage, BreadcrumbList |
| /partners | 200 | 53 | **164** | Your audience has books in them... | 204 | none |
| /legal/partners | 200 | 32 | 133 | Partner Program Terms | 580 | none |
| /legal/terms | 200 | 27 | 105 | Terms of Service | 1,221 | none |
| /legal/privacy | 200 | 25 | 117 | Privacy Policy | 1,317 | none |
| /legal/refunds | 200 | 41 | 112 | Refund and Cancellation Policy | 376 | none |
| /legal/acceptable-use | 200 | 32 | 89 | Acceptable Use Policy | 192 | none |
| /legal/dmca | 200 | 22 | 112 | DMCA Policy | 178 | none |

- Title lengths include the ` | D.scribe` suffix, and all are under 60.
- Every page has exactly one H1 and a self-referencing www canonical.
- Bold description lengths are over 155 characters and get cut off in search results.

### Lighthouse (v12.8, throttled headless run, 2026-11-14)
| Page | Mobile perf | Mobile LCP | Mobile TBT | Desktop perf | SEO (m/d) | A11y | Best practices |
|---|---|---|---|---|---|---|---|
| / | **62** | **6.3 s** | 510 ms | 89 | 92 / 92 | 95 | 96 |
| /pricing | 75 | 5.3 s | 260 ms | 99 | 100 / 100 | 96 | 96 |
| /about | 80 | 4.8 s | 180 ms | 100 | 100 / 100 | 96 | 96 |
| /vs/squibler | 90 | 3.0 s | 240 ms | 98 | 100 / 100 | 96 | 96 |
| /partners | 79 | 4.8 s | 200 ms | 99 | 100 / 100 | 92 | 96 |

- CLS is 0 on every page and form factor.
- Page choice: home and pricing were required. The next three by sitemap priority and template variety were /about, a /vs page and /partners. No analytics data was used.
- **Home LCP element: the autoplay hero `<video>`.** It loads in 0.5 s, then waits 5.1 s for render delay behind the landing page's JavaScript.
- **Pricing, /about and /partners LCP element: a server-rendered paragraph** with 4.1-4.6 s of render delay.
  - The likely cause is the font payload: 16 families are declared and about 8 are preloaded. Not yet proven.

### Structured data
- Three different Organization blocks: home (name, url, description), pricing (name, url) and about (adds foundingDate plus a hard-coded 25/50/100 offer list).
  - No `@id` links them. None carries a logo or sameAs.
- No WebSite entity anywhere.
- Pricing uses `Product`, not `SoftwareApplication`.
- No SoftwareApplication anywhere.
- No aggregateRating anywhere. That is correct, since no real reviews exist.

### Open Graph and social cards
- og:image is present on /, /pricing, /partners, /discover and all /legal pages.
- **og:image is missing on /about, /blog, /vs and the three /vs/* pages.** Their page-level openGraph object replaces the inherited generated image, so the `summary_large_image` Twitter card has no image there.

### Favicon set
- Only a 16x16 `favicon.ico` is served.
- `/apple-touch-icon.png`, `/icon.png` and a web manifest all 404.

## Prioritized issues

**P1: AI visibility (GEO)**
1. No `/llms.txt` or `/llms-full.txt`.
   - Note: the middleware does not exclude `.txt` from auth, so any new public file path must also go on the middleware's public list or it 404s for crawlers.
2. robots.txt names no AI crawlers. Access works today through `User-agent: *`; explicit groups make the intent unambiguous.
3. Entity data is fragmented: three different Organization blocks, no WebSite, no logo, no sameAs, Product instead of SoftwareApplication.
   - The about page's offer prices are hard-coded and would go stale the day the v2 plan prices switch on.
4. **/about has no founder name and no location.** This is deliberate (an earlier site-wide no-personal-info ruling), but the plan asks for both. Needs a ruling; see SEO_GEO_LOG.md. **Resolved 2026-11-14:** name and metro added on Kyle's word.
5. Thin content: the blog has 0 posts (107 words on /blog) and /vs is 143 words. There is no guide or answer content for AI engines to cite. This is Phase 4.
6. **The ghostwriter cost claim contradicts itself:** /about says "$10,000 to $50,000 per book" and /pricing says "$30,000-$80,000". Neither cites a source. AI engines quote numbers, so pick one and source it. **Resolved 2026-11-14:** both now use Reedsy's $18,000-$50,000 nonfiction range, with the source cited.

**P2: technical SEO**
7. **Mobile performance:** home 62 (LCP 6.3 s, the hero video), pricing 75, partners 79, about 80.
8. Meta descriptions over 155 characters on 7 pages: /, /pricing, /blog, /partners and the three /vs/* pages.
9. og:image missing on /about, /blog, /vs and /vs/*.
10. Sitemap lastmod for /, /pricing and /blog is the request time, so it changes on every fetch. Search engines learn to ignore a lastmod that is always "now".
11. Incomplete favicon set: no apple-touch-icon and no PNG icon.
12. Pricing has no on-page FAQ. The plan wants one for quotable price answers.

**P3: polish**
13. Accessibility: color contrast fails on all 5 audited pages (5 items on home, 20 on pricing).
    - The home hero CTA text is "HERE". It fails Lighthouse's descriptive-link-text check and is the only SEO deduction on home (92). The pill was kept on purpose.
14. Console noise:
    - The report-only CSP includes `upgrade-insecure-requests`, which browsers ignore in report-only mode (a warning on every page).
    - /pricing logs one 401 from a signed-out fetch.
15. `http://d-scribe.app` takes two redirect hops to reach www.

## GEO and SERP baseline
Full detail is in `geo-baseline.md`.

- **AI engines: D.Scribe was named in 0 of 30 answers.**
  - ChatGPT was checked signed out.
  - Gemini was checked in a temporary chat.
  - Perplexity was checked through the Sonar API, because the website asks signed-out visitors to sign up.
  - Claude and Grok were not checked: both need a login.
- **Named instead:** Claude, ChatGPT, Descript, Otter.ai, Sudowrite, Scrivener, Squibler, Built&Written, Novelcrafter, Remento. The niche voice-to-book names were Aligned and SermonBook.ai (sermons) and Memoir.bot and MemoirMaker (memoir).
- **Google:**
  - d-scribe.app ranks #1 for "d-scribe.app", "D.Scribe book app" and "D.Scribe voice to book".
  - It ranks #4 for bare "D.Scribe", behind dscryb.com, dscribe.in and dscribeapp.com.
  - It is absent from the top 15 for "dscribe app" and for all 10 intent queries.
  - No knowledge panel.
