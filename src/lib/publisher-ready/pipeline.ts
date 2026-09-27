/**
 * Publisher-Ready pipeline steps (server-only). One chapter per call so every
 * request stays inside the 300s function limit; the client drives the chapters
 * with a small concurrency cap.
 *
 * Models (Kyle 2026-09-27, BMO mix): draft Sonnet 5 -> editor Fable 5.1 ->
 * interview Sonnet 5 -> revise Opus 5.5 -> final check Sonnet 5.
 */

import { createServerClient } from "@/lib/supabase";
import { callClaudeNext, parseJsonReply, type NextModelKey, type Effort } from "@/lib/claude-next";
import { recordInkUsage, type InkOperation } from "@/lib/ink";
import { generateSystem, generatePrompt } from "@/lib/prompts/generate";
import { generationProfileBlock } from "@/lib/audience-profiles";
import { loadStyleMemory, styleMemoryPromptBlock } from "@/lib/style-memory";
import { extractExcerptsForChapter } from "@/lib/chunker";
import { creativeFreedomToInstruction } from "@/lib/claude-lite";
import { sanitizeGenerated } from "@/lib/sanitize-output";
import type { ClaudeUsage } from "@/lib/claude-lite";
import {
  BEAT_PLAN_SCHEMA, beatPlanSystem, draftBeatBlock, type Beat,
  EDITOR_SCHEMA, editorSystem, editorUser, type EditorReport,
  REVISE_SCHEMA, reviseSystem, reviseUser,
  FINAL_SCHEMA, finalCheckSystem,
} from "./prompts";
import { lintStructure, bookRepeats, type StructuralFlag } from "./structural-lint";

/** Which model and effort each step runs on. One place to change the mix. */
export const STEP_MODELS: Record<"beats" | "draft" | "edit" | "coverage" | "interview" | "revise" | "final", { model: NextModelKey; effort: Effort }> = {
  beats: { model: "sonnet5", effort: "low" },
  draft: { model: "sonnet5", effort: "medium" },
  edit: { model: "fable51", effort: "high" },
  coverage: { model: "sonnet5", effort: "low" },
  interview: { model: "sonnet5", effort: "low" },
  revise: { model: "opus55", effort: "high" },
  final: { model: "sonnet5", effort: "medium" },
};

type Db = ReturnType<typeof createServerClient>;

export class StepError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ChapterContext {
  project: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  chapter: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  excerpts: string;
  keyPoints: { title: string; summary: string }[];
  previousChapters: { title: string; summary: string }[];
  latest: { content: string; version: number } | null;
}

/** Load a chapter the user owns, with its source excerpts and latest text. */
export async function loadChapterContext(db: Db, userId: string, chapterId: string): Promise<ChapterContext> {
  const { data: chapter } = await db.from("chapters").select("*").eq("id", chapterId).single();
  if (!chapter) throw new StepError("Chapter not found", 404);
  const { data: project } = await db.from("projects").select("*").eq("id", chapter.project_id).eq("user_id", userId).single();
  if (!project) throw new StepError("Project not found", 404);

  const [transcripts, keyPoints, prev, latest] = await Promise.all([
    db.from("transcripts").select("full_text").eq("project_id", chapter.project_id),
    db.from("key_points").select("*").in("id", chapter.key_point_ids || []),
    db.from("chapters").select("title, summary").eq("project_id", chapter.project_id)
      .lt("chapter_number", chapter.chapter_number).order("chapter_number"),
    db.from("chapter_contents").select("content, version").eq("chapter_id", chapterId)
      .order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const fullText = (transcripts.data || []).map((t) => t.full_text).join("\n\n");
  const kps = keyPoints.data || [];
  return {
    project,
    chapter,
    excerpts: extractExcerptsForChapter(fullText, kps.map((kp) => kp.supporting_quotes || [])),
    keyPoints: kps.map((kp) => ({ title: kp.title, summary: kp.summary })),
    previousChapters: prev.data || [],
    latest: latest.data ? { content: latest.data.content, version: latest.data.version } : null,
  };
}

async function bill(userId: string, projectId: string, op: InkOperation, model: NextModelKey, usage: ClaudeUsage) {
  await recordInkUsage(userId, projectId, op, model, usage);
}

function addUsage(a: ClaudeUsage, b: ClaudeUsage): ClaudeUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens || 0) + (b.cache_read_input_tokens || 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens || 0) + (b.cache_creation_input_tokens || 0),
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

async function voiceAndStyle(userId: string, project: Record<string, any>): Promise<string> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const memory = await loadStyleMemory(userId);
  // generateSystem already carries voice profile + style memory + audience +
  // humanizer; reuse it minus the humanizer (the caller appends that itself).
  return generateSystem(project.voice_profile, styleMemoryPromptBlock(memory), generationProfileBlock(project.audience, project.scripture_translation))
    .split("\nCRITICAL — WRITE LIKE A HUMAN")[0];
}

