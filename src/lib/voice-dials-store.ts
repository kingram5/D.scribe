/** Database side of the voice picker (server-only). */

import { createServerClient } from "@/lib/supabase";
import { recordInkUsage } from "@/lib/ink";
import { authorOnlyText, type LabeledTranscript } from "@/lib/speakers";
import { computeDials, generatePairs, voiceDialsBlock, type Pick } from "@/lib/voice-dials";

type Db = ReturnType<typeof createServerClient>;

/** Answered pairs after which the picker stops asking (once per author). */
export const PICKS_NEEDED = 6;

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

/** Open pairs for this author, generating a set from the project's draft when needed. */
export async function pickerState(userId: string, projectId: string): Promise<PickerState> {
  const db = createServerClient();
  const { count: answered } = await db.from("voice_pairs").select("id", { count: "exact", head: true })
    .eq("user_id", userId).not("answered_at", "is", null);
  if ((answered ?? 0) >= PICKS_NEEDED) return { done: true, answered: answered ?? 0, pairs: [] };

  let { data: open } = await db.from("voice_pairs").select("id, option_a, option_b, dimension")
    .eq("user_id", userId).is("answered_at", null).order("created_at");
  if (!open || open.length === 0) {
    // Build from the project's newest chapter text and the author's own spoken words.
    const { data: chapters } = await db.from("chapters").select("id").eq("project_id", projectId).gt("chapter_number", 0).order("chapter_number");
    let draft = "";
    for (const ch of chapters ?? []) {
      const { data: c } = await db.from("chapter_contents").select("content").eq("chapter_id", ch.id).order("version", { ascending: false }).limit(1).maybeSingle();
      if (c?.content) draft += `\n\n${c.content}`;
      if (draft.length > 12000) break;
    }
    if (!draft.trim()) return { done: false, answered: answered ?? 0, pairs: [] };
    const { data: txs } = await db.from("transcripts").select("full_text, segments, speaker_map").eq("project_id", projectId);
    const { pairs, usage } = await generatePairs({ draft, spokenLine: spokenLineFrom((txs ?? []) as LabeledTranscript[]) });
    for (const u of usage) await recordInkUsage(userId, projectId, "style_distill", "sonnet5", u);
    if (pairs.length) {
      const { data: inserted } = await db.from("voice_pairs")
        .insert(pairs.map((p) => ({ ...p, user_id: userId, project_id: projectId })))
        .select("id, option_a, option_b, dimension");
      open = inserted ?? [];
    }
  }
  return { done: false, answered: answered ?? 0, pairs: open ?? [] };
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
