/**
 * The model calls behind each Publisher-Ready step, with no database access.
 * pipeline.ts wraps these with loading and saving; the scoreboard harness
 * (evals/publisher-ready) calls them directly, so the eval measures exactly
 * the prompts production runs.
 */

import { callClaudeNext, parseJsonReply, type NextModelKey, type Effort } from "@/lib/claude-next";
import type { ClaudeUsage } from "@/lib/claude-lite";
import { generateSystem, generatePrompt } from "@/lib/prompts/generate";
import { generationProfileBlock } from "@/lib/audience-profiles";
import { creativeFreedomToInstruction } from "@/lib/claude-lite";
import { sanitizeGenerated } from "@/lib/sanitize-output";
import type { VoiceProfile, Audience } from "@/types";
import { OTHER_SPEAKERS_RULE, speakerWritingBlock } from "@/lib/speakers";
import {
  BEAT_PLAN_SCHEMA, beatPlanSystem, draftBeatBlock, type Beat,
  EDITOR_SCHEMA, editorSystem, editorUser, type EditorReport,
  REVISE_SCHEMA, reviseSystem, reviseUser,
  FINAL_SCHEMA, finalCheckSystem,
} from "./prompts";
import { lintStructure, bookRepeats, type StructuralFlag } from "./structural-lint";

export type StepKey = "beats" | "draft" | "edit" | "coverage" | "interview" | "revise" | "final";
export type ModelMix = Record<StepKey, { model: NextModelKey; effort: Effort }>;

/** Production mix (Kyle 2026-09-27, BMO's pick). */
export const DEFAULT_MIX: ModelMix = {
  beats: { model: "sonnet5", effort: "low" },
  draft: { model: "sonnet5", effort: "medium" },
  edit: { model: "fable51", effort: "high" },
  coverage: { model: "sonnet5", effort: "low" },
  interview: { model: "sonnet5", effort: "low" },
  revise: { model: "opus55", effort: "high" },
  final: { model: "sonnet5", effort: "medium" },
};

/** One billable model call: which model, what it used. */
export interface Spend { step: StepKey; model: NextModelKey; usage: ClaudeUsage }

export interface ChapterInput {
  projectTitle: string;
  audience: Audience;
  scriptureTranslation?: string | null;
  voiceProfile: VoiceProfile | null;
  styleMemoryBlock: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterSummary: string;
  keyPoints: { title: string; summary: string }[];
  previousChapters: { title: string; summary: string }[];
  excerpts: string;
  targetWords: number;
  /** True when labeled recordings include people other than the author. */
  otherSpeakers?: boolean;
  /** Names of those other people, for the writer's attribution rule. */
  otherSpeakerNames?: string[];
}

export function voiceSystem(input: ChapterInput): string {
  const speakers = input.otherSpeakers ? `\n\n${OTHER_SPEAKERS_RULE}` : "";
  return generateSystem(input.voiceProfile, input.styleMemoryBlock, generationProfileBlock(input.audience, input.scriptureTranslation) + speakers);
}

export async function coreDraft(
  input: ChapterInput,
  mix: ModelMix = DEFAULT_MIX,
  opts: { creativeFreedom?: number; onText?: (t: string) => void } = {}
): Promise<{ beats: Beat[]; text: string; servedBy: string; spend: Spend[] }> {
  const spend: Spend[] = [];
  const beatsRes = await callClaudeNext(
    beatPlanSystem(),
    `Chapter ${input.chapterNumber}: "${input.chapterTitle}"\nSummary: ${input.chapterSummary}\n\nKey points:\n${input.keyPoints.map((k) => `- ${k.title}: ${k.summary}`).join("\n")}\n\nSource material:\n---\n${input.excerpts}\n---`,
    { ...mix.beats, maxTokens: 8000, jsonSchema: BEAT_PLAN_SCHEMA as unknown as Record<string, unknown> }
  );
  spend.push({ step: "beats", model: mix.beats.model, usage: beatsRes.usage });
  const { beats } = parseJsonReply<{ beats: Beat[] }>(beatsRes.text);

  const prompt = generatePrompt({
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    chapterSummary: input.chapterSummary,
    transcriptExcerpts: input.excerpts,
    keyPoints: input.keyPoints,
    previousChapters: input.previousChapters,
    targetWords: input.targetWords,
    audience: input.audience,
    freedomInstruction: creativeFreedomToInstruction(opts.creativeFreedom ?? 50),
  }) + draftBeatBlock(beats) + speakerWritingBlock(input.otherSpeakerNames ?? []);

  const res = await callClaudeNext(voiceSystem(input), prompt, { ...mix.draft, maxTokens: 32000, onText: opts.onText });
  spend.push({ step: "draft", model: mix.draft.model, usage: res.usage });
  return { beats, text: sanitizeGenerated(res.text), servedBy: res.servedBy, spend };
}