// ─── Step 1: beat plan + draft ───────────────────────────────────────────────

export async function stepDraft(opts: { userId: string; runId: string; chapterId: string; creativeFreedom?: number; onText?: (t: string) => void }) {
  const db = createServerClient();
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  const beatsModel = STEP_MODELS.beats;
  const draftModel = STEP_MODELS.draft;

  const beatsRes = await callClaudeNext(
    beatPlanSystem(),
    `Chapter ${ctx.chapter.chapter_number}: "${ctx.chapter.title}"\nSummary: ${ctx.chapter.summary}\n\nKey points:\n${ctx.keyPoints.map((k) => `- ${k.title}: ${k.summary}`).join("\n")}\n\nSource material:\n---\n${ctx.excerpts}\n---`,
    { ...beatsModel, maxTokens: 8000, jsonSchema: BEAT_PLAN_SCHEMA as unknown as Record<string, unknown> }
  );
  await bill(opts.userId, ctx.project.id, "pr_draft", beatsModel.model, beatsRes.usage);
  const { beats } = parseJsonReply<{ beats: Beat[] }>(beatsRes.text);

  const memory = await loadStyleMemory(opts.userId);
  const system = generateSystem(ctx.project.voice_profile, styleMemoryPromptBlock(memory), generationProfileBlock(ctx.project.audience, ctx.project.scripture_translation));
  const prompt = generatePrompt({
    chapterNumber: ctx.chapter.chapter_number,
    chapterTitle: ctx.chapter.title,
    chapterSummary: ctx.chapter.summary,
    transcriptExcerpts: ctx.excerpts,
    keyPoints: ctx.keyPoints,
    previousChapters: ctx.previousChapters,
    targetWords: ctx.chapter.target_word_count,
    audience: ctx.project.audience,
    freedomInstruction: creativeFreedomToInstruction(opts.creativeFreedom ?? 50),
  }) + draftBeatBlock(beats);

  await db.from("chapters").update({ status: "generating" }).eq("id", opts.chapterId);
  let draftUsage: ClaudeUsage | null = null;
  try {
    const res = await callClaudeNext(system, prompt, { ...draftModel, maxTokens: 32000, onText: opts.onText });
    draftUsage = res.usage;
    const content = sanitizeGenerated(res.text);
    if (!content.trim()) throw new StepError("Draft came back empty. Try again.", 502);
    const version = await saveVersion(db, opts.chapterId, content, { pipeline: "publisher_ready", step: "draft", model: res.servedBy });
    await db.from("chapters").update({ status: "generated" }).eq("id", opts.chapterId);
    await recordPass(db, {
      run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, step: "draft",
      version_in: ctx.latest?.version ?? null, version_out: version, beat_plan: beats,
      usage: addUsage(beatsRes.usage, res.usage),
    });
    return { version, wordCount: content.trim().split(/\s+/).length, beats };
  } catch (err) {
    await db.from("chapters").update({ status: ctx.latest ? "generated" : "outlined" }).eq("id", opts.chapterId);
    throw err;
  } finally {
    if (draftUsage) await bill(opts.userId, ctx.project.id, "pr_draft", draftModel.model, draftUsage);
  }
}

// ─── Step 2: editor read ─────────────────────────────────────────────────────

async function otherChapterTexts(db: Db, projectId: string, excludeId: string): Promise<Record<string, string>> {
  const { data: chapters } = await db.from("chapters").select("id, chapter_number, title").eq("project_id", projectId).neq("id", excludeId);
  const out: Record<string, string> = {};
  for (const ch of chapters || []) {
    const { data } = await db.from("chapter_contents").select("content").eq("chapter_id", ch.id)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (data?.content) out[`Chapter ${ch.chapter_number}`] = data.content;
  }
  return out;
}

