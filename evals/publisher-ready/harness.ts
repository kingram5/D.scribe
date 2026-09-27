/**
 * Publisher-Ready scoreboard. Blind comparison of four arms on the SAME real
 * chapters, graded on the Publisher-Ready rubric by two judges (lower score
 * wins, per BMO's blind-rubric method), with measured cost per chapter.
 *
 *   A  today's pipeline: one pass, Sonnet 4.6, today's prompt
 *   B  today's prompt on Sonnet 5 (the free model upgrade on its own)
 *   C  Publisher-Ready, production mix (Sonnet 5 / Fable 5.1 / Opus 5.5)
 *   D  Publisher-Ready, budget mix (Opus 5.5 editor, Sonnet 5 revise)
 *
 * Spends real money on the project's Anthropic key and never writes to the
 * database. See README.md for the three phases.
 */

import { askClaudeWithUsage, creativeFreedomToInstruction, MODELS, type ClaudeUsage } from "@/lib/claude-lite";
import { callClaudeNext, parseJsonReply, usageDollars, type NextModelKey } from "@/lib/claude-next";
import { generatePrompt } from "@/lib/prompts/generate";
import { DEFAULT_MIX, coreDraft, coreEdit, coreRevise, coreFinal, voiceSystem, type ChapterInput, type ModelMix, type Spend } from "@/lib/publisher-ready/core";
import { RUBRIC, rubricPromptBlock, rubricTotal, RUBRIC_MAX } from "@/lib/publisher-ready/rubric";
import { lintStructure } from "@/lib/publisher-ready/structural-lint";
import type { EditorReport } from "@/lib/publisher-ready/prompts";

export type Arm = "A" | "B" | "C" | "D";

export const BUDGET_MIX: ModelMix = {
  ...DEFAULT_MIX,
  edit: { model: "opus55", effort: "high" },
  revise: { model: "sonnet5", effort: "high" },
};

export const MIX_FOR: Record<"C" | "D", ModelMix> = { C: DEFAULT_MIX, D: BUDGET_MIX };

export interface Fixture {
  id: string;
  input: ChapterInput;
  /** Other chapters of the same book (for the cross-chapter repetition index). */
  otherChapters: Record<string, string>;
}

/** Everything one arm produced for one chapter, cached between phases. */
export interface ArmResult {
  arm: Arm;
  fixture: string;
  draft?: string;
  beats?: unknown;
  editor?: EditorReport;
  final?: string;
  dollars: number;
  spend: { step: string; model: string; dollars: number }[];
}

const SONNET46_RATE = { in: 3, out: 15 };

export function spendRows(spend: Spend[]): ArmResult["spend"] {
  return spend.map((s) => ({ step: s.step, model: s.model, dollars: usageDollars(s.model, s.usage) }));
}

// ─── Arms A and B: today's single pass ──────────────────────────────────────

export async function runArmA(f: Fixture): Promise<ArmResult> {
  const prompt = generatePrompt({
    chapterNumber: f.input.chapterNumber, chapterTitle: f.input.chapterTitle, chapterSummary: f.input.chapterSummary,
    transcriptExcerpts: f.input.excerpts, keyPoints: f.input.keyPoints, previousChapters: f.input.previousChapters,
    targetWords: f.input.targetWords, audience: f.input.audience, freedomInstruction: creativeFreedomToInstruction(50),
  });
  // Mirrors /api/generate: quality tier, temperature from the default freedom slider.
  const { text, usage } = await askClaudeWithUsage(voiceSystem(f.input), prompt, { model: "quality", maxTokens: 8192, temperature: 0.375 });
  const dollars = (usage.input_tokens * SONNET46_RATE.in + usage.output_tokens * SONNET46_RATE.out) / 1e6;
  return { arm: "A", fixture: f.id, final: text, dollars, spend: [{ step: "draft", model: MODELS.quality, dollars }] };
}

export async function runArmB(f: Fixture): Promise<ArmResult> {
  const prompt = generatePrompt({
    chapterNumber: f.input.chapterNumber, chapterTitle: f.input.chapterTitle, chapterSummary: f.input.chapterSummary,
    transcriptExcerpts: f.input.excerpts, keyPoints: f.input.keyPoints, previousChapters: f.input.previousChapters,
    targetWords: f.input.targetWords, audience: f.input.audience, freedomInstruction: creativeFreedomToInstruction(50),
  });
  const res = await callClaudeNext(voiceSystem(f.input), prompt, { model: "sonnet5", effort: "medium", maxTokens: 32000 });
  const spend = spendRows([{ step: "draft", model: "sonnet5", usage: res.usage }]);
  return { arm: "B", fixture: f.id, final: res.text, dollars: spend[0].dollars, spend };
}

