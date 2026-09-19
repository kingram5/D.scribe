/**
 * Theo's homework — the MATERIAL DIGEST injected into the brainstorm system
 * prompt.
 *
 * The interviewer used to see only the chat history, the project title and the
 * first 200 characters of the topic. The author's actual recorded material —
 * distilled key points, verbatim transcript lines — sat in tables the pipeline
 * already fills, unused. An expert interviewer quotes your own words back at
 * you; this module gives Theo the quotes.
 *
 * Two parts:
 *  - Pure builders (buildBriefingBlock and friends) — testable, no I/O.
 *  - loadBriefingData — thin Supabase reads, called from the brainstorm route.
 *
 * The block is HARD-CAPPED: it rides the system prompt on every turn of a
 * streamed conversation, so an unbounded digest would tax every turn.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BriefingKeyPoint {
  title: string;
  summary: string;
  supporting_quotes?: string[];
}

export interface BriefingTranscript {
  name: string;
  text: string;
  /** The author's verbatim answers, when this transcript is a labeled brainstorm session. */
  authorLines?: string[];
}

/** Character budget for the entire digest block, header instructions included. */
export const BRIEFING_BUDGET = 1800;

const MAX_POINTS = 8;
const MAX_SUMMARY = 160;
const MAX_EXCERPTS = 2;
const MAX_EXCERPT = 220;
const MAX_VERBATIM = 140;

function trim(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/**
 * A verbatim excerpt from the middle of a transcript. The opening minute of a
 * talk is usually wind-up ("thanks for having me"); the middle is where the
 * substance lives.
 */
export function excerptFrom(text: string, max = MAX_EXCERPT): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const start = Math.floor(clean.length * 0.4);
  const window = clean.slice(start, start + max * 3);
  const cut = window.search(/[.!?]\s/);
  const fromSentence = cut >= 0 ? window.slice(cut + 1).trimStart() : window;
  return trim(fromSentence, max);
}

export interface BriefingInput {
  keyPoints: BriefingKeyPoint[];
  transcripts: BriefingTranscript[];
}

/**
 * The digest. Empty string when the project has no material yet — a brainstorm
 * that starts from zero gets no block at all, so the prompt stays clean.
 */
export function buildBriefingBlock(input: BriefingInput): string {
  const points = input.keyPoints.slice(0, MAX_POINTS);
  const verbatims: string[] = [];

  for (const kp of input.keyPoints) {
    for (const q of kp.supporting_quotes ?? []) {
      if (verbatims.length >= 3) break;
      const t = q.trim();
      if (t) verbatims.push(`"${trim(t, MAX_VERBATIM)}"`);
    }
    if (verbatims.length >= 3) break;
  }

  const lines: string[] = [];

  if (points.length > 0) {
    lines.push("KEY POINTS ALREADY DISTILLED FROM THE AUTHOR'S RECORDINGS:");
    for (const kp of points) {
      lines.push(`• ${trim(kp.title, 80)} — ${trim(kp.summary, MAX_SUMMARY)}`);
    }
  }

  if (verbatims.length > 0) {
    lines.push("THE AUTHOR'S OWN WORDS (verbatim, from their recordings):");
    for (const v of verbatims) lines.push(`• ${v}`);
  }

  if (input.transcripts.length > 0) {
    const brainstormed = input.transcripts.filter((t) => (t.authorLines?.length ?? 0) > 0);
    if (brainstormed.length > 0) {
      lines.push("THE AUTHOR'S ANSWERS FROM EARLIER BRAINSTORM SESSIONS (verbatim — this is continuity; call back to them and go deeper):");
      for (const t of brainstormed) {
        for (const line of t.authorLines!.slice(0, 3)) {
          lines.push(`• "${trim(line, MAX_VERBATIM)}"`);
        }
      }
    }
    const plain = input.transcripts.filter((t) => (t.authorLines?.length ?? 0) === 0);
    if (plain.length > 0) {
      lines.push("TRANSCRIPT EXCERPTS:");
      for (const t of plain.slice(0, MAX_EXCERPTS)) {
        lines.push(`• (from "${trim(t.name, 60)}") "${excerptFrom(t.text)}"`);
      }
    }
  }

  if (lines.length === 0) return "";

  const instructions = [
    "MATERIAL DIGEST — This project already holds the author's recorded material. Treat it as homework you have done:",
    "- When the conversation touches one of these, quote the author's exact words (verbatim, in quotation marks) and ask about what sits underneath the statement.",
    "- Build on what exists. If they restate something already recorded, say so and push one level deeper instead of starting over.",
    "- Never invent, embellish, or paraphrase-as-quote. Only quote strings that appear in this digest.",
  ];

  let block = `${instructions.join("\n")}\n\n${lines.join("\n")}`;
  if (block.length > BRIEFING_BUDGET) block = block.slice(0, BRIEFING_BUDGET - 1).trimEnd() + "…";
  return block;
}

/**
 * The Supabase reads. Kept separate from the builders so the digest logic is
 * testable without a database. All failures degrade to "no material" — a
 * brainstorm session must never 500 because its homework block failed.
 */
export async function loadBriefingData(
  supabase: SupabaseClient,
  projectId: string,
  userId: string
): Promise<BriefingInput> {
  const empty: BriefingInput = { keyPoints: [], transcripts: [] };
  try {
    const [kpRes, txRes, upRes] = await Promise.all([
      supabase
        .from("key_points")
        .select("title, summary, supporting_quotes")
        .eq("project_id", projectId),
      supabase
        .from("transcripts")
        .select("audio_upload_id, full_text, segments")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("audio_uploads")
        .select("id, file_name")
        .eq("project_id", projectId)
        .eq("user_id", userId),
    ]);

    const keyPoints: BriefingKeyPoint[] = ((kpRes.data as BriefingKeyPoint[]) ?? []).filter(
      (kp) => kp && kp.title && kp.summary
    );

    const nameById = new Map<string, string>();
    for (const up of (upRes.data as { id: string; file_name: string }[]) ?? []) {
      if (up?.id) nameById.set(up.id, up.file_name || "recording");
    }

    type TxRow = {
      audio_upload_id: string | null;
      full_text: string;
      segments: { text?: string; speaker?: string }[] | null;
    };
    const txRows = (txRes.data ?? []) as TxRow[];
    const transcripts: BriefingTranscript[] = txRows
      .filter((t) => t && t.full_text)
      .map((t) => ({
        name: (t.audio_upload_id && nameById.get(t.audio_upload_id)) || "recording",
        text: t.full_text,
        authorLines: extractAuthorLines(t.segments),
      }));

    return { keyPoints, transcripts };
  } catch {
    return empty;
  }
}

/**
 * The author's own answers from a finished brainstorm. Summarize saves every
 * session as a labeled transcript (speaker "Author"), so past sessions are the
 * memory: surface what the author actually SAID last time, verbatim, so Theo
 * can call back and push deeper instead of starting cold.
 */
export function extractAuthorLines(
  segments: { text?: string; speaker?: string }[] | null | undefined,
): string[] {
  if (!Array.isArray(segments)) return [];
  return segments
    .filter((s) => s && s.speaker === "Author" && typeof s.text === "string")
    .map((s) => (s.text as string).replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 40) // greetings and "yes" fragments are not memory
    .slice(0, 3);
}

