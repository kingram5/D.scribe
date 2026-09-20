/**
 * Theo's homework: the MATERIAL DIGEST injected into the brainstorm system
 * prompt.
 *
 * v1 (feat/theo-interview-depth) gave Theo the project's key points and a few
 * quotes. v2 fixes what made that read like a recited list:
 *  - DYNAMIC: key points are ranked against what the author just said, every
 *    turn. With no conversation yet, the strongest by relevance_score.
 *  - MEMORY FIRST: sections are built with their own budgets and filled in
 *    order of value (continuity, matched points, thin chapters, excerpt), so an
 *    overflow trims the least valuable section, never the memory.
 *  - THE RIGHT MEMORY: continuity comes from a per-session HANDOFF written at
 *    Finish (strongest line, open thread, next question). Sessions that predate
 *    handoffs fall back to the author's LONGEST lines, not their first three,
 *    which were the warm-up.
 *  - SILENT BY DEFAULT (Kyle 2026-09-19): the digest sharpens the question.
 *    Whether Theo may say any of it aloud this turn is decided in code by the
 *    callback budget in theo/notes.ts, not here.
 *
 * Pure builders are separate from the Supabase reads so they stay testable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrainstormMessage } from "@/lib/brainstorm-session";

export interface BriefingKeyPoint {
  id?: string;
  title: string;
  summary: string;
  supporting_quotes?: string[];
  tags?: string[];
  relevance_score?: number;
}

export interface BriefingTranscript {
  name: string;
  text: string;
  /** The author's verbatim answers, when this transcript is a labeled brainstorm session. */
  authorLines?: string[];
}

/** Written by /api/brainstorm/summarize when a session is finished. */
export interface SessionHandoff {
  /** The strongest thing the author said, verbatim. */
  line: string;
  /** The thread left open. */
  openThread: string;
  /** The question Theo would ask next. Also shown to the author as homework. */
  nextQuestion: string;
  finishedAt?: string;
}

export interface ThinChapter {
  title: string;
  points: number;
}

export interface BriefingInput {
  keyPoints: BriefingKeyPoint[];
  transcripts: BriefingTranscript[];
  handoffs?: SessionHandoff[];
  thinChapters?: ThinChapter[];
  /** Theo's questions and the author's turns from finished sessions, for question memory. */
  pastSessions?: BrainstormMessage[][];
}

/** Character budget for the entire digest block, header instructions included. */
export const BRIEFING_BUDGET = 1800;

const SECTION_BUDGET = { continuity: 480, points: 820, chapters: 180, excerpt: 260 } as const;
const MAX_POINTS = 4;
const MAX_SUMMARY = 150;
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
export function excerptFrom(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const start = Math.floor(clean.length * 0.4);
  const window = clean.slice(start, start + max * 3);
  const cut = window.search(/[.!?]\s/);
  const fromSentence = cut >= 0 ? window.slice(cut + 1).trimStart() : window;
  return trim(fromSentence, max);
}

const STOP = new Set(
  "the a an and or but if then so of to in on at for with from by about as is are was were be been being it its this that these those i you he she we they me my your our their not no yes do did does have has had will would can could should just really very what when where who how why there here than too also into out up down over more most some any all".split(" "),
);

export function terms(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/**
 * Rank key points against the recent conversation. Word overlap is a cheap,
 * honest signal, NOT a probability: it only orders candidates. A point that
 * shares nothing with the conversation scores zero and is left out once the
 * conversation is under way, so Theo gets no homework on a turn where none of
 * it is relevant.
 */
export function rankKeyPoints(points: BriefingKeyPoint[], recentAuthorText: string, max = MAX_POINTS): BriefingKeyPoint[] {
  const want = terms(recentAuthorText);
  if (want.size === 0) {
    return [...points].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)).slice(0, max);
  }
  return points
    .map((kp) => {
      const have = terms(`${kp.title} ${kp.summary} ${(kp.tags ?? []).join(" ")}`);
      let overlap = 0;
      for (const w of want) if (have.has(w)) overlap++;
      return { kp, overlap };
    })
    .filter((x) => x.overlap >= 2)
    .sort((a, b) => b.overlap - a.overlap || (b.kp.relevance_score ?? 0) - (a.kp.relevance_score ?? 0))
    .slice(0, max)
    .map((x) => x.kp);
}

