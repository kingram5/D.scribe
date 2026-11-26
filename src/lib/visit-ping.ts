// Server-side helpers for POST /api/attribution/visit (anonymous visit counts
// by channel, growth dashboard, Kyle 2026-11-25). Kept out of the route file
// because Next.js only allows HTTP-method exports there.

import { createHash } from "crypto";
import { deriveChannel, type VisitChannel } from "@/lib/channels";

export const VISIT_MAX_BODY_BYTES = 4 * 1024;
export const VISIT_RATE_LIMIT_PER_HOUR = 30;
const MAX_REFERRER = 2048;
const MAX_UTM = 200;

// Crawlers that run JavaScript (Googlebot renders pages) keep no storage, so
// every render would look like a brand-new browser and inflate "Direct". Real
// browsers always send a user agent; an empty one is treated as a bot.
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|whatsapp|python|curl|wget|httpclient|okhttp|axios|node-fetch|undici|go-http|java\/|vercel/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return !ua || BOT_UA.test(ua);
}

/**
 * Rate-limit key for an anonymous caller. The limiter's table keeps keys for
 * the window, so the IP is hashed (with a server secret, so the IPv4 space
 * can't simply be enumerated back) and never stored as-is.
 */
export function hashedIpKey(ip: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return `visit:${createHash("sha256").update(`dscribe-visit:${secret}:${ip}`).digest("hex").slice(0, 24)}`;
}

/**
 * True when an Origin header is present and names none of the hosts this
 * request was served on (another site posting from a visitor's browser). The
 * served host is taken from every place a proxy may put it (URL, Host,
 * X-Forwarded-Host), so a platform rewrite of one of them can't make every
 * real visit look foreign.
 */
export function isForeignOrigin(origin: string | null, servedHosts: readonly (string | null | undefined)[]): boolean {
  if (!origin) return false;
  let host = "";
  try { host = new URL(origin).host.toLowerCase(); } catch { return true; }
  const served = servedHosts.flatMap((h) => (h ?? "").split(",")).map((h) => h.trim().toLowerCase()).filter(Boolean);
  return !served.includes(host);
}

/**
 * The channel for a ping body. Only the referrer and utm_source / utm_medium
 * the browser recorded on its first page are read, clipped, and run through
 * the shared deriveChannel(); any channel name the client sends is ignored.
 * null = the body is not an object (malformed).
 */
export function channelFromPingBody(body: unknown): VisitChannel | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return deriveChannel({
    referrer: str(o.referrer, MAX_REFERRER),
    utmSource: str(o.utm_source, MAX_UTM),
    utmMedium: str(o.utm_medium, MAX_UTM),
  });
}
