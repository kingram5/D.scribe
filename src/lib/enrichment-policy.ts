/** Applies only to optional machine-suggested enrichment, never authored text. */
export interface EnrichmentCandidate {
  quote_text?: unknown;
  source_author?: unknown;
  source_title?: unknown;
  source_type?: unknown;
}

export interface EnrichmentSource {
  text: string;
  attribution?: string | null;
  source_title: string;
  source_url: string;
}

const TYPES = new Set(["book", "article", "scripture", "speech", "research"]);
const normalized = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
const identity = (text: string) => normalized(text).normalize("NFD").replace(/[\u0300-\u036f\u200b-\u200f\ufeff]/g, "").toLowerCase();
const unknown = /^(unknown|anonymous|unattributed|unspecified|n\/?a|not known|not provided|various|historian|a historian|historical figure)$/i;

/** Narrow primary-propaganda identities, not a ban on historical topics. */
export function hasPropagandaAttribution(candidate: EnrichmentCandidate): boolean {
  const author = typeof candidate.source_author === "string" ? identity(candidate.source_author) : "";
  const compact = author.replace(/[^a-z]/g, "");
  if (/^(adolfhitler|adolphhitler|hitleradolf|ahitler|derfuhrer|josephgoebbels|pauljosephgoebbels)/.test(compact)
    || /^(hitler|goebbels|fuhrer)$/.test(compact)) return true;
  const title = typeof candidate.source_title === "string" ? identity(candidate.source_title).replace(/[^a-z0-9]+/g, " ").trim() : "";
  // Primary titles and editions remain disallowed if the model hides the author.
  // Neutral articles ABOUT these works retain their own author/source identity.
  return /^(mein kampf|my struggle)(?:$| (?:vol|volume|chapter|book|part|19\d\d|20\d\d|by|adolf|translated|translation|edition)\b)/.test(title)
    || (candidate.source_type === "book" && /\bmein kampf\b/.test(title));
}

export function isEnrichmentCandidate(candidate: EnrichmentCandidate): boolean {
  return typeof candidate.quote_text === "string" && normalized(candidate.quote_text).length >= 12
    && typeof candidate.source_author === "string" && normalized(candidate.source_author).length >= 2
    && !unknown.test(normalized(candidate.source_author))
    && typeof candidate.source_title === "string" && normalized(candidate.source_title).length >= 2
    && typeof candidate.source_type === "string" && TYPES.has(candidate.source_type)
    && !hasPropagandaAttribution(candidate);
}

/** Require exact text and attribution from source-grounded, owned research. */
export function isVerifiedEnrichment(candidate: EnrichmentCandidate, sources: EnrichmentSource[]): boolean {
  if (!isEnrichmentCandidate(candidate)) return false;
  return sources.some((source) => {
    let url: URL;
    try { url = new URL(source.source_url); } catch { return false; }
    return ["http:", "https:"].includes(url.protocol) && !!source.attribution
      && normalized(candidate.quote_text as string) === normalized(source.text)
      && identity(candidate.source_author as string) === identity(source.attribution)
      && identity(candidate.source_title as string) === identity(source.source_title);
  });
}

export function verifiedEnrichments<T extends EnrichmentCandidate>(items: T[], sources: EnrichmentSource[]): T[] {
  return items.filter((item) => item && typeof item === "object" && isVerifiedEnrichment(item, sources));
}
