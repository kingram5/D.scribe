import { readSnapshot } from "@/lib/ai/publisher-ready-routing";
import { mixedAuxiliary } from "@/lib/ai/auxiliary";
import { digest } from "./source-ledger";
/**
 * Second interview (server side). Serves the next question in round-robin
 * order, drops questions an earlier answer already covered, stores answers,
 * and asks at most one follow-up when an answer is vague.
 */

import { createServerClient } from "@/lib/supabase";
import { callClaudeNext, parseJsonReply } from "@/lib/claude-next";
import { recordInkUsage } from "@/lib/ink";
import { nextQuestion, progress, type RRQuestion } from "./round-robin";
import { COVERAGE_SCHEMA, coverageSystem, followUpSystem } from "./prompts";
import { STEP_MODELS, StepError } from "./pipeline";

type Db = ReturnType<typeof createServerClient>;

async function loadRun(db: Db, userId: string, runId: string) {
  const { data: run } = await db.from("pr_runs").select("*").eq("id", runId).eq("user_id", userId).single();
  if (!run) throw new StepError("Run not found", 404);
  return run;
}

async function loadQuestions(db: Db, runId: string) {
  const { data } = await db.from("pr_questions")
    .select("id, chapter_id, question, why, impact, status, asked_round, created_at").eq("run_id", runId);
  return data || [];
}

export interface ServedQuestion {
  id: string;
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  question: string;
  why: string;
  round: number;
  positionInBlock: number;
}

export interface InterviewState {
  next: ServedQuestion | null;
  progress: ReturnType<typeof progress>;
}

/**
 * The next question to put to the author. A question already marked "asked"
 * (served but not answered, e.g. the tab was closed) is served again first.
 */
export async function serveNext(userId: string, runId: string): Promise<InterviewState> {
  const db = createServerClient();
  const run = await loadRun(db, userId, runId);
  if (run.status === "drafting" || run.status === "editing") {
    await db.from("pr_runs").update({ status: "interviewing", updated_at: new Date().toISOString() }).eq("id", runId);
  }
  const { data: chapters } = await db.from("chapters").select("id, chapter_number, title").eq("project_id", run.project_id);
  const chapterList = chapters || [];
  const titleOf = new Map(chapterList.map((c) => [c.id, c]));

  for (let guard = 0; guard < 50; guard++) {
    const rows = await loadQuestions(db, runId);
    const open = rows.find((r) => r.status === "asked");
    const pick = open
      ? { question: open as RRQuestion, round: open.asked_round ?? 1, positionInBlock: 0, chapter_id: open.chapter_id }
      : nextQuestion(chapterList, rows as RRQuestion[]);
    if (!pick) return { next: null, progress: progress(rows as RRQuestion[]) };
    const row = rows.find((r) => r.id === pick.question.id)!;

    if (!open) {
      const covered = await coveredByEarlierAnswer(db, userId, run.project_id, runId, row);
      if (covered) {
        await db.from("pr_questions").update({ status: "dropped_covered", covered_by: covered, updated_at: new Date().toISOString() }).eq("id", row.id);
        continue;
      }
      await db.from("pr_questions").update({ status: "asked", asked_round: pick.round, updated_at: new Date().toISOString() }).eq("id", row.id);
      row.status = "asked";
      row.asked_round = pick.round;
    }
    const ch = titleOf.get(row.chapter_id);
    return {
      next: {
        id: row.id,
        chapter_id: row.chapter_id,
        chapter_number: ch?.chapter_number ?? 0,
        chapter_title: ch?.title ?? "",
        question: row.question,
        why: row.why,
        round: pick.round,
        positionInBlock: pick.positionInBlock,
      },
      progress: progress(rows as RRQuestion[]),
    };
  }
  throw new StepError("Could not find the next question", 500);
}

