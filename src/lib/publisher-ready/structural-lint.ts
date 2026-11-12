/**
 * Structural tells the phrase linter (voice-match.ts lintAITells) can't see:
 * flat sentence rhythm, rule-of-three habits, em-dash density, comma splices,
 * and images/phrases repeated ACROSS chapters. Deterministic, free, no model.
 *
 * These are the patterns trained readers cite when they flag AI prose
 * (uniform rhythm, "walls crumbled" 26 times in one book), per the 9/27
 * research in the vault brainstorm doc.
 */

import { splitSentences, lintAITells, type AITellReport } from "@/lib/voice-match";

export interface StructuralFlag {
  kind: "flat_rhythm" | "rule_of_three" | "em_dash" | "comma_splice" | "repeated_opening" | "book_repeat";
  message: string;
  /** Verbatim text from the chapter, so a fixer can find and change it. */
  span?: string;
}

export interface StructuralReport {
  sentenceCount: number;
  /** Coefficient of variation of sentence length (std / mean). Human prose sits well above 0.4. */
  rhythmVariation: number;
  flags: StructuralFlag[];
  tells: AITellReport;
}

const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);

function coefficientOfVariation(ns: number[]): number {
  if (ns.length < 2) return 1;
  const m = ns.reduce((a, b) => a + b, 0) / ns.length;
  if (m === 0) return 0;
  const sd = Math.sqrt(ns.reduce((a, n) => a + (n - m) ** 2, 0) / ns.length);
  return sd / m;
}

/** "X, Y, and Z" lists of three short items. One is style; a habit is a tell. */
const TRIAD_RE = /\b[\w'’-]+(?:\s[\w'’-]+){0,2},\s[\w'’-]+(?:\s[\w'’-]+){0,2},?\s(?:and|or)\s[\w'’-]+(?:\s[\w'’-]+){0,2}\b/gi;

/**
 * Two independent clauses joined only by a comma, the shape a blind em-dash to
 * comma swap produces: "..., I walked in" after a full clause. Heuristic: a
 * comma followed by a pronoun + verb-ish word, where the text before the comma
 * already holds a subject + verb. Conservative on purpose (few false alarms).
 */
const SPLICE_RE = /\b(?:I|we|he|she|they|it)\s+\w+[^,.;!?]{3,60},\s(?:I|we|he|she|they|it)\s(?:was|were|is|am|are|had|have|did|went|said|felt|knew|thought|walked|looked|could|would)\b/g;

export function lintStructure(text: string): StructuralReport {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => wordsOf(s).length);
  const rhythmVariation = coefficientOfVariation(lengths);
  const words = wordsOf(text).length || 1;
  const flags: StructuralFlag[] = [];

  if (sentences.length >= 15 && rhythmVariation < 0.35) {
    flags.push({
      kind: "flat_rhythm",
      message: `Sentence lengths barely vary (variation ${rhythmVariation.toFixed(2)}; human prose usually sits above 0.45). Mix in short punches and one or two long, winding sentences.`,
    });
  }

  // Runs of 4+ sentences within 3 words of each other.
  for (let i = 0; i + 3 < lengths.length; i++) {
    const window = lengths.slice(i, i + 4);
    if (Math.max(...window) - Math.min(...window) <= 3 && Math.min(...window) >= 8) {
      flags.push({ kind: "flat_rhythm", message: "Four sentences in a row of nearly the same length.", span: sentences[i] });
      i += 3;
    }
  }

  const triads = text.match(TRIAD_RE) ?? [];
  if (triads.length / (words / 1000) > 4) {
    flags.push({
      kind: "rule_of_three",
      message: `${triads.length} three-item lists; lists of three every few paragraphs read as machine rhythm. Cut some to one or two items.`,
      span: triads[0],
    });
  }

  const emDashes = (text.match(/—/g) ?? []).length;
  if (emDashes > 0) {
    flags.push({ kind: "em_dash", message: `${emDashes} em dash(es). Rewrite each as its own sentence or a real clause.` });
  }

  const splices = text.match(SPLICE_RE) ?? [];
  for (const s of splices.slice(0, 5)) {
    flags.push({ kind: "comma_splice", message: "Two full sentences joined by a comma.", span: s });
  }

  // Paragraphs that open the same way ("And then", "It was", "I remember").
  const openers = new Map<string, number>();
  for (const para of text.split(/\n\s*\n/)) {
    const first = wordsOf(para.trim()).slice(0, 2).join(" ").toLowerCase().replace(/[^a-z' ]/g, "");
    if (first) openers.set(first, (openers.get(first) ?? 0) + 1);
  }
  for (const [opener, n] of openers) {
    if (n >= 3) flags.push({ kind: "repeated_opening", message: `${n} paragraphs open with "${opener}".` });
  }

  return { sentenceCount: sentences.length, rhythmVariation, flags, tells: lintAITells(text) };
}

// ─── Book-wide repetition index ────────────────────────────────────────────

/** Common function-word n-grams that repeat in any book and mean nothing. */
const STOP = new Set(["the", "a", "an", "and", "of", "to", "in", "it", "i", "that", "was", "for", "on", "with", "my", "is", "at", "as", "we", "he", "she", "they", "you", "but", "had", "me", "be", "this", "so", "not"]);

function contentNgrams(text: string, n = 4): string[] {
  const toks = text.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + n <= toks.length; i++) {
    const gram = toks.slice(i, i + n);
    // Keep phrases with at least two content words: "walls came crashing down", not "and then i was".
    if (gram.filter((t) => !STOP.has(t)).length >= 2) out.push(gram.join(" "));
  }
  return out;
}

/**
 * Phrases that appear in this chapter AND in other chapters of the same book.
 * `others` maps chapter label -> text. Only phrases used in 2+ chapters come back.
 */
export function bookRepeats(chapterText: string, others: Record<string, string>, limit = 12): StructuralFlag[] {
  const mine = new Set(contentNgrams(chapterText));
  const hits = new Map<string, string[]>();
  for (const [label, text] of Object.entries(others)) {
    for (const g of new Set(contentNgrams(text))) {
      if (mine.has(g)) hits.set(g, [...(hits.get(g) ?? []), label]);
    }
  }
  return [...hits.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit)
    .map(([phrase, labels]) => ({
      kind: "book_repeat" as const,
      message: `"${phrase}" also appears in ${labels.join(", ")}.`,
      span: phrase,
    }));
}
