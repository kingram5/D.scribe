#!/usr/bin/env node
// IndexNow ping (SEO/GEO plan Phase 3, 2026-11-14): tells Bing, Yandex, Seznam,
// Naver and other IndexNow engines that the sitemap's URLs changed, right after
// a production deploy. Bing feeds ChatGPT search and Copilot, so this matters
// for AI visibility too.
//
// The key is PUBLIC by design (IndexNow proves ownership by fetching
// https://<host>/<key>.txt and comparing). It is served from public/<key>.txt
// and listed in the middleware's PUBLIC_PATHS. No secrets here.
//
// Usage:
//   node scripts/indexnow-ping.mjs            ping the live sitemap's URLs
//   node scripts/indexnow-ping.mjs --dry-run  print the payload, send nothing
//   SITE_URL=https://www.d-scribe.app        override the host (default www)
//
// Run by .github/workflows/indexnow.yml when Vercel reports a successful
// Production deployment, and by hand any time.

export const INDEXNOW_KEY = "37914b4d2ff2dd4260d62c0be0a12eaa";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** All <loc> URLs in a sitemap, deduplicated, limited to `host`. */
export function sitemapUrls(xml, host) {
  const urls = [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return [...new Set(urls)].filter((u) => { try { return new URL(u).host === host; } catch { return false; } });
}

/** The IndexNow JSON body (https://www.indexnow.org/documentation). */
export function buildPayload(siteUrl, urls, key = INDEXNOW_KEY) {
  const origin = new URL(siteUrl).origin;
  return { host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList: urls.slice(0, 10000) };
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const site = (process.env.SITE_URL || "https://www.d-scribe.app").replace(/\/$/, "");
  const host = new URL(site).host;

  // 1. The key file must be live on this host, or IndexNow rejects the ping (403).
  const keyRes = await fetch(`${site}/${INDEXNOW_KEY}.txt`, { redirect: "follow" });
  const keyText = keyRes.ok ? (await keyRes.text()).trim() : "";
  if (keyText !== INDEXNOW_KEY) {
    console.log(`IndexNow: key file not live at ${site}/${INDEXNOW_KEY}.txt (HTTP ${keyRes.status}).`);
    // Not an error before the first deploy that ships the file: send nothing, exit 0.
    if (!dry) return;
  }

  // 2. Every URL in the live sitemap.
  const smRes = await fetch(`${site}/sitemap.xml`);
  if (!smRes.ok) throw new Error(`sitemap.xml returned HTTP ${smRes.status}`);
  const urls = sitemapUrls(await smRes.text(), host);
  if (urls.length === 0) throw new Error("sitemap.xml had no URLs for this host");
  const payload = buildPayload(site, urls);

  if (dry) {
    console.log(JSON.stringify({ keyFileLive: keyText === INDEXNOW_KEY, ...payload }, null, 2));
    return;
  }

  // 3. One POST covers every URL. 200/202 = accepted.
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await res.text().catch(() => "");
  console.log(`IndexNow: HTTP ${res.status} for ${urls.length} URLs${body ? `: ${body.slice(0, 200)}` : ""}`);
  if (res.status !== 200 && res.status !== 202) process.exitCode = 1;
}

// Only run when executed directly, not when imported by tests.
if ((process.argv[1] ?? "").replace(/\\/g, "/").endsWith("scripts/indexnow-ping.mjs")) {
  main().catch((e) => { console.error(`IndexNow: ${e.message}`); process.exitCode = 1; });
}
