// Marketing channel for a visit or a sign-up: ONE function for both sides of
// the growth dashboard (Kyle 2026-11-25: "which platforms are working and which
// aren't"), so a visit and the sign-up it turns into land in the same bucket.
//
// Pure logic, client- and server-safe, no I/O. The visit route runs it on the
// server over what the browser sends (never trusting a channel name from the
// client); the dashboard runs it over the first-visit fields stored with each
// account in user_attribution.
//
// Order of evidence:
//   1. utm_source (we tag our own links; ChatGPT appends utm_source=chatgpt.com)
//   2. the referrer's host, by exact host or dot-suffix, never substring, so
//      notchatgpt.com or chatgpt.com.evil.io never count as ChatGPT
//   3. no referrer at all = direct (typed, bookmarked, or an app that strips it)
//
// Stored values are the fine-grained channel keys below; grouping for the
// dashboard happens only in code (CHANNEL_GROUPS), so groups can change without
// touching the database.

/** Every channel a visit can be counted under. Keep in step with migration 033 (a test checks it). */
export const VISIT_CHANNELS = [
  "instagram", "tiktok", "facebook",
  "google", "bing", "search_other",
  "chatgpt", "perplexity", "gemini", "claude", "copilot",
  "youtube", "reddit",
  "linkedin", "x", "social_other",
  "email", "direct", "other",
] as const;

export type VisitChannel = (typeof VISIT_CHANNELS)[number];
/** "unknown" exists only for sign-ups whose first visit was never captured (other device, analytics declined). */
export type Channel = VisitChannel | "unknown";

export const CHANNEL_LABELS: Record<Channel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  google: "Google",
  bing: "Bing",
  search_other: "Other search engines",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  claude: "Claude",
  copilot: "Copilot",
  youtube: "YouTube",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  social_other: "Threads, Pinterest, Bluesky",
  email: "Email",
  direct: "Direct (no referrer)",
  other: "Other sites",
  unknown: "Not captured",
};

export interface ChannelGroup {
  id: string;
  label: string;
  channels: readonly Channel[];
}

/** How the dashboard groups channels. Multi-channel groups are broken out underneath. */
export const CHANNEL_GROUPS: readonly ChannelGroup[] = [
  { id: "instagram", label: "Instagram", channels: ["instagram"] },
  { id: "tiktok", label: "TikTok", channels: ["tiktok"] },
  { id: "facebook", label: "Facebook", channels: ["facebook"] },
  // Bing and the smaller engines sit with Google so "search" reads as one number.
  { id: "search", label: "Search (Google, Bing)", channels: ["google", "bing", "search_other"] },
  { id: "ai", label: "AI assistants", channels: ["chatgpt", "perplexity", "gemini", "claude", "copilot"] },
  { id: "youtube", label: "YouTube", channels: ["youtube"] },
  { id: "reddit", label: "Reddit", channels: ["reddit"] },
  { id: "social", label: "Other social (X, LinkedIn)", channels: ["x", "linkedin", "social_other"] },
  { id: "email", label: "Email", channels: ["email"] },
  { id: "direct", label: "Direct / unknown", channels: ["direct", "unknown"] },
  { id: "other", label: "Other sites", channels: ["other"] },
];

const GROUP_OF = new Map<Channel, ChannelGroup>();
for (const g of CHANNEL_GROUPS) for (const c of g.channels) GROUP_OF.set(c, g);

export function groupOf(channel: Channel): ChannelGroup {
  return GROUP_OF.get(channel) ?? CHANNEL_GROUPS[CHANNEL_GROUPS.length - 1];
}

export function isVisitChannel(v: unknown): v is VisitChannel {
  return typeof v === "string" && (VISIT_CHANNELS as readonly string[]).includes(v);
}

// ── utm_source ────────────────────────────────────────────────────────────────

const UTM_TOKENS: Record<string, VisitChannel> = {
  instagram: "instagram", ig: "instagram",
  tiktok: "tiktok",
  facebook: "facebook", fb: "facebook",
  google: "google",
  bing: "bing",
  chatgpt: "chatgpt", openai: "chatgpt",
  perplexity: "perplexity",
  gemini: "gemini",
  claude: "claude", anthropic: "claude",
  copilot: "copilot",
  youtube: "youtube", yt: "youtube",
  reddit: "reddit",
  linkedin: "linkedin",
  x: "x", twitter: "x",
  email: "email", "e-mail": "email", newsletter: "email",
};

// ── referrer hosts ────────────────────────────────────────────────────────────

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

