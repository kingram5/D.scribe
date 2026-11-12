// The one public origin for canonicals, the sitemap, robots.txt and JSON-LD.
// www is the host that actually serves: the apex d-scribe.app 308s to it (Vercel
// domain setting), and the Stripe webhook, Google OAuth / Drive redirect URIs and
// the Supabase auth site URL are all registered on www. Until 2026-10-30 every
// canonical and sitemap URL named the apex, so Google was told "home is
// d-scribe.app" and then redirected away from it on every page.
export const SITE_URL = "https://www.d-scribe.app";
