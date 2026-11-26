// "How did you hear about us?" plus first-visit (passive) attribution.
// SEO/GEO plan Phase 3b, approved by Kyle 2026-11-14.
//
// Pure logic only (client-safe, no I/O), so the rules can be tested without a
// browser or a database:
//   - the 16 answer options (the plan's 13, with "Social media" split into
//     Instagram, TikTok, Facebook and Other social on 2026-11-25 so each
//     platform can be judged on its own), shuffled with Other last
//   - validation of the answer
//   - the first-touch record built on a visitor's first page view
//   - tagging AI-assistant referrers (exact host or dot-suffix, never substring)
//   - the admin summary (by source, by UTC week, self-reported vs passive, paid)
//
// Storage is the user_attribution table (migration 033). The server writes it
// with the service role; signed-in users can only read their own row.

export const ATTRIBUTION_OPTIONS = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "perplexity", label: "Perplexity" },
  { value: "gemini", label: "Gemini" },
  { value: "google", label: "Google search" },
  { value: "bing", label: "Bing" },
  { value: "reddit", label: "Reddit" },
  { value: "youtube", label: "YouTube" },
  { value: "podcast", label: "Podcast" },
  { value: "friend", label: "Friend or colleague" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "social", label: "Other social (X, LinkedIn)" },
  { value: "directory", label: "Product Hunt or a directory" },
  { value: "other", label: "Other" },
] as const;

export type AttributionSource = (typeof ATTRIBUTION_OPTIONS)[number]["value"];
export type AttributionOption = (typeof ATTRIBUTION_OPTIONS)[number];

export const ATTRIBUTION_VALUES: readonly AttributionSource[] = ATTRIBUTION_OPTIONS.map((o) => o.value);

/** Self-reported answers that name an AI assistant. */
export const AI_SOURCES: readonly AttributionSource[] = ["chatgpt", "claude", "perplexity", "gemini"];

export const MAX_DETAIL = 200;

/**
 * Options in a fresh random order (Fisher-Yates) to reduce position bias, with
 * Other always last. `random` is injectable for tests.
 */
export function shuffledOptions(random: () => number = Math.random): AttributionOption[] {
  const rest = ATTRIBUTION_OPTIONS.filter((o) => o.value !== "other") as AttributionOption[];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...rest, ATTRIBUTION_OPTIONS[ATTRIBUTION_OPTIONS.length - 1]];
}

export type AnswerResult =
  | { ok: true; source: AttributionSource; detail: string | null }
  | { ok: false; error: string };

/**
 * The answer is required: a missing or unknown source is rejected. The free
 * text belongs to Other only (optional, trimmed, capped); any other source
 * drops it.
 */
export function validateAnswer(source: unknown, detail: unknown): AnswerResult {
  if (typeof source !== "string" || !ATTRIBUTION_VALUES.includes(source as AttributionSource)) {
    return { ok: false, error: "Please choose how you heard about D.scribe." };
  }
  const s = source as AttributionSource;
  if (s !== "other") return { ok: true, source: s, detail: null };
  const text = typeof detail === "string" ? detail.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL) : "";
  return { ok: true, source: s, detail: text || null };
}

// ── First touch (passive) ─────────────────────────────────────────────────────

export const FIRST_TOUCH_KEY = "ds_first_touch";
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

export interface FirstTouch {
  /** Landing path plus utm_* only. Every other query parameter is dropped. */
  landing_url: string;
  /** Referrer origin + path, query and hash stripped. "" when the browser sent none. */
  referrer: string;
  /** True when the first visit carried no referrer ("captured, no referrer"). */
  null_referrer: boolean;
  utm: Partial<Record<UtmKey, string>>;
  captured_at: string;
}

const MAX_URL = 2048;
const MAX_UTM = 200;

/** Build the first-touch record from the first page's URL and document.referrer. */
export function buildFirstTouch(href: string, referrer: string, now: Date = new Date()): FirstTouch | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const utm: Partial<Record<UtmKey, string>> = {};
  const kept = new URLSearchParams();
  for (const k of UTM_KEYS) {
    const v = url.searchParams.get(k);
    if (v) { const t = v.trim().slice(0, MAX_UTM); if (t) { utm[k] = t; kept.set(k, t); } }
  }
  const qs = kept.toString();
  let ref = "";
  if (referrer) {
    try { const r = new URL(referrer); ref = `${r.origin}${r.pathname}`.slice(0, MAX_URL); } catch { ref = ""; }
  }
  return {
    landing_url: `${url.pathname}${qs ? `?${qs}` : ""}`.slice(0, MAX_URL),
    referrer: ref,
    null_referrer: !ref,
    utm,
    captured_at: now.toISOString(),
  };
}

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Store the first touch once per browser. Never overwrites an earlier one, skips
 * the signed-in app and auth callbacks, and clears anything stored when the
 * visitor has declined analytics. Returns what is stored afterwards (or null).
 */
