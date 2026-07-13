import { splitSentences } from "@/lib/voice-match";
import { BANNED_PHRASES } from "@/lib/ai-tells";

/**
 * Sentence-level diff between a generated chapter and the user's edited
 * version. This is the raw material Editorial Memory distills from: which
 * sentences the author rewrote, what they cut, what they added.
 */

export interface SentencePair {
  original: string;
  edited: string;
}

export interface EditDelta {
  /** Sentences rewritten in place (aligned original → edited) */
  changed_pairs: SentencePair[];
  /** Sentences the author deleted outright */
  removed: string[];
  /** Sentences the author added */
  added: string[];
  /** Net change stats */
  stats: {
    original_words: number;
    edited_words: number;
    em_dashes_removed: number;
    banned_phrases_removed: string[];
    sentences_changed: number;
    sentences_total: number;
    /** 0..1 — fraction of sentences the author touched */
    edit_rate: number;
  };
}

const MAX_PAIRS = 30;
const MAX_LIST = 20;
const MAX_SENTENCE_LEN = 400;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function truncate(s: string): string {
  return s.length > MAX_SENTENCE_LEN ? s.slice(0, MAX_SENTENCE_LEN) + "…" : s;
}

/** Longest-common-subsequence over sentences (exact match) */
function sentenceLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  // DP table on lengths; chapters are a few hundred sentences at most
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matches: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      matches.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

/** Similarity heuristic to align a removed sentence with its replacement */
function wordOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const w of setA) if (setB.has(w)) common++;
  return common / Math.min(setA.size, setB.size);
}

export function computeEditDelta(original: string, edited: string): EditDelta {
  const origSentences = splitSentences(original);
  const editSentences = splitSentences(edited);

  const matches = sentenceLCS(origSentences, editSentences);
  const matchedOrig = new Set(matches.map(([i]) => i));
  const matchedEdit = new Set(matches.map(([, j]) => j));

  // Walk the gaps between LCS anchors: removed-and-added sentences in the
  // same gap with high word overlap are rewrites; the rest are pure
  // deletions/additions.
  const changed_pairs: SentencePair[] = [];
  const removed: string[] = [];
  const added: string[] = [];

  const unmatchedOrig = origSentences
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !matchedOrig.has(i));
  const unmatchedEdit = editSentences
    .map((s, j) => ({ s, j }))
    .filter(({ j }) => !matchedEdit.has(j));

  const usedEdit = new Set<number>();
  for (const { s: orig } of unmatchedOrig) {
    let best: { j: number; s: string; score: number } | null = null;
    for (const { s: edit, j } of unmatchedEdit) {
      if (usedEdit.has(j)) continue;
      const score = wordOverlap(orig, edit);
      if (score >= 0.4 && (!best || score > best.score)) best = { j, s: edit, score };
    }
    if (best) {
      usedEdit.add(best.j);
      if (changed_pairs.length < MAX_PAIRS) {
        changed_pairs.push({ original: truncate(orig), edited: truncate(best.s) });
      }
    } else if (removed.length < MAX_LIST) {
      removed.push(truncate(orig));
    }
  }
  for (const { s, j } of unmatchedEdit) {
    if (!usedEdit.has(j) && added.length < MAX_LIST) added.push(truncate(s));
  }

  // Stats
  const emOrig = original.match(/—/g)?.length ?? 0;
  const emEdit = edited.match(/—/g)?.length ?? 0;
  const lowerOrig = original.toLowerCase().replace(/[’]/g, "'");
  const lowerEdit = edited.toLowerCase().replace(/[’]/g, "'");
  const banned_phrases_removed = BANNED_PHRASES.filter((p) => {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    return (lowerOrig.match(re)?.length ?? 0) > (lowerEdit.match(re)?.length ?? 0);
  });

  const sentences_changed = changed_pairs.length + removed.length + added.length;

  return {
    changed_pairs,
    removed,
    added,
    stats: {
      original_words: countWords(original),
      edited_words: countWords(edited),
      em_dashes_removed: Math.max(0, emOrig - emEdit),
      banned_phrases_removed,
      sentences_changed,
      sentences_total: origSentences.length,
      edit_rate:
        origSentences.length > 0
          ? Math.min(1, sentences_changed / origSentences.length)
          : 0,
    },
  };
}
