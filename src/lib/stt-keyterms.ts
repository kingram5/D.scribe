/**
 * Vocabulary hints for speech-to-text (Deepgram nova-3 "keyterm" prompting).
 *
 * Dictation misses cluster on proper nouns and genre vocabulary: a pastor says
 * "Ephesians" and the page says "a fusions". Telling the recognizer which words
 * are likely in THIS book fixes most of that at no extra cost. Shared by the
 * live socket in the studio and the clip transcription on the server so the
 * two never disagree about the vocabulary.
 *
 * Keep each list short and specific. Deepgram caps keyterms at 500 tokens per
 * request, and common words gain nothing from being listed.
 */

const FAITH = [
  "scripture", "Genesis", "Exodus", "Leviticus", "Deuteronomy", "Joshua", "Psalms", "Proverbs",
  "Ecclesiastes", "Isaiah", "Jeremiah", "Ezekiel", "Daniel", "Hosea", "Jonah", "Micah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "Thessalonians", "Timothy", "Hebrews", "James", "Peter", "Revelation",
  "Holy Spirit", "gospel", "testimony", "discipleship", "congregation", "sermon", "ministry",
  "salvation", "covenant", "parable", "prodigal", "apostle", "Pharisees", "Galilee", "anointing",
];

const BY_AUDIENCE: Record<string, string[]> = {
  "Christian Living": FAITH,
  "Faith Community": FAITH,
  Leadership: ["psychological safety", "stakeholders", "direct reports", "keynote", "C-suite", "onboarding", "KPI"],
  "Business & Economics": ["margin", "payroll", "cash flow", "revenue", "inventory", "EBITDA", "franchise", "supplier"],
  "Self-Help": ["sobriety", "relapse", "recovery", "boundaries", "burnout", "accountability"],
  "Personal Development": ["mindset", "discipline", "burnout", "accountability", "resilience"],
};

const MAX_TERMS = 60;

/** Terms for one project: genre vocabulary plus the distinctive words of its title. */
export function sttKeyterms(audience?: string | null, title?: string | null): string[] {
  const terms = new Set<string>(BY_AUDIENCE[audience ?? ""] ?? []);
  for (const word of (title ?? "").split(/[^A-Za-z'’-]+/)) {
    if (word.length >= 5 && !/^untitled$|^project$/i.test(word)) terms.add(word);
  }
  return [...terms].slice(0, MAX_TERMS);
}

/** The same terms as repeated &keyterm= query parameters for the live socket URL. */
export function sttKeytermQuery(audience?: string | null, title?: string | null): string {
  return sttKeyterms(audience, title).map((t) => `&keyterm=${encodeURIComponent(t)}`).join("");
}