/** Fit lines into a character budget, whole lines only. */
function fit(lines: string[], budget: number): string[] {
  const out: string[] = [];
  let used = 0;
  for (const l of lines) {
    if (used + l.length + 1 > budget) break;
    out.push(l);
    used += l.length + 1;
  }
  return out;
}

/**
 * The digest. Empty string when there is nothing relevant to say this turn, so
 * a from-scratch brainstorm keeps a clean prompt.
 */
export function buildBriefingBlock(input: BriefingInput, recentAuthorText = ""): string {
  const sections: string[] = [];

  // 1. Continuity: what the author said last time. Most valuable, filled first.
  const continuity: string[] = [];
  const handoffs = (input.handoffs ?? []).filter((h) => h && (h.line || h.openThread));
  if (handoffs.length > 0) {
    const h = handoffs[0];
    if (h.line) continuity.push(`• Their strongest line last session: "${trim(h.line, 200)}"`);
    if (h.openThread) continuity.push(`• Thread left open: ${trim(h.openThread, 140)}`);
    if (h.nextQuestion) continuity.push(`• The question you left them with: "${trim(h.nextQuestion, 160)}"`);
  } else {
    const past = input.transcripts.flatMap((t) => t.authorLines ?? []);
    for (const line of past.slice(0, 3)) continuity.push(`• "${trim(line, MAX_VERBATIM)}"`);
  }
  const continuityFit = fit(continuity, SECTION_BUDGET.continuity);
  if (continuityFit.length) sections.push(["FROM EARLIER SESSIONS ON THIS BOOK (the author's own words; this is continuity):", ...continuityFit].join("\n"));

  // 2. The key points closest to what they are talking about right now.
  const ranked = rankKeyPoints(input.keyPoints, recentAuthorText);
  const pointLines: string[] = [];
  for (const kp of ranked) {
    pointLines.push(`• ${trim(kp.title, 80)}: ${trim(kp.summary, MAX_SUMMARY)}`);
    const quote = (kp.supporting_quotes ?? []).map((q) => q.trim()).find(Boolean);
    if (quote) pointLines.push(`   in their words: "${trim(quote, MAX_VERBATIM)}"`);
  }
  const pointsFit = fit(pointLines, SECTION_BUDGET.points);
  if (pointsFit.length) sections.push(["ALREADY RECORDED, closest to what they are saying now:", ...pointsFit].join("\n"));

  // 3. Where the outline is thin. Never named to the author.
  const thin = (input.thinChapters ?? []).slice(0, 2);
  if (thin.length) {
    const lines = fit(thin.map((c) => `• "${trim(c.title, 70)}" has ${c.points === 0 ? "no" : `only ${c.points}`} recorded point${c.points === 1 ? "" : "s"}`), SECTION_BUDGET.chapters);
    if (lines.length) sections.push(["THIN PARTS OF THE OUTLINE (steer toward these when the conversation allows; ask for a story, an example, or what it cost; NEVER mention chapters or an outline to the author):", ...lines].join("\n"));
  }

  // 4. A transcript excerpt, only when nothing better exists.
  if (!pointsFit.length && !continuityFit.length) {
    const plain = input.transcripts.filter((t) => (t.authorLines?.length ?? 0) === 0).slice(0, 1);
    const lines = fit(plain.map((t) => `• (from "${trim(t.name, 60)}") "${excerptFrom(t.text)}"`), SECTION_BUDGET.excerpt);
    if (lines.length) sections.push(["FROM THEIR RECORDINGS:", ...lines].join("\n"));
  }

  if (sections.length === 0) return "";

  const header = [
    "MATERIAL DIGEST. Homework you have already done on this author. It exists to make your QUESTION sharper, not to be recited:",
    "- Use it silently. Whether you may quote any of it aloud this turn is set in YOUR PRIVATE NOTES under CALLBACKS.",
    "- If they restate something already recorded, push one level underneath it instead of collecting it again.",
    "- Never invent, embellish, or paraphrase-as-quote. Only quote strings that appear here or in the conversation.",
  ].join("\n");

  let block = `${header}\n\n${sections.join("\n\n")}`;
  // Sections are individually budgeted, so this is a backstop, not the mechanism.
  if (block.length > BRIEFING_BUDGET) block = block.slice(0, BRIEFING_BUDGET - 1).trimEnd() + "…";
  return block;
}

