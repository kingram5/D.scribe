import { TranscriptSegment } from "@/types";

/**
 * Prosody engine — turns transcript timing data into a delivery-emphasis map.
 *
 * The speaker's own delivery marks what matters: they slow down for the line
 * they want remembered, pause before the point they've been building to, and
 * repeat the phrase they want to land. Text-only pipelines throw all of that
 * away; this module recovers it from the utterance timings Deepgram already
 * gives us (and word timings, where persisted).
 *
 * Word-index alignment contract: `full_text` is built as
 * `segments.map(s => s.text).join("\n\n")` and every consumer (chunker, worker)
 * tokenizes with `split(/\s+/).filter(Boolean)`. Joining with "\n\n" adds no
 * words, so cumulative per-segment word counts align 1:1 with chunk word
 * ranges. If either side of that contract changes, emphasis ranges shift.
 */

export interface UtteranceEmphasis {
  /** Index into the segments array */
  index: number;
  /** Segment timing (seconds) */
  start: number;
  end: number;
  /** Word-index span within full_text tokenization: [wordStart, wordEnd) */
  wordStart: number;
  wordEnd: number;
  /** Words per second for this utterance (0 when unmeasurable) */
  pace: number;
  /** Silence before this utterance in seconds (0 for the first) */
  pauseBefore: number;
  /** Component signals, each 0..1 */
  slowness: number;
  pauseWeight: number;
  repetition: number;
  /** Combined emphasis 0..1 */
  emphasis: number;
  text: string;
  speaker: string;
}

export interface ChunkEmphasis {
  /** Overlap-weighted mean emphasis across the chunk's word range */
  mean: number;
  /** Highest utterance emphasis inside the chunk */
  max: number;
  /** Most-emphasized utterances in the chunk, strongest first */
  topUtterances: UtteranceEmphasis[];
}

// Tuning constants. Derived from speech-summarization literature defaults
// (pause > ~0.5s = discourse boundary; >2s = deliberate dramatic pause) and
// sanity-checked against real sermon transcripts.
const MIN_WORDS_FOR_PACE = 4; // shorter utterances have meaningless pace
const MIN_DURATION_SEC = 0.8;
const PAUSE_FLOOR_SEC = 0.35; // gaps below this are breath, not emphasis
const PAUSE_SATURATION_SEC = 2.5; // gaps beyond this add no further weight
const NGRAM_SIZE = 4; // length of repeated-phrase detection window
const WEIGHT_SLOWNESS = 0.5;
const WEIGHT_PAUSE = 0.3;
const WEIGHT_REPETITION = 0.2;
const TOP_UTTERANCE_MIN_EMPHASIS = 0.5;
const TOP_UTTERANCE_MIN_WORDS = 5;

export function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find utterances containing a phrase the speaker repeats elsewhere in the
 * transcript. Repetition of a 4+ word run is almost never accidental in
 * spoken content — it's the speaker hammering a point.
 * Returns a repetition score 0..1 per segment index.
 */
function computeRepetition(segments: TranscriptSegment[]): number[] {
  const ngramOwners = new Map<string, Set<number>>();

  segments.forEach((seg, i) => {
    const words = tokenizeWords(normalizeForMatch(seg.text));
    for (let w = 0; w + NGRAM_SIZE <= words.length; w++) {
      const gram = words.slice(w, w + NGRAM_SIZE).join(" ");
      let owners = ngramOwners.get(gram);
      if (!owners) {
        owners = new Set();
        ngramOwners.set(gram, owners);
      }
      owners.add(i);
    }
  });

  const scores = new Array<number>(segments.length).fill(0);
  for (const owners of ngramOwners.values()) {
    // Repeated across 2+ distinct utterances = deliberate refrain
    if (owners.size >= 2) {
      for (const i of owners) scores[i] = 1;
    }
  }
  return scores;
}

/**
 * Compute a delivery-emphasis score for every utterance in a transcript.
 * Pure function of the persisted segments — no API calls, no re-transcription.
 */