// ─── Arms C and D: Publisher-Ready, split around the human interview ────────

/** Phase "questions": draft + editor read. */
export async function runPrFront(f: Fixture, arm: "C" | "D"): Promise<ArmResult> {
  const mix = MIX_FOR[arm];
  const draft = await coreDraft(f.input, mix);
  const edit = await coreEdit(f.input, draft.text, draft.beats, f.otherChapters, mix);
  const spend = spendRows([...draft.spend, ...edit.spend]);
  return {
    arm, fixture: f.id, draft: draft.text, beats: draft.beats, editor: edit.report,
    dollars: spend.reduce((n, s) => n + s.dollars, 0), spend,
  };
}

/** Phase "final": revise with the author's answers, then the final check. */
export async function runPrBack(f: Fixture, front: ArmResult, answers: Record<string, string>): Promise<ArmResult> {
  const mix = MIX_FOR[front.arm as "C" | "D"];
  const report = front.editor!;
  const notes = report.craft_notes.map((n, i) => ({ id: `N${i + 1}`, span: n.span, problem: n.problem, fix: n.fix }));
  const questions = report.author_questions.map((q, i) => ({
    id: `Q${i + 1}`, question: q.question, answer: answers[`Q${i + 1}`]?.trim() || null,
  }));
  // One interview turn per answered question (follow-up decision), priced from the production mix.
  const interviewTurns = questions.filter((q) => q.answer).length;
  const interviewDollars = interviewTurns * usageDollars(mix.interview.model, { input_tokens: 1200, output_tokens: 400 });

  const revised = await coreRevise(f.input, front.draft!, notes, questions, mix);
  const final = await coreFinal(revised.text, f.otherChapters, mix);
  const spend = [
    ...front.spend,
    { step: "interview", model: mix.interview.model, dollars: interviewDollars },
    ...spendRows([...revised.spend, ...final.spend]),
  ];
  return { ...front, final: final.text, dollars: spend.reduce((n, s) => n + s.dollars, 0), spend };
}

// ─── Blind judging ───────────────────────────────────────────────────────────

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: Object.fromEntries(RUBRIC.map((c) => [c.key, { type: "integer" }])),
      required: RUBRIC.map((c) => c.key),
      additionalProperties: false,
    },
    worst_problem: { type: "string" },
  },
  required: ["scores", "worst_problem"],
  additionalProperties: false,
} as const;

const JUDGE_SYSTEM = `You are an experienced literary agent screening a submission. You get the author's raw source material (their own spoken words) and one chapter written from it. You do not know how the chapter was produced. Score it strictly against the rubric; most competent drafts earn 1s, and a 2 must be earned. For credibility, check every specific claim, quote and number against the source; anything not traceable is invented. Name the single worst problem.

${rubricPromptBlock()}`;

export const JUDGES: NextModelKey[] = ["opus55", "sonnet5"];

export async function judge(f: Fixture, chapter: string): Promise<{ scores: Record<string, number>; worst: string; dollars: number }> {
  const results = await Promise.all(JUDGES.map(async (model) => {
    const res = await callClaudeNext(
      JUDGE_SYSTEM,
      `SOURCE MATERIAL:\n---\n${f.input.excerpts}\n---\n\nCHAPTER ${f.input.chapterNumber}: "${f.input.chapterTitle}"\n---\n${chapter}\n---`,
      { model, effort: "high", maxTokens: 16000, jsonSchema: JUDGE_SCHEMA as unknown as Record<string, unknown> }
    );
    const out = parseJsonReply<{ scores: Record<string, number>; worst_problem: string }>(res.text);
    return { out, dollars: usageDollars(model, res.usage) };
  }));
  // Lower of the two judges per criterion.
  const scores = Object.fromEntries(RUBRIC.map((c) => [c.key, Math.min(...results.map((r) => Math.max(0, Math.min(2, Math.round(r.out.scores[c.key] ?? 0)))))]));
  return { scores, worst: results.map((r) => r.out.worst_problem).join(" | "), dollars: results.reduce((n, r) => n + r.dollars, 0) };
}

/** Deterministic metrics that need no judge. */
export function codeMetrics(text: string) {
  const s = lintStructure(text);
  return {
    words: text.trim().split(/\s+/).filter(Boolean).length,
    tellsScore: s.tells.score,
    rhythm: Number(s.rhythmVariation.toFixed(2)),
    flags: s.flags.length,
  };
}

export { rubricTotal, RUBRIC_MAX };
export type { ClaudeUsage };