export function lintSummary(flags: StructuralFlag[]): string {
  return flags.slice(0, 20).map((f) => `- ${f.kind}: ${f.message}${f.span ? ` [${f.span.slice(0, 120)}]` : ""}`).join("\n");
}

export async function coreEdit(
  input: ChapterInput,
  draft: string,
  beats: Beat[],
  otherChapters: Record<string, string>,
  mix: ModelMix = DEFAULT_MIX
): Promise<{ report: EditorReport; spend: Spend[] }> {
  const flags = [...lintStructure(draft).flags, ...bookRepeats(draft, otherChapters)];
  const bookContext = [
    `Title: ${input.projectTitle}`,
    ...input.previousChapters.map((c, i) => `Ch ${i + 1}: "${c.title}": ${c.summary}`),
  ].join("\n");
  const res = await callClaudeNext(
    editorSystem(input.audience, input.otherSpeakers),
    editorUser({
      chapterNumber: input.chapterNumber, chapterTitle: input.chapterTitle, draft,
      beats, sourceExcerpts: input.excerpts, bookContext, lintSummary: lintSummary(flags),
    }),
    { ...mix.edit, maxTokens: 32000, jsonSchema: EDITOR_SCHEMA as unknown as Record<string, unknown> }
  );
  const report = parseJsonReply<EditorReport>(res.text);
  report.author_questions = (report.author_questions || []).map((q) => ({ ...q, impact: Math.max(1, Math.min(5, Math.round(q.impact || 3))) }));
  report.craft_notes = report.craft_notes || [];
  return { report, spend: [{ step: "edit", model: mix.edit.model, usage: res.usage }] };
}

export interface ReviseNote { id: string; span: string; problem: string; fix: string }
export interface ReviseQuestion { id: string; question: string; answer: string | null }
export interface ChangeLogEntry { ref: string; action: string; what_changed: string }

export async function coreRevise(
  input: ChapterInput,
  draft: string,
  notes: ReviseNote[],
  questions: ReviseQuestion[],
  mix: ModelMix = DEFAULT_MIX,
  opts: { onText?: (t: string) => void } = {}
): Promise<{ text: string; changeLog: ChangeLogEntry[]; servedBy: string; spend: Spend[] }> {
  // Voice + style + audience without the humanizer; reviseSystem appends its own copy.
  const voice = voiceSystem(input).split("\nCRITICAL — WRITE LIKE A HUMAN")[0];
  const res = await callClaudeNext(
    reviseSystem(voice),
    reviseUser({
      draft,
      craftNotes: notes,
      answered: questions.filter((q) => q.answer).map((q) => ({ id: q.id, question: q.question, answer: q.answer! })),
      unanswered: questions.filter((q) => !q.answer).map((q) => ({ id: q.id, question: q.question })),
      sourceExcerpts: input.excerpts,
      targetWords: input.targetWords,
    }) + speakerWritingBlock(input.otherSpeakerNames ?? []),
    { ...mix.revise, maxTokens: 64000, jsonSchema: REVISE_SCHEMA as unknown as Record<string, unknown>, onText: opts.onText }
  );
  const out = parseJsonReply<{ chapter: string; change_log: ChangeLogEntry[] }>(res.text);
  return {
    text: sanitizeGenerated(out.chapter),
    changeLog: out.change_log || [],
    servedBy: res.servedBy,
    spend: [{ step: "revise", model: mix.revise.model, usage: res.usage }],
  };
}

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

export async function coreFinal(
  text: string,
  otherChapters: Record<string, string>,
  mix: ModelMix = DEFAULT_MIX
): Promise<{ text: string; applied: number; spend: Spend[] }> {
  const structure = lintStructure(text);
  const flags = [...structure.flags, ...bookRepeats(text, otherChapters)];
  const tellLines = structure.tells.bannedHits.map((b) => `- banned phrase "${b.phrase}" x${b.count}`);
  if (structure.tells.negationFlips) tellLines.push(`- ${structure.tells.negationFlips} "not X, but Y" constructions`);
  // Only spend a model call when the checker found something.
  if (!flags.length && !tellLines.length) return { text, applied: 0, spend: [] };

  const res = await callClaudeNext(
    finalCheckSystem(),
    `FLAGGED BY THE CHECKER:\n${[lintSummary(flags), ...tellLines].filter(Boolean).join("\n")}\n\nCHAPTER:\n---\n${text}\n---`,
    { ...mix.final, maxTokens: 16000, jsonSchema: FINAL_SCHEMA as unknown as Record<string, unknown> }
  );
  const { edits } = parseJsonReply<{ edits: { find: string; replace: string }[] }>(res.text);
  const applied = applyEdits(text, edits || []);
  return { ...applied, spend: [{ step: "final", model: mix.final.model, usage: res.usage }] };
}
