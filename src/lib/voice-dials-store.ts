/** Database side of the voice picker (server-only). */

import { createServerClient } from "@/lib/supabase";
import { recordInkUsage } from "@/lib/ink";
import { authorOnlyText, type LabeledTranscript } from "@/lib/speakers";
import { computeDials, generatePairs, voiceDialsBlock, type Pick } from "@/lib/voice-dials";

type Db = ReturnType<typeof createServerClient>;

/**
 * The picker runs while the editor reads (Kyle 9/28: six picks ran out with
 * ~80% of the wait left). It keeps serving batches for this book until the
 * editor finishes or this many pairs exist for the book (cost cap).
 */
export const PAIRS_PER_BOOK_CAP = 30;
/** Generate the next batch when this few unanswered pairs remain. */
export const REFILL_AT = 3;

/** The writer block for a user, or "" when they never used the picker. */
export async function loadVoiceDialsBlock(userId: string, db: Db = createServerClient()): Promise<string> {
  const { data } = await db.from("user_voice_dials").select("dials, polish_bias, rewrites").eq("user_id", userId).maybeSingle();
  if (!data) return "";
  return voiceDialsBlock(data.dials, Number(data.polish_bias ?? 0), Array.isArray(data.rewrites) ? data.rewrites : []);
}

/** A 12-35 word line the author actually said, for the anchor pair. */
function spokenLineFrom(transcripts: LabeledTranscript[]): string | null {
  for (const t of transcripts) {
    const lines = authorOnlyText(t).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
    const hit = lines.find((l) => { const n = l.split(" ").length; return n >= 12 && n <= 35 && !/["“”]/.test(l); });
    if (hit) return hit;
  }
  return null;
}

export interface PickerState {
  done: boolean;
  answered: number;
  pairs: { id: string; option_a: string; option_b: string; dimension: string }[];
}

/**
 * Open pairs for this book, topping up with a fresh batch from the draft when
 * the author is nearly through them. Batches never reuse a source sentence.
 */
export async function pickerState(userId: string, projectId: string): Promise<PickerState> {
  const db = createServerClient();
  const { data: rows } = await db.from("voice_pairs")
    .select("id, option_a, option_b, dimension, source_sentence, answered_at")
    .eq("user_id", userId).eq("project_id", projectId).order("created_at");
  const all = rows ?? [];
  const answered = all.filter((r) => r.answered_at).length;
  const shape = (r: (typeof all)[number]) => ({ id: r.id, option_a: r.option_a, option_b: r.option_b, dimension: r.dimension });
  let open = all.filter((r) => !r.answered_at).map(shape);
  if (all.length >= PAIRS_PER_BOOK_CAP) return { done: open.length === 0, answered, pairs: open };
  if (open.length > REFILL_AT) return { done: false, answered, pairs: open };

  // Build a batch from the project's newest chapter text and the author's own spoken words.
  const { data: chapters } = await db.from("chapters").select("id").eq("project_id", projectId).gt("chapter_number", 0).order("chapter_number");
  let draft = "";
  for (const ch of chapters ?? []) {
    const { data: c } = await db.from("chapter_contents").select("content").eq("chapter_id", ch.id).order("version", { ascending: false }).limit(1).maybeSingle();
    if (c?.content) draft += `

${c.content}`;
    if (draft.length > 40000) break;
  }
  if (!draft.trim()) return { done: open.length === 0 && answered > 0, answered, pairs: open };
  const hasAnchor = all.some((r) => r.dimension === "anchor");
  let spokenLine: string | null = null;
  if (!hasAnchor) {
    const { data: txs } = await db.from("transcripts").select("full_text, segments, speaker_map").eq("project_id", projectId);
    spokenLine = spokenLineFrom((txs ?? []) as LabeledTranscript[]);
  }
  const { pairs, usage } = await generatePairs({ draft, spokenLine, exclude: all.map((r) => r.source_sentence).filter(Boolean) });
  for (const u of usage) await recordInkUsage(userId, projectId, "style_distill", "sonnet5", u);
  const room = PAIRS_PER_BOOK_CAP - all.length;
  if (pairs.length && room > 0) {
    const { data: inserted } = await db.from("voice_pairs")
      .insert(pairs.slice(0, room).map((p) => ({ ...p, user_id: userId, project_id: projectId })))
      .select("id, option_a, option_b, dimension");
    open = [...open, ...(inserted ?? [])];
  }
  return { done: open.length === 0, answered, pairs: open };
}

/** Save one pick and recompute the author's dials from every pick so far. */
export async function savePick(userId: string, pairId: string, choice: "a" | "b" | "neither", rewrite?: string | null) {
  const db = createServerClient();
  const clean = rewrite?.replace(/\s+/g, " ").trim().slice(0, 400) || null;
  const { data: pair } = await db.from("voice_pairs").update({ choice, rewrite: clean, answered_at: new Date().toISOString() })
    .eq("id", pairId).eq("user_id", userId).select("id").maybeSingle();
  if (!pair) throw new Error("Pair not found");

  const { data: all } = await db.from("voice_pairs").select("dimension, a_pole, choice, rewrite").eq("user_id", userId).not("answered_at", "is", null);
  const picks = (all ?? []).filter((p) => p.choice) as Pick[];
  const { dials, polishBias } = computeDials(picks);
  const rewrites = (all ?? []).map((p) => p.rewrite).filter((r): r is string => !!r).slice(-10);
  await db.from("user_voice_dials").upsert({
    user_id: userId, dials, polish_bias: polishBias, rewrites, picks: picks.length, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  return { dials, polishBias, picks: picks.length };
}
