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

## Blocked on Kyle
1. **Founder name and location on /about (ruling).**
   - The plan asks for "Kyle Ingram" and "Dallas-Fort Worth" on /about and in the Organization data.
   - A standing site rule (2026-09-19) says no personal info on the site: no name, location, headshot or Person schema.
   - The narrower standing rule wins until Kyle lifts it, so this branch adds neither.
   - Pick: allow the name plus the metro area only (no headshot, no street address). Entity clarity is the main thing AI engines reward on an about page. It is a five-minute change once approved.
2. **Ghostwriter cost figure (ruling).** /about says $10k-$50k and /pricing says $30k-$80k. Pick one range and give a source to cite. Until then neither figure is repeated in `llms.txt`.
