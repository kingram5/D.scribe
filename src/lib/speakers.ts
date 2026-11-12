/**
 * Who said what (Kyle 2026-09-27). Transcription splits a recording into
 * Speaker 0 / Speaker 1…; the author labels each one at the transcript step
 * (the book's author, or someone else with a name and relationship). Every
 * later step reads the labels, so the interviewer never asks the author about
 * someone else's life and the writer never turns another person's story into
 * the author's first-person memory.
 *
 * Contract: a transcript with no speaker_map behaves exactly as before (every
 * word is the author's). Nothing here changes output for unlabeled projects.
 */

import type { TranscriptSegment } from "@/types";

export type SpeakerRole = "author" | "other";

export interface SpeakerLabel {
  role: SpeakerRole;
  /** Display name for someone else ("Pastor Mike"). Unused for the author. */
  name?: string;
  /** Who they are to the author ("my pastor", "my grandmother"). */
  relationship?: string;
}

/** Keyed by the raw diarization label ("Speaker 0", "Author", "Interviewer"). */
export type SpeakerMap = Record<string, SpeakerLabel>;

export interface LabeledTranscript {
  full_text: string;
  segments: TranscriptSegment[] | null;
  speaker_map?: SpeakerMap | null;
}

/** Brainstorm sessions are saved with fixed labels; they never need asking. */
export const BRAINSTORM_SPEAKER_MAP: SpeakerMap = {
  Author: { role: "author" },
  Interviewer: { role: "other", name: "T.H.E.O.", relationship: "the D.Scribe interviewer" },
};

export function isLabeled(t: Pick<LabeledTranscript, "speaker_map">): boolean {
  return !!t.speaker_map && Object.keys(t.speaker_map).length > 0;
}

/** Raw speaker labels in order of first appearance. */
export function speakersIn(segments: TranscriptSegment[] | null | undefined): string[] {
  const seen: string[] = [];
  for (const s of segments ?? []) if (s?.speaker && !seen.includes(s.speaker)) seen.push(s.speaker);
  return seen;
}

/** True when every speaker present in the segments has a label. */
export function allSpeakersLabeled(t: LabeledTranscript): boolean {
  if (!isLabeled(t)) return false;
  return speakersIn(t.segments).every((sp) => !!t.speaker_map![sp]);
}

/** Short tag used in model input: [Author] or [Pastor Mike, my pastor]. */
export function speakerTag(label: SpeakerLabel | undefined): string {
  if (!label || label.role === "author") return "[Author]";
  const name = (label.name || "Another speaker").trim();
  return label.relationship ? `[${name}, ${label.relationship.trim()}]` : `[${name}]`;
}

export function displayName(label: SpeakerLabel | undefined): string {
  if (!label || label.role === "author") return "the author";
  return (label.name || "another speaker").trim();
}

const splitWords = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Word ranges of each segment inside full_text. full_text is the segments'
 * text joined with whitespace, so segment i covers the next N words. Returns
 * null when the two don't line up (legacy rows, hand-edited text).
 */
function segmentWordRanges(t: LabeledTranscript): { start: number; end: number; speaker: string }[] | null {
  const segs = t.segments ?? [];
  if (!segs.length) return null;
  const ranges: { start: number; end: number; speaker: string }[] = [];
  let cursor = 0;
  for (const s of segs) {
    const n = splitWords(s.text ?? "").length;
    ranges.push({ start: cursor, end: cursor + n, speaker: s.speaker });
    cursor += n;
  }
  const total = splitWords(t.full_text).length;
  if (cursor === total) return ranges;
  if (cursor === 0 || total === 0) return null;
  // full_text was edited apart from the segments (legacy rows): map each segment
  // onto full_text proportionally. Exact for one speaker; near a speaker change
  // the tag can land a few words early or late.
  const scale = total / cursor;
  return ranges.map((r, i) => ({
    start: Math.round(r.start * scale),
    end: i === ranges.length - 1 ? total : Math.round(r.end * scale),
    speaker: r.speaker,
  }));
}

/**
 * at every change of speaker. Unlabeled transcripts return the plain words
 * unchanged, which is byte-identical to what chunkTranscript produced before
 * labels existed.
 */