/**
 * The author's own answers from a finished brainstorm that has no handoff.
 * LONGEST first: the first lines of a session are the warm-up, the long ones
 * are where they said something.
 */
export function extractAuthorLines(
  segments: { text?: string; speaker?: string }[] | null | undefined,
): string[] {
  if (!Array.isArray(segments)) return [];
  return segments
    .filter((s) => s && s.speaker === "Author" && typeof s.text === "string")
    .map((s) => (s.text as string).replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 40) // greetings and "yes" fragments are not memory
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

/** Chapters with the fewest linked key points, thinnest first. */
export function thinChaptersFrom(chapters: { title?: string | null; key_point_ids?: unknown; sort_order?: number | null }[]): ThinChapter[] {
  return chapters
    .filter((c) => c && typeof c.title === "string" && c.title.trim())
    .map((c) => ({ title: c.title as string, points: Array.isArray(c.key_point_ids) ? c.key_point_ids.length : 0 }))
    .filter((c) => c.points <= 1)
    .sort((a, b) => a.points - b.points)
    .slice(0, 2);
}

/**
 * The Supabase reads. All failures degrade to "no material": a brainstorm
 * session must never 500 because its homework block failed.
 */
export async function loadBriefingData(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<BriefingInput> {
  const empty: BriefingInput = { keyPoints: [], transcripts: [], handoffs: [], thinChapters: [], pastSessions: [] };
  try {
    const [kpRes, txRes, upRes, chRes, sessRes] = await Promise.all([
      supabase.from("key_points").select("id, title, summary, supporting_quotes, tags, relevance_score").eq("project_id", projectId),
      supabase.from("transcripts").select("audio_upload_id, full_text, segments").eq("project_id", projectId).order("created_at", { ascending: false }).limit(3),
      supabase.from("audio_uploads").select("id, file_name").eq("project_id", projectId).eq("user_id", userId),
      supabase.from("chapters").select("title, key_point_ids, sort_order").eq("project_id", projectId).order("sort_order", { ascending: true }),
      supabase.from("brainstorm_sessions").select("messages, handoff, updated_at").eq("project_id", projectId).eq("user_id", userId).eq("status", "finished").order("updated_at", { ascending: false }).limit(3),
    ]);

    const keyPoints: BriefingKeyPoint[] = ((kpRes.data as BriefingKeyPoint[]) ?? []).filter((kp) => kp && kp.title && kp.summary);

    const nameById = new Map<string, string>();
    for (const up of (upRes.data as { id: string; file_name: string }[]) ?? []) {
      if (up?.id) nameById.set(up.id, up.file_name || "recording");
    }

    type TxRow = { audio_upload_id: string | null; full_text: string; segments: { text?: string; speaker?: string }[] | null };
    const transcripts: BriefingTranscript[] = ((txRes.data ?? []) as TxRow[])
      .filter((t) => t && t.full_text)
      .map((t) => ({
        name: (t.audio_upload_id && nameById.get(t.audio_upload_id)) || "recording",
        text: t.full_text,
        authorLines: extractAuthorLines(t.segments),
      }));

    type SessRow = { messages: BrainstormMessage[] | null; handoff: SessionHandoff | null; updated_at: string };
    const sessions = (sessRes.data ?? []) as SessRow[];
    const handoffs = sessions.flatMap((s) => (s.handoff && typeof s.handoff === "object" ? [{ ...s.handoff, finishedAt: s.updated_at }] : []));
    const pastSessions = sessions.map((s) => (Array.isArray(s.messages) ? s.messages : [])).reverse();

    return {
      keyPoints,
      transcripts,
      handoffs,
      thinChapters: thinChaptersFrom((chRes.data ?? []) as { title: string; key_point_ids: unknown; sort_order: number }[]),
      pastSessions,
    };
  } catch {
    return empty;
  }
}