function lintSummary(flags: StructuralFlag[]): string {
  return flags.slice(0, 20).map((f) => `- ${f.kind}: ${f.message}${f.span ? ` [${f.span.slice(0, 120)}]` : ""}`).join("\n");
}

export async function stepEdit(opts: { userId: string; runId: string; chapterId: string }) {
  const db = createServerClient();
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  if (!ctx.latest) throw new StepError("Draft this chapter first.");
  const { data: pass } = await db.from("pr_chapter_passes").select("beat_plan")
    .eq("run_id", opts.runId).eq("chapter_id", opts.chapterId).eq("step", "draft").maybeSingle();
  const beats = (pass?.beat_plan as Beat[] | null) || [];

  const others = await otherChapterTexts(db, ctx.project.id, opts.chapterId);
  const structure = lintStructure(ctx.latest.content);
  const flags = [...structure.flags, ...bookRepeats(ctx.latest.content, others)];
  const bookContext = [
    `Title: ${ctx.project.title}`,
    ...ctx.previousChapters.map((c, i) => `Ch ${i + 1}: "${c.title}": ${c.summary}`),
  ].join("\n");

  const m = STEP_MODELS.edit;
  const res = await callClaudeNext(
    editorSystem(ctx.project.audience),
    editorUser({
      chapterNumber: ctx.chapter.chapter_number, chapterTitle: ctx.chapter.title, draft: ctx.latest.content,
      beats, sourceExcerpts: ctx.excerpts, bookContext, lintSummary: lintSummary(flags),
    }),
    { ...m, maxTokens: 32000, jsonSchema: EDITOR_SCHEMA as unknown as Record<string, unknown> }
  );
  await bill(opts.userId, ctx.project.id, "pr_edit", m.model, res.usage);
  const report = parseJsonReply<EditorReport>(res.text);

  // Replace any earlier editor output for this chapter in this run.
  await db.from("pr_questions").delete().eq("run_id", opts.runId).eq("chapter_id", opts.chapterId).eq("status", "queued");
  await db.from("pr_craft_notes").delete().eq("run_id", opts.runId).eq("chapter_id", opts.chapterId).eq("status", "open");
  if (report.author_questions.length) {
    const { error } = await db.from("pr_questions").insert(report.author_questions.map((q) => ({
      run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId,
      question: q.question, why: q.why, impact: Math.max(1, Math.min(5, Math.round(q.impact || 3))), beat_id: q.beat_id,
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
    version_in: ctx.latest.version, version_out: ctx.latest.version, scores: { ...report.scores, summary: report.summary }, usage: res.usage,
  });
  return { questions: report.author_questions.length, craftNotes: report.craft_notes.length, scores: report.scores, summary: report.summary };
}

// ─── Step 4: revise ──────────────────────────────────────────────────────────

export async function stepRevise(opts: { userId: string; runId: string; chapterId: string; onText?: (t: string) => void }) {
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

  const m = STEP_MODELS.revise;
  const res = await callClaudeNext(
    reviseSystem(await voiceAndStyle(opts.userId, ctx.project)),
    reviseUser({
      draft: ctx.latest.content,
      craftNotes: noteRows.map((n) => ({ id: n.ref, span: n.span, problem: n.problem, fix: n.fix })),
      answered: qRows.filter((q) => answerText.has(q.id)).map((q) => ({ id: q.ref, question: q.question, answer: answerText.get(q.id)! })),
      unanswered: qRows.filter((q) => !answerText.has(q.id)).map((q) => ({ id: q.ref, question: q.question })),
      sourceExcerpts: ctx.excerpts,
      targetWords: ctx.chapter.target_word_count,
    }),
    { ...m, maxTokens: 64000, jsonSchema: REVISE_SCHEMA as unknown as Record<string, unknown>, onText: opts.onText }
  );
  await bill(opts.userId, ctx.project.id, "pr_revise", m.model, res.usage);
  const out = parseJsonReply<{ chapter: string; change_log: { ref: string; action: string; what_changed: string }[] }>(res.text);
  const content = sanitizeGenerated(out.chapter);
  if (!content.trim()) throw new StepError("Revision came back empty. Try again.", 502);

  const version = await saveVersion(db, opts.chapterId, content, { pipeline: "publisher_ready", step: "revise", model: res.servedBy });
  // Mark craft notes by the reviser's own log.
  const byRef = new Map(out.change_log.map((c) => [c.ref, c]));
  for (const n of noteRows) {
    const entry = byRef.get(n.ref);
    await db.from("pr_craft_notes").update({
      status: entry?.action === "declined" ? "declined" : "fixed",
      reason: entry?.what_changed ?? null,
    }).eq("id", n.id);
  }
  await recordPass(db, {
    run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, step: "revise",
    version_in: ctx.latest.version, version_out: version, change_log: out.change_log, usage: res.usage,
  });
  return { version, changes: out.change_log.length };
}

// ─── Step 5: final check ─────────────────────────────────────────────────────

/** Apply find/replace edits; skips any whose `find` is missing or not unique, and never edits inside quotes. */
export function applyEdits(text: string, edits: { find: string; replace: string }[]): { text: string; applied: number } {
  let out = text;
  let applied = 0;
  for (const e of edits) {
    if (!e.find || e.find === e.replace) continue;
    const first = out.indexOf(e.find);
    if (first === -1 || out.indexOf(e.find, first + 1) !== -1) continue;
    // Quoted speech is the author's source material: an edit that changes any
    // quoted text is refused.
    const quotesBefore = (e.find.match(/["“”]/g) ?? []).join("");
    const quotesAfter = (e.replace.match(/["“”]/g) ?? []).join("");
    const quotedBefore = e.find.match(/["“][^"”]*["”]/g) ?? [];
    if (quotesBefore !== quotesAfter || quotedBefore.some((q) => !e.replace.includes(q))) continue;
    out = out.slice(0, first) + e.replace + out.slice(first + e.find.length);
    applied++;
  }
  return { text: out, applied };
}

export async function stepFinal(opts: { userId: string; runId: string; chapterId: string }) {
  const db = createServerClient();
  const ctx = await loadChapterContext(db, opts.userId, opts.chapterId);
  if (!ctx.latest) throw new StepError("Nothing to check yet.");

  const others = await otherChapterTexts(db, ctx.project.id, opts.chapterId);
  const structure = lintStructure(ctx.latest.content);
  const flags = [...structure.flags, ...bookRepeats(ctx.latest.content, others)];
  const tellLines = structure.tells.bannedHits.map((b) => `- banned phrase "${b.phrase}" x${b.count}`);
  if (structure.tells.negationFlips) tellLines.push(`- ${structure.tells.negationFlips} "not X, but Y" constructions`);

  let content = ctx.latest.content;
  let applied = 0;
  let usage: ClaudeUsage = { input_tokens: 0, output_tokens: 0 };
  // Only spend a model call when the checker found something.
  if (flags.length || tellLines.length) {
    const m = STEP_MODELS.final;
    const res = await callClaudeNext(
      finalCheckSystem(),
      `FLAGGED BY THE CHECKER:\n${[lintSummary(flags), ...tellLines].filter(Boolean).join("\n")}\n\nCHAPTER:\n---\n${content}\n---`,
      { ...m, maxTokens: 16000, jsonSchema: FINAL_SCHEMA as unknown as Record<string, unknown> }
    );
    usage = res.usage;
    await bill(opts.userId, ctx.project.id, "pr_final", m.model, res.usage);
    const { edits } = parseJsonReply<{ edits: { find: string; replace: string; reason: string }[] }>(res.text);
    ({ text: content, applied } = applyEdits(content, edits));
  }

  const after = lintStructure(content);
  let version = ctx.latest.version;
  if (applied > 0) version = await saveVersion(db, opts.chapterId, content, { pipeline: "publisher_ready", step: "final" });
  await recordPass(db, {
    run_id: opts.runId, chapter_id: opts.chapterId, user_id: opts.userId, step: "final",
    version_in: ctx.latest.version, version_out: version,
    scores: { tells_score: after.tells.score, rhythm_variation: Number(after.rhythmVariation.toFixed(3)), flags_left: after.flags.length, edits_applied: applied },
    usage,
  });
  return { version, applied, tellsScore: after.tells.score, flagsLeft: after.flags.length };
}
