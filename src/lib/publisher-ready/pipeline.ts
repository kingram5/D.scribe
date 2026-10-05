/**
 * Publisher-Ready pipeline steps (server-only): load from the database, call
 * the model step in core.ts, bill, save. One chapter per call so every request
 * stays inside the 300s function limit; the client drives the chapters with a
 * small concurrency cap.
 *
 * Models (Kyle 2026-09-27, BMO mix): draft Sonnet 5 -> editor Fable 5.1 ->
 * interview Sonnet 5 -> revise Opus 5.5 -> final check Sonnet 5.
 */

import { createServerClient } from "@/lib/supabase";
import { recordInkUsage, type InkOperation } from "@/lib/ink";
import { loadStyleMemory, styleMemoryPromptBlock } from "@/lib/style-memory";
import { extractExcerptsForChapter } from "@/lib/chunker";
import type { ClaudeUsage } from "@/lib/claude-lite";
import type { Beat } from "./prompts";
import { lintStructure } from "./structural-lint";
import { loadVoiceDialsBlock } from "@/lib/voice-dials-store";
import { projectSourceText, hasOtherSpeakers, keyPointForPrompt, otherSpeakerNames, type LabeledTranscript } from "@/lib/speakers";
import {
  DEFAULT_MIX, coreDraft, coreEdit, coreRevise, coreFinal,
  type ChapterInput, type Spend, type StepKey,
} from "./core";

export { applyEdits } from "./core";

/** Which model and effort each step runs on. One place to change the mix. */
export const STEP_MODELS = DEFAULT_MIX;

type Db = ReturnType<typeof createServerClient>;

export class StepError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const OP_FOR_STEP: Record<StepKey, InkOperation> = {
  beats: "pr_draft", draft: "pr_draft", edit: "pr_edit", coverage: "pr_interview",
  interview: "pr_interview", revise: "pr_revise", final: "pr_final",
};

async function bill(userId: string, projectId: string, spend: Spend[]) {
  for (const s of spend) await recordInkUsage(userId, projectId, OP_FOR_STEP[s.step], s.model, s.usage);
}