export function labeledRange(t: LabeledTranscript, startWord: number, wordCount: number): string {
  const words = splitWords(t.full_text);
  const plain = words.slice(startWord, startWord + wordCount).join(" ");
  if (!isLabeled(t)) return plain;
  const ranges = segmentWordRanges(t);
  if (!ranges) return plain;

  const out: string[] = [];
  let last: string | null = null;
  const end = startWord + wordCount;
  for (const r of ranges) {
    const from = Math.max(r.start, startWord);
    const to = Math.min(r.end, end);
    if (from >= to) continue;
    const tag = speakerTag(t.speaker_map![r.speaker]);
    if (tag !== last) {
      out.push(`${out.length ? "\n\n" : ""}${tag}: `);
      last = tag;
    } else {
      out.push(" ");
    }
    out.push(words.slice(from, to).join(" "));
  }
  return out.join("");
}

/** Whole transcript with speaker tags (or plain full_text when unlabeled). */
export function labeledText(t: LabeledTranscript): string {
  if (!isLabeled(t)) return t.full_text;
  return labeledRange(t, 0, splitWords(t.full_text).length);
}

/** Strip any [Tag]: prefixes a model may have copied into a quote. */
export function stripSpeakerTags(quote: string): string {
  return quote.replace(/\[[^\]\n]{1,80}\]:\s*/g, "").trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Who owns a quote, found by locating it in the segments (deterministic: the
 * model is never trusted to name a speaker). Returns null when the transcript
 * is unlabeled or the quote can't be found.
 */
export function speakerOfQuote(t: LabeledTranscript, quote: string): SpeakerLabel | null {
  if (!isLabeled(t)) return null;
  const q = norm(stripSpeakerTags(quote));
  if (q.length < 8) return null;
  // Prefer a single segment containing the quote; fall back to the segment
  // holding the quote's opening words (quotes can straddle a segment break).
  const probe = q.split(" ").slice(0, 6).join(" ");
  let hit: TranscriptSegment | undefined;
  for (const s of t.segments ?? []) {
    const text = norm(s.text ?? "");
    if (text.includes(q)) { hit = s; break; }
    if (!hit && probe.length >= 8 && text.includes(probe)) hit = s;
  }
  return hit ? t.speaker_map![hit.speaker] ?? null : null;
}

export interface QuoteOwnership {
  role: SpeakerRole | "mixed" | null;
  name: string | null;
}

/** Owner of a key point from its supporting quotes: author, one other speaker, or mixed. */
export function ownerOfQuotes(t: LabeledTranscript, quotes: string[]): QuoteOwnership {
  const owners = quotes.map((q) => speakerOfQuote(t, q)).filter((x): x is SpeakerLabel => !!x);
  if (!owners.length) return { role: null, name: null };
  const keys = [...new Set(owners.map((o) => (o.role === "author" ? "author" : `other:${displayName(o)}`)))];
  if (keys.length > 1) return { role: "mixed", name: null };
  const o = owners[0];
  return o.role === "author" ? { role: "author", name: null } : { role: "other", name: displayName(o) };
}

/** Text spoken by the author only, for the voice baseline. Unlabeled = everything. */
export function authorOnlyText(t: LabeledTranscript): string {
  if (!isLabeled(t)) return t.full_text;
  return (t.segments ?? [])
    .filter((s) => t.speaker_map![s.speaker]?.role === "author")
    .map((s) => s.text)
    .join("\n\n");
}

/** Model-facing rule, added only when a project has other speakers in it. */
export const OTHER_SPEAKERS_RULE = `SPEAKERS IN THE SOURCE: Lines tagged [Author] are the author's own words and experiences. Lines tagged with any other name belong to that person, not the author. Never present another speaker's experiences, memories or opinions as the author's own, and never ask the author about another speaker's life as if it were theirs. When using another speaker's words, quote and credit them ("As Pastor Mike put it, ..."), and ask the author for their own reaction or their own version.`;

/** True when a labeled transcript has anyone other than the author in it. */
export function hasOtherSpeakers(t: Pick<LabeledTranscript, "speaker_map">): boolean {
  return isLabeled(t) && Object.values(t.speaker_map!).some((l) => l.role === "other");
}

/**
 * Extra instruction for key-point extraction when a transcript contains other
 * speakers. Empty for unlabeled or author-only transcripts, so their prompt is
 * unchanged.
 */