export function recordFirstTouch(
  storage: KV,
  href: string,
  referrer: string,
  opts: { analyticsDeclined: boolean; isAppPath: (path: string) => boolean; now?: Date },
): FirstTouch | null {
  if (opts.analyticsDeclined) { storage.removeItem(FIRST_TOUCH_KEY); return null; }
  const existing = parseFirstTouch(storage.getItem(FIRST_TOUCH_KEY));
  if (existing) return existing;
  let path = "";
  try { path = new URL(href).pathname; } catch { return null; }
  if (opts.isAppPath(path) || path.startsWith("/auth/")) return null;
  const touch = buildFirstTouch(href, referrer, opts.now);
  if (touch) storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
  return touch;
}

/** Parse a stored first-touch value defensively (it comes from the browser). */
export function parseFirstTouch(raw: unknown): FirstTouch | null {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return null; } }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  const landing = str(o.landing_url, MAX_URL);
  if (!landing.startsWith("/")) return null;
  let referrer = "";
  const rawRef = str(o.referrer, MAX_URL);
  if (rawRef) { try { const r = new URL(rawRef); if (r.protocol === "https:" || r.protocol === "http:") referrer = `${r.origin}${r.pathname}`.slice(0, MAX_URL); } catch { referrer = ""; } }
  const utm: Partial<Record<UtmKey, string>> = {};
  const rawUtm = (o.utm && typeof o.utm === "object" ? o.utm : {}) as Record<string, unknown>;
  for (const k of UTM_KEYS) { const t = str(rawUtm[k], MAX_UTM).trim(); if (t) utm[k] = t; }
  const at = str(o.captured_at, 40);
  return {
    landing_url: landing,
    referrer,
    null_referrer: !referrer,
    utm,
    captured_at: Number.isNaN(Date.parse(at)) ? "" : new Date(at).toISOString(),
  };
}

// ── AI referrer tagging ───────────────────────────────────────────────────────

export type AiEngine = "chatgpt" | "perplexity" | "claude" | "gemini" | "copilot";

const AI_HOSTS: readonly [string, AiEngine][] = [
  ["chatgpt.com", "chatgpt"],
  ["chat.openai.com", "chatgpt"],
  ["perplexity.ai", "perplexity"],
  ["claude.ai", "claude"],
  ["gemini.google.com", "gemini"],
  ["copilot.microsoft.com", "copilot"],
];

// utm_source values AI assistants and our own AI-facing links use.
const AI_UTM: Record<string, AiEngine> = {
  "chatgpt.com": "chatgpt", chatgpt: "chatgpt", openai: "chatgpt",
  "perplexity.ai": "perplexity", perplexity: "perplexity",
  "claude.ai": "claude", claude: "claude", anthropic: "claude",
  "gemini.google.com": "gemini", gemini: "gemini",
  "copilot.microsoft.com": "copilot", copilot: "copilot",
};

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Which AI assistant sent the visitor, from the referrer host or utm_source. */
export function classifyAiReferrer(referrer: string | null | undefined, utmSource: string | null | undefined): AiEngine | null {
  if (referrer) {
    let host = "";
    try { host = new URL(referrer).hostname.toLowerCase(); } catch { host = ""; }
    for (const [domain, engine] of AI_HOSTS) if (host && hostMatches(host, domain)) return engine;
  }
  const u = (utmSource ?? "").trim().toLowerCase();
  return u && AI_UTM[u] ? AI_UTM[u] : null;
}

