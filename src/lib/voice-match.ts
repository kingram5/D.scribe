import { VoiceProfile } from "@/types";
import {
  BANNED_PHRASES,
  SOFT_TELLS,
  NEGATION_FLIP_PATTERNS,
} from "@/lib/ai-tells";

/**
 * Voice-Match scoring — measures generated prose two ways:
 *
 * 1. Reads-human score: density of detectable AI-writing patterns (the same
 *    tells HUMANIZER_RULES bans at generation time, now measured on output).
 * 2. Voice-match score: how closely the prose tracks the author's REAL
 *    spoken baseline — sentence rhythm, contraction habits, signature
 *    phrases — computed from their own transcripts.
 *
 * Everything here is deterministic (regex + statistics). No model calls, no
 * Ink cost, instant results.
 */

export interface AITellReport {
  emDashes: number;
  bannedHits: { phrase: string; count: number; soft: boolean }[];
  negationFlips: number;
  rhetoricalTransitions: number;
  uniformParagraphs: boolean;
  wordCount: number;
  /** 0-100, 100 = no detectable AI tells */
  score: number;
}

export interface VoiceBaseline {
  sentenceLenMean: number;
  sentenceLenStd: number;
  /** Contractions per 100 words in the author's real speech */
  contractionRate: number;
  signaturePhrases: string[];
  sourceWordCount: number;
}

export interface VoiceMatchReport {
  /** 0-100 overall voice match */
  score: number;
  components: {
    sentenceRhythm: number;
    sentenceVariety: number;
    contractions: number;
    signaturePhrases: number;
    aiTellBleed: number;
  };
  signatureHits: string[];
  baseline: VoiceBaseline;
}

const CONTRACTION_RE =
  /\b(?:don|won|it|that|isn|aren|wasn|weren|can|couldn|wouldn|shouldn|didn|doesn|hasn|haven|hadn|there|here|what|let|who|she|he|we|you|they|i)['’](?:t|s|re|ve|ll|d|m)\b/gi;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=["'“”A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 1);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function contractionRatePer100(text: string): number {
  const words = countWords(text);
  if (words === 0) return 0;
  const hits = text.match(CONTRACTION_RE)?.length ?? 0;
  return (hits / words) * 100;
}

function mean(ns: number[]): number {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
}

