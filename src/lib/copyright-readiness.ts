/**
 * Copyright Readiness scoring — measures how much of a book is the author's
 * own work vs untouched AI draft.
 *
 * This is D.Scribe's own metric of authorship effort. It is not a legal
 * assessment. Bands describe effort, not outcome.
 *
 * Everything here is deterministic (token distance + heuristics). No model
 * calls, no Ink cost. The only model call in this feature lives in the
 * disclosure generator, which is a separate route.
 *
 * Kept strictly separate from Voice-Match / AI-Tell: those measure
 * "reads human"; this measures "authored by human". They can move in
 * opposite directions.
 */

import { computeEditDelta } from "@/lib/edit-diff";

export type ReadinessBand = "mostly_yours" | "mixed" | "mostly_ai";

export type StructureProvenance =
  | "ai_generated_accepted"
  | "ai_edited"
  | "user_authored";

export interface EditEventLite {
  before_text: string;
  after_text: string;
  kind?: "magic_edit" | "rewrite_bar" | "manual_save" | string;
}

export interface ChapterReadiness {
  chapterId: string;
  chapterNumber: number;
  title: string;
  /** 0..1 — share of final text materially changed from the v1 AI draft */
  editDepth: number;
  /** count of edit_events classified substantive */
  substantiveEdits: number;
  cosmeticEdits: number;
  band: ReadinessBand;
}

export interface BookReadiness {
  /** worst-weighted aggregate — one strong chapter can't mask ten thin ones */
  band: ReadinessBand;
  structure: StructureProvenance;
  chapters: ChapterReadiness[];
  /** chapter numbers in mostly_ai band, for the "add yourself here" prompts */
  thinChapters: number[];
  /** chapter numbers excluded because status is outlined/generating (or no draft) */
  unscoredChapters: number[];
}

export interface ChapterScoreMeta {
  chapterId?: string;
  chapterNumber?: number;
  title?: string;
}

/** Chapter band: enough depth OR enough substantive edits. */
export const MOSTLY_YOURS_DEPTH = 0.35;
export const MOSTLY_YOURS_EDITS = 5;
/** Chapter band: almost no depth AND no substantive edits. */
export const MOSTLY_AI_DEPTH = 0.08;
/** classifyEdit: below this is cosmetic. */
export const COSMETIC_DISTANCE = 0.05;
/** classifyEdit: at/above this is substantive. The middle band is cosmetic. */
export const SUBSTANTIVE_DISTANCE = 0.15;
/** Book band: this share of mostly_ai chapters makes the book mostly_ai. */
export const BOOK_THIN_SHARE = 0.3;

export const BAND_LABELS: Record<ReadinessBand, string> = {
  mostly_yours: "Mostly yours",
  mixed: "Mixed",
  mostly_ai: "Mostly AI",
};

export const DISCLAIMER_LINE =
  "D.Scribe's own metric — not a legal assessment.";

export const COPYRIGHT_GUIDANCE_URL = "https://www.copyright.gov/ai/";

export const FIRST_OPEN_MODAL_TEXT =
  "This score is D.Scribe's own measure of how much of this book is yours. It is not legal advice, not a copyright determination, and is based on no official formula — no such formula exists. It shows you where the book is mostly unedited AI draft. For real copyright questions, see the U.S. Copyright Office's AI guidance or an attorney.";

export const THIN_CHAPTER_PROMPT = (n: number) =>
  `Chapter ${n} is mostly unedited AI draft — add your voice or cut it`;

const STRUCTURE_VALUES = new Set<StructureProvenance>([
  "ai_generated_accepted",
  "ai_edited",
  "user_authored",
]);

/**
 * Function words stripped before distance is computed so punctuation, casing,
 * and glue-word churn cannot inflate authorship. Content tokens only.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "so", "as", "of", "at",
  "by", "for", "with", "about", "against", "between", "into", "through",
  "during", "before", "after", "above", "below", "to", "from", "up", "down",
  "in", "out", "on", "off", "over", "under", "again", "further", "once",
  "here", "there", "when", "where", "why", "how", "all", "any", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "than", "too", "very", "can", "will", "just",
  "should", "now", "is", "am", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "having", "do", "does", "did", "doing", "would",
  "could", "may", "might", "must", "shall", "this", "that", "these", "those",
  "i", "me", "my", "we", "our", "you", "your", "he", "him", "his", "she",
  "her", "it", "its", "they", "them", "their", "what", "which", "who", "whom",
]);

/** Word tokens with punctuation/casing stripped and stopwords removed. */
export function contentTokens(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}'']+/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Classic Wagner–Fischer over token sequences. Two-row DP. */
export function tokenEditDistance(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a === b || (a.length === b.length && a.every((t, i) => t === b[i]))) return 0;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[b.length];
}