function totalUsage(spend: Spend[]): ClaudeUsage {
  return spend.reduce<ClaudeUsage>((a, s) => ({
    input_tokens: a.input_tokens + s.usage.input_tokens,
    output_tokens: a.output_tokens + s.usage.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens || 0) + (s.usage.cache_read_input_tokens || 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens || 0) + (s.usage.cache_creation_input_tokens || 0),
  }), { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
}

export interface ChapterContext {
  projectId: string;
  input: ChapterInput;
  latest: { content: string; version: number } | null;
}

/** Load a chapter the user owns, with its source excerpts, voice and latest text. */
export async function loadChapterContext(db: Db, userId: string, chapterId: string): Promise<ChapterContext> {
  const { data: chapter } = await db.from("chapters").select("*").eq("id", chapterId).single();
  if (!chapter) throw new StepError("Chapter not found", 404);
  const { data: project } = await db.from("projects").select("*").eq("id", chapter.project_id).eq("user_id", userId).single();
  if (!project) throw new StepError("Project not found", 404);

  const [transcripts, keyPoints, prev, latest, memory] = await Promise.all([
    db.from("transcripts").select("full_text, segments, speaker_map").eq("project_id", chapter.project_id),
    db.from("key_points").select("*").in("id", chapter.key_point_ids || []),
    db.from("chapters").select("title, summary").eq("project_id", chapter.project_id)
      .lt("chapter_number", chapter.chapter_number).gt("chapter_number", 0).order("chapter_number"),
    db.from("chapter_contents").select("content, version").eq("chapter_id", chapterId)
      .order("version", { ascending: false }).limit(1).maybeSingle(),
    loadStyleMemory(userId),
  ]);
  const txs = (transcripts.data || []) as LabeledTranscript[];
  const fullText = projectSourceText(txs);
  const kps = keyPoints.data || [];
  return {
    projectId: project.id,
    latest: latest.data ? { content: latest.data.content, version: latest.data.version } : null,
    input: {
      projectTitle: project.title,
      audience: project.audience,
      scriptureTranslation: project.scripture_translation,
      voiceProfile: project.voice_profile,
      // Learned edits + the author's voice picks (both empty for a brand-new author).
      styleMemoryBlock: styleMemoryPromptBlock(memory) + (await loadVoiceDialsBlock(userId, db)),
      chapterNumber: chapter.chapter_number,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      keyPoints: kps.map((kp) => keyPointForPrompt(kp)).map((kp) => ({ title: kp.title, summary: kp.summary })),
      otherSpeakers: txs.some(hasOtherSpeakers),
      otherSpeakerNames: otherSpeakerNames(txs),
      previousChapters: prev.data || [],
      excerpts: extractExcerptsForChapter(fullText, kps.map((kp) => kp.supporting_quotes || [])),
      targetWords: chapter.target_word_count,
    },
  };
}

async function saveVersion(db: Db, chapterId: string, content: string, params: Record<string, unknown>): Promise<number> {
  const { data: existing } = await db.from("chapter_contents").select("version")
    .eq("chapter_id", chapterId).order("version", { ascending: false }).limit(1);
  const version = (existing?.[0]?.version || 0) + 1;
  const { error } = await db.from("chapter_contents").insert({
    chapter_id: chapterId,
    content,
    word_count: content.trim().split(/\s+/).length,
    generation_params: params,
    version,
  });
  if (error) throw error;
  return version;
}

async function recordPass(db: Db, row: Record<string, unknown>) {
  const { error } = await db.from("pr_chapter_passes").upsert(row, { onConflict: "run_id,chapter_id,step" });
  if (error) throw error;
}

async function otherChapterTexts(db: Db, projectId: string, excludeId: string): Promise<Record<string, string>> {
  const { data: chapters } = await db.from("chapters").select("id, chapter_number").eq("project_id", projectId).neq("id", excludeId);
  const out: Record<string, string> = {};
  await Promise.all((chapters || []).map(async (ch) => {
    const { data } = await db.from("chapter_contents").select("content").eq("chapter_id", ch.id)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (data?.content) out[`Chapter ${ch.chapter_number}`] = data.content;
  }));
  return out;
}

// ─── Step 1: beat plan + draft ───────────────────────────────────────────────

export async function stepDraft(opts: { userId: string; runId: string; chapterId: string; creativeFreedom?: number; onText?: (t: string) => void }) {
  const db = createServerClient();
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  await db.from("chapters").update({ status: "generating" }).eq("id", opts.chapterId);
  try {
    const t0 = Date.now();
    const out = await coreDraft(ctx.input, STEP_MODELS, { creativeFreedom: opts.creativeFreedom, onText: opts.onText });
    await bill(opts.userId, ctx.projectId, out.spend);
    if (!out.text.trim()) throw new StepError("Draft came back empty. Try again.", 502);
    const version = await saveVersion(db, opts.chapterId, out.text, { pipeline: "publisher_ready", step: "draft", model: out.servedBy });
    await db.from("chapters").update({ status: "generated" }).eq("id", opts.chapterId);
    await recordPass(db, {
      run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, step: "draft",
      version_in: ctx.latest?.version ?? null, version_out: version, beat_plan: out.beats, usage: { ...totalUsage(out.spend), elapsed_ms: Date.now() - t0 },
    });
    return { version, wordCount: out.text.trim().split(/\s+/).length, beats: out.beats.length };
  } catch (err) {
    await db.from("chapters").update({ status: ctx.latest ? "generated" : "outlined" }).eq("id", opts.chapterId);
    throw err;
  }
}

// ─── Step 2: editor read ─────────────────────────────────────────────────────

export async function stepEdit(opts: { userId: string; runId: string; chapterId: string }) {
  const db = createServerClient();
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  if (!ctx.latest) throw new StepError("Draft this chapter first.");
  const { data: pass } = await db.from("pr_chapter_passes").select("beat_plan")
    .eq("run_id", opts.runId).eq("chapter_id", opts.chapterId).eq("step", "draft").maybeSingle();
  const beats = (pass?.beat_plan as Beat[] | null) || [];

  const t0 = Date.now();
  const { report, spend } = await coreEdit(ctx.input, ctx.latest.content, beats, await otherChapterTexts(db, ctx.projectId, opts.chapterId), STEP_MODELS);
  await bill(opts.userId, ctx.projectId, spend);

  // Replace any earlier editor output for this chapter in this run.
  await db.from("pr_questions").delete().eq("run_id", opts.runId).eq("chapter_id", opts.chapterId).eq("status", "queued");
  await db.from("pr_craft_notes").delete().eq("run_id", opts.runId).eq("chapter_id", opts.chapterId).eq("status", "open");
  if (report.author_questions.length) {
    const { error } = await db.from("pr_questions").insert(report.author_questions.map((q) => ({
      run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId,
      question: q.question, why: q.why, impact: q.impact, beat_id: q.beat_id,
    })));
    if (error) throw error;
  }
  if (report.craft_notes.length) {
    const { error } = await db.from("pr_craft_notes").insert(report.craft_notes.map((n) => ({
      run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, span: n.span, problem: n.problem, fix: n.fix,
    })));
    if (error) throw error;
  }
  await recordPass(db, {
    run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, step: "edit",
    version_in: ctx.latest.version, version_out: ctx.latest.version,
    scores: { ...report.scores, summary: report.summary }, usage: { ...totalUsage(spend), elapsed_ms: Date.now() - t0 },
  });
  return { questions: report.author_questions.length, craftNotes: report.craft_notes.length, scores: report.scores, summary: report.summary };
}

// ─── Step 4: revise ──────────────────────────────────────────────────────────

export async function stepRevise(opts: { userId: string; runId: string; chapterId: string }) {
  const db = createServerClient();
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  if (!ctx.latest) throw new StepError("Draft this chapter first.");

  const [notesRes, questionsRes] = await Promise.all([
    db.from("pr_craft_notes").select("id, span, problem, fix").eq("run_id", opts.runId).eq("chapter_id", opts.chapterId).eq("status", "open"),
    db.from("pr_questions").select("id, question, status").eq("run_id", opts.runId).eq("chapter_id", opts.chapterId),
  ]);
  const questions = questionsRes.data || [];
  const answeredIds = questions.filter((q) => q.status === "answered").map((q) => q.id);
  const { data: answers } = answeredIds.length
    ? await db.from("pr_answers").select("question_id, transcript, created_at").in("question_id", answeredIds).order("created_at")
    : { data: [] as { question_id: string; transcript: string }[] };
  const answerText = new Map<string, string>();
  for (const a of answers || []) answerText.set(a.question_id, [answerText.get(a.question_id), a.transcript].filter(Boolean).join("\n"));

  const noteRows = (notesRes.data || []).map((n, i) => ({ ...n, ref: `N${i + 1}` }));
  const qRows = questions.map((q, i) => ({ ...q, ref: `Q${i + 1}` }));

  const t0 = Date.now();
  const out = await coreRevise(
    ctx.input,
    ctx.latest.content,
    noteRows.map((n) => ({ id: n.ref, span: n.span, problem: n.problem, fix: n.fix })),
    qRows.map((q) => ({ id: q.ref, question: q.question, answer: answerText.get(q.id) ?? null })),
    STEP_MODELS
  );
  await bill(opts.userId, ctx.projectId, out.spend);
  if (!out.text.trim()) throw new StepError("Revision came back empty. Try again.", 502);

  const version = await saveVersion(db, opts.chapterId, out.text, { pipeline: "publisher_ready", step: "revise", model: out.servedBy });
  const byRef = new Map(out.changeLog.map((c) => [c.ref, c]));
  for (const n of noteRows) {
    const entry = byRef.get(n.ref);
    await db.from("pr_craft_notes").update({
      status: entry?.action === "declined" ? "declined" : "fixed",
      reason: entry?.what_changed ?? null,
    }).eq("id", n.id);
  }
  await recordPass(db, {
    run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, step: "revise",
    version_in: ctx.latest.version, version_out: version, change_log: out.changeLog, usage: { ...totalUsage(out.spend), elapsed_ms: Date.now() - t0 },
  });
  return { version, changes: out.changeLog.length };
}

// ─── Step 5: final check ─────────────────────────────────────────────────────

export async function stepFinal(opts: { userId: string; runId: string; chapterId: string }) {
  const db = createServerClient();
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  if (!ctx.latest) throw new StepError("Nothing to check yet.");

  const t0 = Date.now();
  const out = await coreFinal(ctx.latest.content, await otherChapterTexts(db, ctx.projectId, opts.chapterId), STEP_MODELS);
  await bill(opts.userId, ctx.projectId, out.spend);

  const after = lintStructure(out.text);
  let version = ctx.latest.version;
  if (out.applied > 0) version = await saveVersion(db, opts.chapterId, out.text, { pipeline: "publisher_ready", step: "final" });
  await recordPass(db, {
    run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, step: "final",
    version_in: ctx.latest.version, version_out: version,
    scores: { tells_score: after.tells.score, rhythm_variation: Number(after.rhythmVariation.toFixed(3)), flags_left: after.flags.length, edits_applied: out.applied, edits_rejected: out.rejected },
    usage: { ...totalUsage(out.spend), elapsed_ms: Date.now() - t0 },
  });
  return { version, applied: out.applied, rejected: out.rejected, tellsScore: after.tells.score, flagsLeft: after.flags.length };
}