function std(ns: number[]): number {
  if (ns.length < 2) return 0;
  const m = mean(ns);
  return Math.sqrt(mean(ns.map((n) => (n - m) ** 2)));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizePhrase(p: string): string {
  return p.toLowerCase().replace(/[^a-z0-9\s']/g, "").replace(/\s+/g, " ").trim();
}

// ─── Reads-human linter ──────────────────────────────────────────────────────

export function lintAITells(text: string): AITellReport {
  const wordCount = countWords(text);
  // Straighten curly apostrophes so "let's be real" matches generated "let’s"
  const lower = text.toLowerCase().replace(/[’]/g, "'");

  const emDashes = (text.match(/—/g)?.length ?? 0) + (text.match(/\s--\s/g)?.length ?? 0);

  const bannedHits: AITellReport["bannedHits"] = [];
  for (const phrase of BANNED_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Single-word verbs also match inflections (delve → delves/delved/delving);
    // word boundaries keep "journey" from firing inside "journeyman".
    const suffix = phrase.includes(" ") || phrase.includes("-") ? "" : "(?:s|d|es|ed|ing)?";
    const re = new RegExp(`\\b${escaped}${suffix}\\b`, "g");
    const count = lower.match(re)?.length ?? 0;
    if (count > 0) bannedHits.push({ phrase, count, soft: SOFT_TELLS.has(phrase) });
  }

  let negationFlips = 0;
  for (const pattern of NEGATION_FLIP_PATTERNS) {
    pattern.lastIndex = 0;
    negationFlips += text.match(pattern)?.length ?? 0;
  }

  // Rhetorical questions used as section transitions: a short question that
  // ends its paragraph.
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let rhetoricalTransitions = 0;
  for (const para of paragraphs) {
    const sentences = splitSentences(para);
    const last = sentences[sentences.length - 1];
    if (last && last.endsWith("?") && countWords(last) <= 14) rhetoricalTransitions++;
  }

  // Paragraph-shape uniformity: every paragraph 3-5 sentences = formulaic
  const paraSentenceCounts = paragraphs.map((p) => splitSentences(p).length);
  const uniformParagraphs =
    paragraphs.length >= 6 &&
    std(paraSentenceCounts) < 0.8 &&
    mean(paraSentenceCounts) >= 3 &&
    mean(paraSentenceCounts) <= 5;

  // Score: penalties per 1000 words so chapter length doesn't skew it
  const per1k = wordCount > 0 ? 1000 / wordCount : 0;
  const hardBanned = bannedHits.filter((b) => !b.soft).reduce((s, b) => s + b.count, 0);
  const softBanned = bannedHits.filter((b) => b.soft).reduce((s, b) => s + b.count, 0);

  let penalty = 0;
  penalty += emDashes * 4 * per1k;
  penalty += hardBanned * 5 * per1k;
  penalty += softBanned * 1.5 * per1k;
  penalty += negationFlips * 6 * per1k;
  penalty += rhetoricalTransitions * 3 * per1k;
  if (uniformParagraphs) penalty += 5;

  return {
    emDashes,
    bannedHits,
    negationFlips,
    rhetoricalTransitions,
    uniformParagraphs,
    wordCount,
    score: Math.round(clamp(100 - penalty, 0, 100)),
  };
}

// ─── Author baseline from real speech ────────────────────────────────────────

const BASELINE_WORD_CAP = 60_000;

export function buildVoiceBaseline(
  transcriptTexts: string[],
  voiceProfile?: VoiceProfile | null
): VoiceBaseline {
  let corpus = transcriptTexts.join("\n\n");
  const words = corpus.split(/\s+/).filter(Boolean);
  if (words.length > BASELINE_WORD_CAP) {
    corpus = words.slice(0, BASELINE_WORD_CAP).join(" ");
  }

  const sentences = splitSentences(corpus);
  const lens = sentences.map(countWords).filter((n) => n > 0);

  return {
    sentenceLenMean: mean(lens),
    sentenceLenStd: std(lens),
    contractionRate: contractionRatePer100(corpus),
    signaturePhrases: (voiceProfile?.signature_phrases ?? [])
      .map(normalizePhrase)
      .filter((p) => countWords(p) >= 2),
    sourceWordCount: Math.min(words.length, BASELINE_WORD_CAP),
  };
}

// ─── Voice-match score ───────────────────────────────────────────────────────

/** Similarity of two positive quantities as 0-100 (equal = 100, 2x apart ≈ 33) */
function relativeSimilarity(a: number, b: number): number {
  if (a === 0 && b === 0) return 100;
  const diff = Math.abs(a - b) / Math.max(a, b, 0.001);
  return clamp(100 * (1 - diff * 1.5), 0, 100);
}

export function voiceMatchScore(text: string, baseline: VoiceBaseline): VoiceMatchReport {
  const sentences = splitSentences(text);
  const lens = sentences.map(countWords).filter((n) => n > 0);

  const sentenceRhythm = relativeSimilarity(mean(lens), baseline.sentenceLenMean);
  const sentenceVariety = relativeSimilarity(std(lens), baseline.sentenceLenStd);
  const contractions = relativeSimilarity(
    contractionRatePer100(text),
    baseline.contractionRate
  );

  const normText = normalizePhrase(text);
  const signatureHits = baseline.signaturePhrases.filter((p) => normText.includes(p));
  // Soft target: landing ~3 signature phrases in a chapter is full marks.
  const signatureTarget = Math.min(3, baseline.signaturePhrases.length);
  const signaturePhrases =
    signatureTarget === 0
      ? 100 // no profile phrases to match — don't punish
      : clamp((signatureHits.length / signatureTarget) * 100, 0, 100);

  const aiTellBleed = lintAITells(text).score;

  const components = { sentenceRhythm, sentenceVariety, contractions, signaturePhrases, aiTellBleed };
  const score = Math.round(
    sentenceRhythm * 0.3 +
      sentenceVariety * 0.15 +
      contractions * 0.25 +
      signaturePhrases * 0.15 +
      aiTellBleed * 0.15
  );

  return { score, components, signatureHits, baseline };
}
