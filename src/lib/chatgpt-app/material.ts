import { createHash } from "crypto";
import { cleanText } from "@/lib/book-plan/normalize";
import { PLAN_LIMITS } from "@/lib/book-plan/schema";
import { ASSISTANT_SPEAKER, ASSISTANT_SPEAKER_MAP, type SpeakerMap } from "@/lib/speakers";
import type { TranscriptSegment } from "@/types";

/**
 * Material an AI assistant pushes into a book project (add_to_project). Stored
 * the same way as a finished T.H.E.O. session or a YouTube import: a stub
 * audio_uploads row plus a transcripts row, so every existing step (key points,
 * outline, chapters, T.H.E.O.'s briefing) can use it with no new reader.
 *
 * Two things differ, both deliberate:
 *   - Every segment carries the reserved ASSISTANT_SPEAKER label, so the
 *     voice readers (voice profile, voice match, voice picker) skip it. The
 *     story is the author's; the wording is the assistant's.
 *   - Both row ids are derived from (project, text), so a retried or doubled
 *     call hits the primary key instead of creating a second copy. No new
 *     column, no migration, and the guarantee is the database's own.
 *
 * Text is stored verbatim (cleaned of control characters only). Nothing here
 * or in the tool ever reads it as instructions.
 */

export const MATERIAL_LIMITS = { maxTextChars: PLAN_LIMITS.maxSourceChars, maxTitleChars: 200 } as const;

export const SOURCE_APPS = ["chatgpt", "claude", "other"] as const;
export const MATERIAL_KINDS = ["conversation", "notes", "memory"] as const;
export type SourceApp = (typeof SOURCE_APPS)[number];
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

const APP_LABEL: Record<SourceApp, string> = { chatgpt: "ChatGPT", claude: "Claude", other: "AI assistant" };
const KIND_LABEL: Record<MaterialKind, string> = { conversation: "conversation", notes: "notes", memory: "memories" };

export interface AssistantMaterial {
  /** sha256 of the stored text (hex). Same text, same hash. */
  contentHash: string;
  uploadId: string;
  transcriptId: string;
  fileName: string;
  fullText: string;
  segments: TranscriptSegment[];
  wordCount: number;
  speakerMap: SpeakerMap;
}

export class EmptyMaterialError extends Error {
  constructor() {
    super("text is empty after cleanup.");
    this.name = "EmptyMaterialError";
  }
}

/**
 * A stable UUID from a namespace and a hash (RFC 9562 version 8, "custom").
 * Postgres stores it like any uuid; the same inputs always give the same id.
 */
export function stableUuid(namespace: string, key: string): string {
  const b = createHash("sha256").update(`${namespace}\n${key}`).digest();
  b[6] = (b[6] & 0x0f) | 0x80; // version 8
  b[8] = (b[8] & 0x3f) | 0x80; // RFC variant
  const h = b.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Paragraphs as segments; full_text is rebuilt from them so word ranges line up. */
function toSegments(text: string): TranscriptSegment[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => ({ start: i, end: i + 1, text: p, speaker: ASSISTANT_SPEAKER }));
}

export function buildAssistantMaterial(input: {
  projectId: string;
  title: string;
  text: string;
  sourceApp: SourceApp;
  kind: MaterialKind;
}): AssistantMaterial {
  const segments = toSegments(cleanText(input.text ?? ""));
  if (segments.length === 0) throw new EmptyMaterialError();
  const fullText = segments.map((s) => s.text).join("\n\n");
  const contentHash = createHash("sha256").update(fullText).digest("hex");
  const key = `${input.projectId}\n${contentHash}`;
  const title = cleanText(input.title ?? "").replace(/\s+/g, " ").slice(0, MATERIAL_LIMITS.maxTitleChars) || "Untitled";
  return {
    contentHash,
    uploadId: stableUuid("dscribe:add_to_project:upload:v1", key),
    transcriptId: stableUuid("dscribe:add_to_project:transcript:v1", key),
    fileName: `${APP_LABEL[input.sourceApp]} ${KIND_LABEL[input.kind]}: ${title}`,
    fullText,
    segments,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    speakerMap: ASSISTANT_SPEAKER_MAP,
  };
}

export function sourceAppLabel(app: SourceApp): string {
  return APP_LABEL[app];
}