export function computeUtteranceEmphasis(segments: TranscriptSegment[]): UtteranceEmphasis[] {
  const repetition = computeRepetition(segments);

  // Per-speaker median pace so a naturally slow guest doesn't read as
  // permanent emphasis against a fast host's baseline.
  const paceSamples = new Map<string, number[]>();
  const paces: number[] = segments.map((seg) => {
    const words = tokenizeWords(seg.text).length;
    const duration = seg.end - seg.start;
    if (words < MIN_WORDS_FOR_PACE || duration < MIN_DURATION_SEC) return 0;
    const pace = words / duration;
    const bucket = paceSamples.get(seg.speaker) ?? [];
    bucket.push(pace);
    paceSamples.set(seg.speaker, bucket);
    return pace;
  });

  const medianBySpeaker = new Map<string, number>();
  for (const [speaker, samples] of paceSamples) {
    medianBySpeaker.set(speaker, median(samples));
  }

  let wordCursor = 0;
  return segments.map((seg, i) => {
    const wordCount = tokenizeWords(seg.text).length;
    const wordStart = wordCursor;
    wordCursor += wordCount;

    const pace = paces[i];
    const speakerMedian = medianBySpeaker.get(seg.speaker) ?? 0;
    const slowness =
      pace > 0 && speakerMedian > 0 ? clamp01(speakerMedian / pace - 1) : 0;

    const prev = segments[i - 1];
    const pauseBefore = prev ? Math.max(0, seg.start - prev.end) : 0;
    const pauseWeight = clamp01(
      (pauseBefore - PAUSE_FLOOR_SEC) / (PAUSE_SATURATION_SEC - PAUSE_FLOOR_SEC)
    );

    const emphasis = clamp01(
      WEIGHT_SLOWNESS * slowness +
        WEIGHT_PAUSE * pauseWeight +
        WEIGHT_REPETITION * repetition[i]
    );

    return {
      index: i,
      start: seg.start,
      end: seg.end,
      wordStart,
      wordEnd: wordCursor,
      pace,
      pauseBefore,
      slowness,
      pauseWeight,
      repetition: repetition[i],
      emphasis,
      text: seg.text,
      speaker: seg.speaker,
    };
  });
}

/**
 * Aggregate utterance emphasis over a chunk's word range [startWord, endWord).
 * Overlap-weighted so an utterance straddling a chunk boundary contributes
 * proportionally to both chunks.
 */
export function chunkEmphasis(
  emphases: UtteranceEmphasis[],
  startWord: number,
  endWord: number
): ChunkEmphasis {
  let weightedSum = 0;
  let overlapTotal = 0;
  let max = 0;
  const inChunk: UtteranceEmphasis[] = [];

  for (const u of emphases) {
    const overlap = Math.min(u.wordEnd, endWord) - Math.max(u.wordStart, startWord);
    if (overlap <= 0) continue;
    weightedSum += u.emphasis * overlap;
    overlapTotal += overlap;
    if (u.emphasis > max) max = u.emphasis;
    inChunk.push(u);
  }

  const topUtterances = inChunk
    .filter(
      (u) =>
        u.emphasis >= TOP_UTTERANCE_MIN_EMPHASIS &&
        u.wordEnd - u.wordStart >= TOP_UTTERANCE_MIN_WORDS
    )
    .sort((a, b) => b.emphasis - a.emphasis)
    .slice(0, 3);

  return {
    mean: overlapTotal > 0 ? weightedSum / overlapTotal : 0,
    max,
    topUtterances,
  };
}

/**
 * Does a key point's supporting quote overlap one of the chunk's emphasized
 * moments? Normalized substring match in either direction, with a length
 * guard so trivial fragments don't count.
 */
export function quoteMatchesEmphasis(
  quote: string,
  topUtterances: Pick<UtteranceEmphasis, "text">[]
): boolean {
  const normQuote = normalizeForMatch(quote);
  if (normQuote.length < 20) return false;
  return topUtterances.some((u) => {
    const normUtt = normalizeForMatch(u.text);
    if (normUtt.length < 20) return false;
    return normUtt.includes(normQuote) || normQuote.includes(normUtt);
  });
}

/**
 * Relevance score for a key point given the chunk's delivery analysis.
 * Baseline matches the pipeline's historical default (0.8); delivery-backed
 * points are promoted, points from flat stretches are slightly demoted.
 */
export function relevanceFromDelivery(
  supportingQuotes: string[],
  chunk: ChunkEmphasis
): number {
  const backed = supportingQuotes.some((q) => quoteMatchesEmphasis(q, chunk.topUtterances));
  if (backed) return 0.95;
  if (chunk.mean < 0.1 && chunk.max < 0.3) return 0.7;
  return 0.8;
}

/**
 * Prompt block describing the speaker's delivery for a chunk. Empty string
 * when there's nothing notable — never pad the prompt with noise.
 */
export function deliveryPromptBlock(chunk: ChunkEmphasis): string {
  if (chunk.topUtterances.length === 0) return "";
  const moments = chunk.topUtterances
    .map((u, i) => {
      const signals: string[] = [];
      if (u.slowness > 0.3) signals.push("slowed down");
      if (u.pauseWeight > 0.3) signals.push(`paused ${u.pauseBefore.toFixed(1)}s before it`);
      if (u.repetition > 0) signals.push("repeated this phrasing elsewhere");
      return `${i + 1}. "${u.text.trim()}" (speaker ${signals.join(", ") || "emphasized this"})`;
    })
    .join("\n");
  return `\n\nDELIVERY ANALYSIS (from the speaker's actual audio delivery — pace, pauses, repetition):
The speaker gave extra weight to these moments. Treat content overlapping them as high-priority key points:
${moments}`;
}
