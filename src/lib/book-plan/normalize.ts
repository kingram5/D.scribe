import { createHash } from "crypto";
import { PLAN_LIMITS } from "./schema";

/**
 * Source normalization. Turns pasted transcript text or notes into numbered
 * segments ("s1", "s2", ...) that a plan can cite. Segment ids are stable for a
 * given input, so a reference made by ChatGPT's model, our generator, or a
 * later refinement always points at the same words.
 *
 * Source text is DATA. Nothing here, or downstream, ever executes or follows
 * instructions found inside it; prompts wrap it in a fenced block and the tool
 * handlers derive identity and permissions only from the verified token.
 */

export interface SourceSegment {
  id: string;
  text: string;
}

export interface NormalizedSource {
  segments: SourceSegment[];
  /** sha256 of the normalized text: binds a preview to exactly what was sent. */
  digest: string;
  charCount: number;
  wordCount: number;
  truncated: false;
}

export class SourceTooLargeError extends Error {
  constructor(public readonly chars: number, public readonly limit: number) {
    super(`Source is ${chars} characters; the limit is ${limit}.`);
    this.name = "SourceTooLargeError";
  }
}

/** Collapse Windows line endings, strip control characters, trim trailing space. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const TARGET_SEGMENT_CHARS = 900;

/**
 * Split on blank lines (paragraphs); merge tiny paragraphs and break very long
 * ones on sentence boundaries so each segment is citeable but not huge.
 * Transcripts with no blank lines still segment, by sentence groups.
 */
export function segmentText(text: string): SourceSegment[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  const pieces: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= TARGET_SEGMENT_CHARS * 1.5) {
      pieces.push(p);
      continue;
    }
    const sentences = p.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [p];
    let buf = "";
    for (const s of sentences) {
      if (buf && buf.length + s.length > TARGET_SEGMENT_CHARS) {
        pieces.push(buf.trim());
        buf = "";
      }
      buf += s;
    }
    if (buf.trim()) pieces.push(buf.trim());
  }

  // Merge fragments shorter than ~120 chars into the previous piece.
  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last !== undefined && piece.length < 120 && last.length + piece.length < TARGET_SEGMENT_CHARS * 1.5) {
      merged[merged.length - 1] = `${last} ${piece}`;
    } else {
      merged.push(piece);
    }
  }

  return merged.map((t, i) => ({ id: `s${i + 1}`, text: t }));
}

export function normalizeSource(raw: string, limit: number = PLAN_LIMITS.maxSourceChars): NormalizedSource {
  const text = cleanText(raw ?? "");
  if (text.length > limit) throw new SourceTooLargeError(text.length, limit);
  const segments = text ? segmentText(text) : [];
  return {
    segments,
    digest: createHash("sha256").update(text).digest("hex"),
    charCount: text.length,
    wordCount: text ? text.split(/\s+/).length : 0,
    truncated: false,
  };
}

/** Whitespace- and quote-insensitive comparison key for verbatim checks. */
export function quoteKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render segments for a model prompt. The fence tag and the instruction around
 * it tell the model the block is untrusted material to organize, never orders.
 */
export function fenceSegments(segments: SourceSegment[]): string {
  const body = segments.map((s) => `[${s.id}] ${s.text.replace(/<\/?source_material>/gi, "")}`).join("\n\n");
  return `<source_material>\n${body}\n</source_material>`;
}