/**
 * Normalized word-level edit distance on stopword-filtered tokens.
 * Whitespace / punctuation / casing-only changes contribute 0.
 */
export function normalizedWordDistance(original: string, edited: string): number {
  const a = contentTokens(original);
  const b = contentTokens(edited);
  if (a.length === 0 && b.length === 0) return 0;
  const dist = tokenEditDistance(a, b);
  return dist / Math.max(a.length, b.length);
}

export function classifyEdit(before: string, after: string): "substantive" | "cosmetic" {
  const distance = normalizedWordDistance(before, after);
  // Conservative: the middle band is cosmetic. Under-credit, never over-credit.
  return distance >= SUBSTANTIVE_DISTANCE ? "substantive" : "cosmetic";
}

function chapterBand(editDepth: number, substantiveEdits: number): ReadinessBand {
  if (editDepth >= MOSTLY_YOURS_DEPTH || substantiveEdits >= MOSTLY_YOURS_EDITS) {
    return "mostly_yours";
  }
  if (editDepth < MOSTLY_AI_DEPTH && substantiveEdits === 0) {
    return "mostly_ai";
  }
  return "mixed";
}

export function scoreChapter(
  firstDraft: string,
  finalText: string,
  events: EditEventLite[],
  meta: ChapterScoreMeta = {}
): ChapterReadiness {
  const orig = firstDraft ?? "";
  const edited = finalText ?? "";
  // Sentence pairing is a fast path only: exact LCS matches mean the prose
  // is unchanged. Depth itself is always the uncapped word-level distance so
  // edit-diff's 30-pair cap cannot under-count a long rewrite.
  const delta = computeEditDelta(orig, edited);
  const editDepth =
    orig === edited ||
    (delta.stats.sentences_changed === 0 && delta.stats.sentences_total > 0)
      ? 0
      : normalizedWordDistance(orig, edited);

  let substantiveEdits = 0;
  let cosmeticEdits = 0;
  for (const event of events ?? []) {
    if (classifyEdit(event.before_text ?? "", event.after_text ?? "") === "substantive") {
      substantiveEdits++;
    } else {
      cosmeticEdits++;
    }
  }

  return {
    chapterId: meta.chapterId ?? "",
    chapterNumber: meta.chapterNumber ?? 0,
    title: meta.title ?? "",
    editDepth,
    substantiveEdits,
    cosmeticEdits,
    band: chapterBand(editDepth, substantiveEdits),
  };
}

function asStructure(structure: string): StructureProvenance {
  return STRUCTURE_VALUES.has(structure as StructureProvenance)
    ? (structure as StructureProvenance)
    : "ai_generated_accepted";
}

export function scoreBook(
  chapters: ChapterReadiness[],
  structure: string,
  unscoredChapters: number[] = []
): BookReadiness {
  const provenance = asStructure(structure);
  const scored = chapters ?? [];
  const thinChapters = scored
    .filter((c) => c.band === "mostly_ai")
    .map((c) => c.chapterNumber)
    .sort((a, b) => a - b);

  let band: ReadinessBand;
  if (scored.length === 0) {
    // Nothing scored is not authorship. Conservative default.
    band = "mostly_ai";
  } else if (thinChapters.length / scored.length >= BOOK_THIN_SHARE) {
    band = "mostly_ai";
  } else if (
    scored.every((c) => c.band === "mostly_yours") &&
    provenance !== "ai_generated_accepted"
  ) {
    band = "mostly_yours";
  } else {
    band = "mixed";
  }

  return {
    band,
    structure: provenance,
    chapters: scored,
    thinChapters,
    unscoredChapters: [...unscoredChapters].sort((a, b) => a - b),
  };
}