export function extractionSpeakerBlock(t: LabeledTranscript): string {
  if (!hasOtherSpeakers(t)) return "";
  return `\n\nSPEAKERS: Each line is tagged with who said it. [Author] is the person writing this book; every other tag is someone else. Extract points from the whole conversation, but make each summary say who holds the view or lived the story when it isn't the author (e.g. "Pastor Mike describes..."). Copy supporting quotes verbatim WITHOUT the speaker tag.`;
}

/**
 * Speaker columns for a key point row, from where its quotes sit. Empty object
 * for unlabeled transcripts, so their insert is exactly what it was.
 */
export function keyPointSpeakerColumns(t: LabeledTranscript, quotes: string[]): { speaker_role?: string | null; speaker_name?: string | null } {
  if (!isLabeled(t)) return {};
  const owner = ownerOfQuotes(t, quotes);
  return { speaker_role: owner.role, speaker_name: owner.name };
}

/** Source text for model input across a project's transcripts (tagged where labeled). */
export function projectSourceText(transcripts: LabeledTranscript[]): string {
  return transcripts.map(labeledText).join("\n\n");
}

/** Key point as the writer sees it: others' points say whose they are. */
export function keyPointForPrompt<T extends { title: string; summary: string; speaker_role?: string | null; speaker_name?: string | null }>(kp: T): T {
  if (kp.speaker_role === "other" && kp.speaker_name) return { ...kp, summary: `${kp.summary} (This comes from ${kp.speaker_name}, not the author.)` };
  if (kp.speaker_role === "mixed") return { ...kp, summary: `${kp.summary} (Draws on the author and another speaker; keep who said what straight.)` };
  return kp;
}

/**
 * Text to learn the author's voice from: only their own lines when they've
 * labeled speakers and said enough (300+ words); otherwise everything, exactly
 * as before labels existed.
 */
export function voiceSourceText(t: LabeledTranscript): string {
  const own = authorOnlyText(t);
  return isLabeled(t) && own.split(/\s+/).filter(Boolean).length >= 300 ? own : t.full_text;
}

/** Speaker labelling is on (UI panel + analysis gate). Off = nothing changes. */
export function speakerLabelsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SPEAKER_LABELS === "true";
}

/**
 * Labels not yet confirmed: flag on, the transcript has speaker segments
 * (pasted text has none), and nobody has confirmed them yet. A nudge only;
 * nothing is blocked on it (Kyle 9/28).
 */
export function needsSpeakerLabels(t: { segments: TranscriptSegment[] | null; speakers_confirmed_at?: string | null }): boolean {
  return speakerLabelsEnabled() && (t.segments?.length ?? 0) > 0 && !t.speakers_confirmed_at;
}

/** Names of the other people in a project's labeled recordings. */
export function otherSpeakerNames(transcripts: Pick<LabeledTranscript, "speaker_map">[]): string[] {
  const names = new Set<string>();
  for (const t of transcripts) {
    for (const l of Object.values(t.speaker_map ?? {})) if (l.role === "other" && l.name) names.add(l.name.trim());
  }
  return [...names];
}

/**
 * Writing instruction placed at the END of the chapter prompt (closest to the
 * output), because the base prompt tells the writer the author IS the voice of
 * the source. Tested 9/27: with the rule only in the system prompt, Sonnet 5
 * still wrote another pastor's sermon as the author's first-person memories.
 * Empty when there are no other speakers, so unlabeled prompts are unchanged.
 */
export function speakerWritingBlock(names: string[]): string {
  if (!names.length) return "";
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `\n\nWHO SAID WHAT (this overrides the point-of-view rule above wherever they conflict): Some or all of the source material is ${who}'s words, not the author's. Lines tagged [Author] are the author's own. Everything tagged with another name belongs to that person. Still write in the author's first person, but as the author drawing on and responding to ${who}: credit their ideas, stories, scripture readings and claims to them by name ("${names[0]} puts it this way...", "I first heard ${names[0]} tell the story of..."). Never use "I" for anything ${who} did, saw, preached, taught, counted or lived through. If the source gives no personal story of the author's for a point, make the point through ${who}'s words and leave the author's personal experience out rather than inventing it.`;
}
