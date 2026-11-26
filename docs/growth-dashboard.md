# Growth dashboard (`/admin/growth`)

Which marketing channels bring visitors, sign-ups and paying customers.
Built 2026-11-25 so Kyle and Chiara can see which platforms work and which
don't, without opening Supabase.

Open it signed in at **https://www.d-scribe.app/admin/growth**. Pick
**Last 7 / 30 / 90 days** at the top (`?days=` keeps the choice in the link).
Anyone without access gets a plain "Not found".

## What each number means

| Number | Meaning |
|---|---|
| **Visits** | A browser's *first ever* visit to the site, counted under the channel that sent it. Returning visitors are not counted again. The count is sent as the first page loads, so it happens before a new visitor answers the cookie banner; browsers that already declined analytics, and obvious bots, are not counted. Nothing personal is stored: only a count per day per channel. |
| **Sign-ups** | New accounts in the window that answered "How did you hear about D.scribe?" (asked before the first book). Each is placed in the channel of *its own first visit* (same rules as visits). |
| **Said so** | Of the sign-ups in the window, how many *named* this channel in their answer. Instagram and TikTok often hide where a click came from, so those people show up under Direct; "Said so" is the better signal for them. |
| **Paying** | Of those sign-ups, how many are on a paid plan right now: an active subscription or a paid tier. Complimentary partner accounts never count. Cancelled accounts count as not paying. |
| **Visit → sign-up** | Sign-ups ÷ visits for that channel. |
| **Sign-up → paying** | Paying ÷ sign-ups for that channel. |
| **—** | Not enough data for a rate yet: no visits counted for that channel, or more sign-ups than counted visits (accounts that started before visit counting). |

Channel groups (the dashboard groups, the database keeps the finer keys):

- **Instagram, TikTok, Facebook, YouTube, Reddit, Email**: one each.
- **Search (Google, Bing)**: Google, Bing and other engines (DuckDuckGo, Yahoo, Brave, Ecosia), broken out underneath.
- **AI assistants**: ChatGPT, Perplexity, Gemini, Claude, Copilot, broken out underneath.
- **Other social (X, LinkedIn)**: X, LinkedIn, Threads, Pinterest, Bluesky.
- **Direct / unknown**: no referrer (typed, bookmarked, or an app that hid the link), plus "Not captured" (a sign-up whose device never recorded a first visit: another device, or analytics declined).
- **Other sites**: any other website that linked to us.

How a visit's channel is decided (`src/lib/channels.ts`, one function for
visits and sign-ups):

1. `utm_source` on the landing link wins (`ig`/`instagram`, `tiktok`, `fb`/`facebook`, `google`, `chatgpt.com`, `perplexity`, `gemini`, `claude`, `youtube`, `reddit`, `linkedin`, `x`/`twitter`, `email`/`newsletter`, ...). An unknown source counts as Other (or Email when `utm_medium=email`).
2. Otherwise the referrer's host, matched exactly or as a subdomain, never as a substring (`l.instagram.com` is Instagram, `notchatgpt.com` is not ChatGPT). Our own pages count as Direct.
3. No referrer at all is Direct.

**Tag your own links.** Put `?utm_source=instagram` (or `tiktok`, `facebook`, ...) on every link in a bio, post or ad. Without it, app traffic mostly lands in Direct.

**Visits started counting on the day this shipped** (the dashboard shows the
date). Earlier sign-ups have no visits to compare against, which is why some
rates show "—" at first. Visits for a browser that first came before launch
are counted on its first visit after launch.

For raw traffic, referrers and top pages, use the **Vercel Analytics** link at
the bottom of the page (needs a login on the D.scribe Vercel team). Web
Analytics must be switched on once in the Vercel project (Project → Analytics →
Enable).

## Adding a viewer (e.g. Chiara)

1. In Vercel → Project → Settings → Environment Variables (Production), set
   `GROWTH_VIEWER_EMAILS` to a comma-separated list of the exact sign-in
   emails, e.g. `first.viewer@example.com,second.viewer@example.com`.
   Matching is exact and case-insensitive; no plus/dot folding, no wildcards.
2. Redeploy (env changes apply to new deployments only).
3. The viewer signs in to D.scribe with that email (Google or magic link, a
   confirmed email is required) and opens `/admin/growth`.

Viewers see this dashboard only: no partner admin, no payouts, no other admin
page. They are never shown the "How did you hear about us?" question, so their
own account stays out of the sign-up numbers. Partner admins
(`PARTNER_ADMIN_EMAILS`) always have access and need no extra setting.

Optional: `GROWTH_VERCEL_ANALYTICS_URL` overrides the Vercel Analytics link.

## The migration step (once)

Everything reads from tables created by
`supabase/migrations/033_signup_attribution.sql`:

- `user_attribution`: one row per account (the signup answer + first-visit referrer/UTM)
- `visit_channel_daily`: anonymous visit counts per UTC day per channel
- `bump_visit_channel(text)`: the only way to add a visit (service role only)

Paste the whole file into the Supabase SQL editor (production project) and run
it once. It is additive (no change to existing tables) and safe to run again.
The app fails soft until it is applied: no question is asked, visits are not
counted, and the dashboard says to run the migration. Undo:
`supabase/rollbacks/033_signup_attribution_rollback.sql` (deletes the tables
and their data).

## Where the code lives

- `src/lib/channels.ts`: channel rules and groups
- `src/lib/growth.ts`: the dashboard's aggregation
- `src/app/api/attribution/visit/route.ts`: the anonymous visit ping (rate-limited per hashed IP, bots and declines dropped)
- `src/components/attribution/FirstTouchCapture.tsx`: records the first visit and sends the one ping
- `src/app/api/admin/growth/route.ts` + `src/app/(main)/admin/growth/page.tsx` + `src/components/growth/GrowthDashboard.tsx`: the dashboard
- `src/lib/growth-access.ts`, `src/lib/growth-viewers.ts`: who may open it
- `/dev/growth` (development only): the dashboard with made-up numbers, `?state=full|empty|no-visits|unavailable`
