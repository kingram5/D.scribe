export const RESEARCH_INITIAL_PROBES = [2, 4, 7, 10] as const;
export const RESEARCH_REFRESH_EVERY = 8;
export const RESEARCH_CORPUS_CAP = 30;
export const RESEARCH_TOKEN_CAP = 800;
export const RESEARCH_CHARS_PER_TOKEN = 4;
export const RESEARCH_INK_COST = 3;
export const RESEARCH_NEW_WITHIN_MS = 5 * 60 * 1000;
export const RESEARCH_HOUR_CAP = 3;
export const RESEARCH_DAY_CAP = 10;

export function isResearchRateLimited(hourCount: number, dayCount: number): boolean {
  return hourCount >= RESEARCH_HOUR_CAP || dayCount >= RESEARCH_DAY_CAP;
}

export type ResearchKind = "quote" | "stat" | "reference";

export interface ResearchItem {
  id?: string;
  kind: ResearchKind;
  text: string;
  attribution?: string | null;
  source_title: string;
  source_url: string;
  source_date?: string | null;
  themes: string[];
  created_at?: string;
}

export interface ResearchProbe {
  key: number | "manual";
  force: boolean;
}

export function researchProbeAt(
  userTurns: number,
  state: {
    completed: boolean;
    fired: ReadonlySet<number>;
    completedAtTurns: number | null;
  },
): ResearchProbe | null {
  if (userTurns < 2) return null;
  if (state.fired.has(userTurns)) return null;

  if (!state.completed) {
    if ((RESEARCH_INITIAL_PROBES as readonly number[]).includes(userTurns)) {
      return { key: userTurns, force: userTurns === 10 };
    }
    return null;
  }

  const origin = state.completedAtTurns ?? 10;
  if (userTurns > origin && (userTurns - origin) % RESEARCH_REFRESH_EVERY === 0) {
    return { key: userTurns, force: false };
  }
  return null;
}

export function manualResearchProbe(): ResearchProbe {
  return { key: "manual", force: true };
}

export function normalizeResearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isGroundedInPages(text: string, pages: string[]): boolean {
  const needle = normalizeResearchText(text);
  if (needle.length < 12) return false;
  return pages.some((page) => normalizeResearchText(page).includes(needle));
}

export function filterGroundedItems<T extends { text: string }>(
  items: T[],
  pages: string[],
): T[] {
  return items.filter((item) => isGroundedInPages(item.text, pages));
}

export function themeOverlapScore(themes: string[], recentText: string): number {
  const haystack = normalizeResearchText(recentText);
  if (!haystack) return 0;
  let score = 0;
  for (const theme of themes) {
    const token = normalizeResearchText(theme);
    if (token.length >= 3 && haystack.includes(token)) score += 1;
  }
  return score;
}

export function rankResearchItems<T extends ResearchItem>(
  items: T[],
  recentUserText: string,
  tokenCap = RESEARCH_TOKEN_CAP,
): T[] {
  const ranked = [...items].sort((a, b) => {
    const diff = themeOverlapScore(b.themes, recentUserText) - themeOverlapScore(a.themes, recentUserText);
    if (diff !== 0) return diff;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

  const maxChars = tokenCap * RESEARCH_CHARS_PER_TOKEN;
  const kept: T[] = [];
  let used = 0;
  for (const item of ranked) {
    const cost = item.text.length + (item.attribution?.length ?? 0) + item.source_title.length + 40;
    if (kept.length > 0 && used + cost > maxChars) break;
    kept.push(item);
    used += cost;
  }
  return kept;
}

export function isNewResearchItem(createdAt: string | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const ts = Date.parse(createdAt);
  return Number.isFinite(ts) && now - ts <= RESEARCH_NEW_WITHIN_MS;
}

export function formatResearchedSourcesBlock(
  items: ResearchItem[],
  now = Date.now(),
): string {
  if (items.length === 0) return "";
  const lines = items.map((item) => {
    const flag = isNewResearchItem(item.created_at, now) ? "NEW " : "";
    const who = item.attribution ? ` — ${item.attribution}` : "";
    const date = item.source_date ? `, ${item.source_date}` : "";
    return `- ${flag}[${item.kind}] "${item.text}"${who} (${item.source_title}${date}; ${item.source_url})`;
  });

  return `

RESEARCHED SOURCES — gathered from live pages for THIS book. You may quote them verbatim with attribution and the source name, and offer them as candidate citations. Pattern: connect to what they just said, share the material, ask if it would be a relevant citation for their book, then ask how they would expand it. Prefer RESEARCHED SOURCES over memory when both could serve. Recent or current material may ONLY be cited from this block. The first time any item is marked NEW, acknowledge it naturally once ("While we were talking I did some digging…"). Once, not every turn.

${lines.join("\n")}`;
}

export function shouldInsertNormalized(text: string, existingNormalized: Iterable<string>): boolean {
  const normalized = normalizeResearchText(text);
  if (!normalized) return false;
  return !new Set(existingNormalized).has(normalized);
}

export function idsToEvict<T extends { id: string; created_at: string }>(
  items: T[],
  cap = RESEARCH_CORPUS_CAP,
): string[] {
  if (items.length <= cap) return [];
  return [...items]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, items.length - cap)
    .map((item) => item.id);
}

export function parseAssessPlan(raw: unknown): {
  confidence: "high" | "low";
  topic_summary: string;
  themes: string[];
  queries: string[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const confidence = obj.confidence === "high" || obj.confidence === "low" ? obj.confidence : null;
  if (!confidence) return null;
  const queries = Array.isArray(obj.queries)
    ? obj.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 5)
    : [];
  const themes = Array.isArray(obj.themes)
    ? obj.themes.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  return {
    confidence,
    topic_summary: typeof obj.topic_summary === "string" ? obj.topic_summary : "",
    themes,
    queries,
  };
}

export function parseExtractedItems(raw: unknown): ResearchItem[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<ResearchKind>(["quote", "stat", "reference"]);
  const out: ResearchItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (typeof item.text !== "string" || typeof item.source_title !== "string" || typeof item.source_url !== "string") {
      continue;
    }
    if (!kinds.has(item.kind as ResearchKind)) continue;
    out.push({
      kind: item.kind as ResearchKind,
      text: item.text.trim(),
      attribution: typeof item.attribution === "string" ? item.attribution : null,
      source_title: item.source_title.trim(),
      source_url: item.source_url.trim(),
      source_date: typeof item.source_date === "string" ? item.source_date : null,
      themes: Array.isArray(item.themes)
        ? item.themes.filter((t): t is string => typeof t === "string")
        : [],
    });
  }
  return out.slice(0, 12);
}

export function conversationDigest(
  messages: Array<{ role: string; content: string }>,
  limit = 20,
): Array<{ role: string; content: string }> {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-limit)
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? "").slice(0, 2000),
    }));
}