/** Coarse passive channel for the self-reported vs passive comparison. */
export function passiveChannel(row: { ai_referrer: string | null; referrer: string | null; utm_source: string | null; null_referrer: boolean | null }): string {
  if (row.ai_referrer) return `ai:${row.ai_referrer}`;
  if (row.utm_source) return `utm:${row.utm_source.toLowerCase()}`;
  if (row.referrer) {
    let host = "";
    try { host = new URL(row.referrer).hostname.toLowerCase().replace(/^www\./, ""); } catch { host = ""; }
    if (/^(.+\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return "google";
    const known: [string, string][] = [["bing.com", "bing"], ["reddit.com", "reddit"], ["youtube.com", "youtube"], ["youtu.be", "youtube"], ["facebook.com", "facebook"], ["instagram.com", "instagram"], ["linkedin.com", "linkedin"], ["t.co", "x"], ["x.com", "x"], ["twitter.com", "x"], ["tiktok.com", "tiktok"], ["d-scribe.app", "internal"]];
    for (const [domain, name] of known) if (host && hostMatches(host, domain)) return name;
    return host ? `site:${host}` : "unknown";
  }
  if (row.null_referrer === true) return "none";
  return "not captured";
}

// ── Admin summary ─────────────────────────────────────────────────────────────

/** How the admin view counts "paid". */
export const PAID_DEFINITION = "On a paid plan now: plan tier is not Free and it is not a complimentary partner account. Cancelled accounts count as unpaid.";

export interface AttributionRow {
  user_id: string;
  attribution_source: string;
  attribution_detail: string | null;
  landing_url: string | null;
  referrer: string | null;
  null_referrer: boolean | null;
  utm_source: string | null;
  ai_referrer: string | null;
  created_at: string;
}

/** Monday 00:00 UTC of the week containing `iso`, as YYYY-MM-DD. */
export function utcWeekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}

export interface AttributionSummary {
  total: number;
  paidTotal: number;
  bySource: { source: string; label: string; count: number; paid: number; conversionPct: number }[];
  byWeek: { week: string; total: number; bySource: Record<string, number> }[];
  selfVsPassive: { source: string; passive: string; count: number }[];
  ai: { selfReported: number; passive: number; both: number; selfReportedPct: number; passivePct: number };
  otherDetails: string[];
}

const labelFor = (v: string) => ATTRIBUTION_OPTIONS.find((o) => o.value === v)?.label ?? v;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/** Aggregate rows. `paidUserIds` = accounts on a paid plan now (see the admin API for the definition). */
export function summarizeAttribution(rows: AttributionRow[], paidUserIds: ReadonlySet<string>, weeks = 12, now: Date = new Date()): AttributionSummary {
  const bySource = new Map<string, { count: number; paid: number }>();
  const byWeek = new Map<string, Map<string, number>>();
  const cross = new Map<string, number>();
  let paidTotal = 0, aiSelf = 0, aiPassive = 0, aiBoth = 0;
  const otherDetails: string[] = [];
  const oldest = utcWeekStart(new Date(now.getTime() - (weeks - 1) * 7 * 86_400_000).toISOString());

  for (const r of rows) {
    const paid = paidUserIds.has(r.user_id);
    if (paid) paidTotal++;
    const s = bySource.get(r.attribution_source) ?? { count: 0, paid: 0 };
    s.count++; if (paid) s.paid++;
    bySource.set(r.attribution_source, s);

    const wk = utcWeekStart(r.created_at);
    if (wk >= oldest) {
      const w = byWeek.get(wk) ?? new Map<string, number>();
      w.set(r.attribution_source, (w.get(r.attribution_source) ?? 0) + 1);
      byWeek.set(wk, w);
    }

    const channel = passiveChannel(r);
    const key = `${r.attribution_source}\u0000${channel}`;
    cross.set(key, (cross.get(key) ?? 0) + 1);

    const self = (AI_SOURCES as readonly string[]).includes(r.attribution_source);
    const passive = !!r.ai_referrer;
    if (self) aiSelf++;
    if (passive) aiPassive++;
    if (self && passive) aiBoth++;
    if (r.attribution_source === "other" && r.attribution_detail) otherDetails.push(r.attribution_detail);
  }

  return {
    total: rows.length,
    paidTotal,
    bySource: [...bySource.entries()]
      .map(([source, v]) => ({ source, label: labelFor(source), count: v.count, paid: v.paid, conversionPct: pct(v.paid, v.count) }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    byWeek: [...byWeek.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([week, m]) => ({ week, total: [...m.values()].reduce((x, y) => x + y, 0), bySource: Object.fromEntries(m) })),
    selfVsPassive: [...cross.entries()]
      .map(([k, count]) => { const [source, passive] = k.split("\u0000"); return { source, passive, count }; })
      .sort((a, b) => b.count - a.count),
    ai: { selfReported: aiSelf, passive: aiPassive, both: aiBoth, selfReportedPct: pct(aiSelf, rows.length), passivePct: pct(aiPassive, rows.length) },
    otherDetails: otherDetails.slice(0, 50),
  };
}