// Checked in this order. AI and webmail hosts come before the search engines so
// gemini.google.com and mail.google.com are never counted as Google search.
const OWN_HOSTS = ["d-scribe.app"];
const AI_HOSTS: readonly [string, VisitChannel][] = [
  ["chatgpt.com", "chatgpt"], ["chat.openai.com", "chatgpt"],
  ["perplexity.ai", "perplexity"],
  ["gemini.google.com", "gemini"],
  ["claude.ai", "claude"],
  ["copilot.microsoft.com", "copilot"],
];
// Exact hosts only: webmail lives on subdomains of domains we otherwise count as search.
const EMAIL_HOSTS = new Set([
  "mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com",
  "mail.yahoo.com", "mail.aol.com", "mail.proton.me",
]);
const SUFFIX_HOSTS: readonly [string, VisitChannel][] = [
  ["instagram.com", "instagram"],
  ["tiktok.com", "tiktok"],
  ["facebook.com", "facebook"], ["fb.com", "facebook"],
  ["bing.com", "bing"],
  ["duckduckgo.com", "search_other"], ["search.yahoo.com", "search_other"], ["search.brave.com", "search_other"], ["ecosia.org", "search_other"],
  ["youtube.com", "youtube"], ["youtu.be", "youtube"],
  ["reddit.com", "reddit"],
  ["linkedin.com", "linkedin"], ["lnkd.in", "linkedin"],
  ["x.com", "x"], ["t.co", "x"], ["twitter.com", "x"],
  ["threads.net", "social_other"], ["threads.com", "social_other"], ["pinterest.com", "social_other"], ["pin.it", "social_other"], ["bsky.app", "social_other"],
];
// google.com, www.google.com, google.co.uk, google.com.au ... (not mail./gemini./accounts.)
const GOOGLE_SEARCH = /^(www\.)?google\.([a-z]{2,3}|com?\.[a-z]{2})$/;

// Android apps send android-app://<package>/ as the referrer.
const ANDROID_APPS: Record<string, VisitChannel> = {
  "com.google.android.googlequicksearchbox": "google",
  "com.google.android.gm": "email",
  "com.instagram.android": "instagram",
  "com.zhiliaoapp.musically": "tiktok",
  "com.ss.android.ugc.trill": "tiktok",
  "com.facebook.katana": "facebook",
  "com.facebook.orca": "facebook",
  "com.google.android.youtube": "youtube",
  "com.reddit.frontpage": "reddit",
  "com.linkedin.android": "linkedin",
  "com.twitter.android": "x",
  "com.openai.chatgpt": "chatgpt",
};

/** Channel for a host name (lowercase, no port). null when the host is ours. */
export function channelForHost(rawHost: string): VisitChannel | null {
  const host = rawHost.toLowerCase().replace(/\.$/, "");
  if (!host) return "other";
  for (const own of OWN_HOSTS) if (hostMatches(host, own)) return null;
  for (const [domain, ch] of AI_HOSTS) if (hostMatches(host, domain)) return ch;
  if (EMAIL_HOSTS.has(host)) return "email";
  if (GOOGLE_SEARCH.test(host)) return "google";
  for (const [domain, ch] of SUFFIX_HOSTS) if (hostMatches(host, domain)) return ch;
  return "other";
}

function channelForUtm(rawSource: string, rawMedium: string): VisitChannel | null {
  const source = rawSource.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!source) return null;
  const token = UTM_TOKENS[source];
  if (token) return token;
  // utm_source=chatgpt.com, l.instagram.com, google.com ... read like a host.
  if (source.includes(".")) {
    const byHost = channelForHost(source);
    if (byHost && byHost !== "other") return byHost;
  }
  if (rawMedium.trim().toLowerCase() === "email") return "email";
  return "other";
}

export interface ChannelInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrer?: string | null;
}

/** The marketing channel for one visit (see the order of evidence at the top). */
export function deriveChannel(input: ChannelInput): VisitChannel {
  const fromUtm = input.utmSource ? channelForUtm(input.utmSource, input.utmMedium ?? "") : null;
  if (fromUtm) return fromUtm;

  const ref = (input.referrer ?? "").trim();
  if (!ref) return "direct";
  let url: URL;
  try { url = new URL(ref); } catch { return "other"; }
  if (url.protocol === "android-app:") return ANDROID_APPS[url.hostname.toLowerCase()] ?? "other";
  if (url.protocol !== "https:" && url.protocol !== "http:") return "other";
  // Our own pages (www <-> apex hops, a tab restored mid-site) are not a channel.
  return channelForHost(url.hostname) ?? "direct";
}

/** The channel for a sign-up, from the first-visit fields stored in user_attribution. */
export function signupChannel(row: { utm_source: string | null; utm_medium?: string | null; referrer: string | null; null_referrer: boolean | null }): Channel {
  // null_referrer null and nothing else = this device never recorded a first visit.
  if (row.null_referrer === null && !row.utm_source && !row.referrer) return "unknown";
  return deriveChannel({ utmSource: row.utm_source, utmMedium: row.utm_medium ?? null, referrer: row.referrer });
}
