import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public marketing + legal surfaces are crawlable; the app itself and the API are not.
// Served at /robots.txt (the middleware lists it as a public path).
const ALLOW = ["/", "/pricing", "/about", "/blog", "/vs", "/partners", "/discover", "/legal/", "/llms.txt", "/llms-full.txt"];
// Spelled out rather than built from APP_PREFIXES: "/partner" there would
// prefix-block the public /partners page.
const DISALLOW = ["/api/", "/dashboard", "/project/", "/settings", "/auth/", "/login", "/unauthorized"];

// AI answer-engine and search crawlers, named so the welcome is explicit
// (SEO/GEO plan Phase 1, 2026-11-14). A crawler obeys only its most specific
// group, so this group must repeat the disallows: a named group with just
// "Allow: /" would let these bots into /api/ and the signed-in app.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Bingbot",
  "CCBot",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ALLOW, disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: ALLOW, disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