/** Returns the id of an answer that already covers this question, or null. */
async function coveredByEarlierAnswer(
  db: Db, userId: string, projectId: string, runId: string,
  row: { id: string; chapter_id: string; question: string }
): Promise<string | null> {
  const { data: answers } = await db.from("pr_answers")
    .select("id, transcript, pr_questions!inner(chapter_id, question)")
    .eq("run_id", runId).eq("pr_questions.chapter_id", row.chapter_id)
    .order("created_at", { ascending: false }).limit(10);
  if (!answers || answers.length === 0) return null;

  const m = STEP_MODELS.coverage;
  const list = answers.map((a, i) => {
    const q = (a as unknown as { pr_questions: { question: string } }).pr_questions;
    return `${i + 1}. Q: ${q?.question ?? ""}\n   A: ${a.transcript}`;
  }).join("\n");
  const mixed = await mixedAuxiliary({ actorId: userId, runId, key: `coverage:${row.id}:${digest(answers.map(a => a.id))}`, workload: "coverage", system: coverageSystem(), user: `PENDING QUESTION: ${row.question}\n\nANSWERS SO FAR:\n${list}`, maxTokens: 2000, schema: COVERAGE_SCHEMA });
  const res = mixed ?? await callClaudeNext(coverageSystem(), `PENDING QUESTION: ${row.question}\n\nANSWERS SO FAR:\n${list}`, {
    ...m, maxTokens: 2000, jsonSchema: COVERAGE_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!mixed) await recordInkUsage(userId, projectId, "pr_interview", m.model, res.usage as import("@/lib/claude-lite").ClaudeUsage);
  const out = parseJsonReply<{ covered: boolean; covered_by_index: number | null }>(res.text);
  if (!out.covered || !out.covered_by_index) return null;
  return answers[out.covered_by_index - 1]?.id ?? null;
}

/**
 * Store an answer. Returns a follow-up question when the answer is vague and
 * this was not already a follow-up; otherwise marks the question answered.
 */
export async function submitAnswer(opts: {
  userId: string; runId: string; questionId: string; transcript: string; source: "typed" | "voice"; followUpOf?: string | null;
}): Promise<{ followUp: string | null; answerId: string }> {
  const db = createServerClient();
  const run = await loadRun(db, opts.userId, opts.runId);
  const text = opts.transcript.trim().slice(0, 8000);
  if (!text) throw new StepError("Answer is empty.");
  const { data: q } = await db.from("pr_questions").select("id, question, status").eq("id", opts.questionId).eq("run_id", opts.runId).single();
  if (!q) throw new StepError("Question not found", 404);

  const mixedRun = readSnapshot(run.models);
  if (mixedRun && opts.followUpOf) {
    const { data: parent } = await db.from("pr_answers").select("id").eq("id", opts.followUpOf).eq("question_id", q.id).eq("run_id", opts.runId).eq("user_id", opts.userId).single();
    if (!parent) throw new StepError("Follow-up answer not found", 404);
  }
  const requestKey = mixedRun ? digest([q.id, text, opts.followUpOf ?? null]) : null;
  let { data: answer, error } = await db.from("pr_answers").insert({
    question_id: q.id, run_id: opts.runId, user_id: opts.userId, transcript: text, source: opts.source,
    follow_up_of: opts.followUpOf ?? null,
    ...(requestKey ? { mixed_request_key: requestKey } : {}),
  }).select("id").single();
  if (requestKey && error?.code === "23505") {
    const existing = await db.from("pr_answers").select("id").eq("run_id", opts.runId).eq("question_id", q.id).eq("mixed_request_key", requestKey).single();
    answer = existing.data; error = existing.error;
  }
  if (error || !answer) throw error ?? new StepError("Could not save answer", 500);

  let followUp: string | null = null;
  if (!opts.followUpOf) {
    const m = STEP_MODELS.interview;
    const mixed = await mixedAuxiliary({ actorId: opts.userId, runId: opts.runId, key: `interview:${q.id}:${digest(text)}`, workload: "interview", system: followUpSystem(), user: `QUESTION: ${q.question}\n\nANSWER: ${text}`, maxTokens: 1500 });
    const res = mixed ?? await callClaudeNext(followUpSystem(), `QUESTION: ${q.question}\n\nANSWER: ${text}`, { ...m, maxTokens: 1500 });
    if (!mixed) await recordInkUsage(opts.userId, run.project_id, "pr_interview", m.model, res.usage as import("@/lib/claude-lite").ClaudeUsage);
    const reply = res.text.trim();
    if (reply && !/^DONE\b/i.test(reply)) followUp = reply.slice(0, 400);
  }
  if (!followUp) {
    await db.from("pr_questions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", q.id);
  }
  return { followUp, answerId: answer.id };
}

export async function skipQuestion(userId: string, runId: string, questionId: string) {
  const db = createServerClient();
  await loadRun(db, userId, runId);
  await db.from("pr_questions").update({ status: "skipped", updated_at: new Date().toISOString() })
    .eq("id", questionId).eq("run_id", runId).in("status", ["queued", "asked"]);
}

/** "Done with this chapter": drop the rest of its queue. */
export async function finishChapter(userId: string, runId: string, chapterId: string) {
  const db = createServerClient();
  await loadRun(db, userId, runId);
  await db.from("pr_questions").update({ status: "skipped", updated_at: new Date().toISOString() })
    .eq("run_id", runId).eq("chapter_id", chapterId).in("status", ["queued", "asked"]);
}

/** "Done with all": everything left becomes unanswered, and the run moves to revising. */
export async function finishInterview(userId: string, runId: string) {
  const db = createServerClient();
  const run = await loadRun(db, userId, runId);
  if (readSnapshot(run.models) || run.models?.live_enabled === true) {
    const { data: active, error } = await db.from("theo_live_sessions").select("id").eq("run_id", runId).eq("user_id", userId).neq("state", "closed").limit(1);
    if (error || active?.length) throw new StepError("End and reconcile the Live session before finishing the interview", 409);
  }
  await db.from("pr_questions").update({ status: "unanswered", updated_at: new Date().toISOString() })
    .eq("run_id", runId).in("status", ["queued", "asked"]);
  await db.from("pr_runs").update({ status: "revising", updated_at: new Date().toISOString() }).eq("id", runId);
}

/**
 * Has the editor read every chapter of this run's book? The interview and the
 * revision both depend on it (flow v2: a stale tab or a rail click must not
 * start either before the editor is done).
 */
export async function editorFinished(userId: string, runId: string): Promise<boolean> {
  const db = createServerClient();
  const run = await loadRun(db, userId, runId);
  const [{ data: chapters }, { data: passes }] = await Promise.all([
    db.from("chapters").select("id").eq("project_id", run.project_id).gt("chapter_number", 0),
    db.from("pr_chapter_passes").select("chapter_id").eq("run_id", runId).eq("step", "edit"),
  ]);
  const read = new Set((passes ?? []).map((p) => p.chapter_id));
  return (chapters ?? []).length > 0 && (chapters ?? []).every((c) => read.has(c.id));
}
