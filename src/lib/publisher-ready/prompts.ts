/**
 * Prompts and structured-output schemas for the Publisher-Ready pipeline.
 *
 * Written for the 5-series models, which follow instructions literally: say
 * what to do and why, avoid all-caps shouting, and keep one job per call.
 */

import { HUMANIZER_RULES } from "@/lib/prompts/generate";
import { RUBRIC, rubricPromptBlock } from "./rubric";

// ─── Step 1a: beat plan (Sonnet 5, low effort, JSON) ─────────────────────────

export interface Beat {
  id: string;
  what_happens: string;
  /** A short verbatim phrase from the source that this beat is built on, or null. */
  source_quote: string | null;
}

export const BEAT_PLAN_SCHEMA = {
  type: "object",
  properties: {
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          what_happens: { type: "string" },
          source_quote: { type: ["string", "null"] },
        },
        required: ["id", "what_happens", "source_quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["beats"],
  additionalProperties: false,
} as const;

export function beatPlanSystem(): string {
  return `You plan book chapters for a ghostwriter. You are given the author's own spoken source material and the chapter's place in the book. Produce the sequence of beats the chapter should move through, 5 to 12 beats.

Every beat must be built on something the author actually said. Put a short verbatim phrase from the source (under 25 words, copied exactly) in source_quote. If a beat is needed for the chapter to work but nothing in the source supports it, set source_quote to null. Never invent a detail to fill a beat: a null source_quote tells the editor exactly where to ask the author for more.

Use ids b1, b2, b3 and so on.`;
}

// ─── Step 1b: draft instruction appended to the existing generatePrompt ──────

export function draftBeatBlock(beats: Beat[]): string {
  return `\n\nBEAT PLAN (write the chapter through these beats, in order):
${beats
  .map((b) =>
    `${b.id}. ${b.what_happens}${b.source_quote ? `\n   Built on the author's words: "${b.source_quote}"` : "\n   No source yet: write this beat honestly from what the source supports, and do not invent specifics (names, numbers, dialogue, places) to fill it."}`
  )
  .join("\n")}`;
}

// ─── Step 2: editor read (Fable 5.1, JSON) ───────────────────────────────────

export interface EditorQuestion {
  question: string;
  why: string;
  impact: number;
  beat_id: string | null;
}

export interface CraftNote {
  span: string;
  problem: string;
  fix: string;
}

export interface EditorReport {
  author_questions: EditorQuestion[];
  craft_notes: CraftNote[];
  scores: Record<string, number>;
  summary: string;
}

export const EDITOR_SCHEMA = {
  type: "object",
  properties: {
    author_questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          why: { type: "string" },
          impact: { type: "integer" },
          beat_id: { type: ["string", "null"] },
        },
        required: ["question", "why", "impact", "beat_id"],
        additionalProperties: false,
      },
    },
    craft_notes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          span: { type: "string" },
          problem: { type: "string" },
          fix: { type: "string" },
        },
        required: ["span", "problem", "fix"],
        additionalProperties: false,
      },
    },
    scores: {
      type: "object",
      properties: Object.fromEntries(RUBRIC.map((c) => [c.key, { type: "integer" }])),
      required: RUBRIC.map((c) => c.key),
      additionalProperties: false,
    },
    summary: { type: "string" },
  },
  required: ["author_questions", "craft_notes", "scores", "summary"],
  additionalProperties: false,
} as const;

export function editorSystem(audience: string | null): string {
  return `You are a senior acquisitions editor reading a chapter of a book the author is preparing to submit to literary agents and publishers${audience ? ` (audience: ${audience})` : ""}. The chapter was drafted from the author's own recorded interviews. Your job is to find what would make an agent stop reading, and to separate it into two piles.

Pile 1, author_questions: the gaps only the author can fill. A missing scene, a name, a number, what someone actually said, how a moment felt, what happened next, a concrete example for an abstract claim. Ask the way a good interviewer would: one specific, open question per gap, in plain conversational words the author can answer out loud. Quote or point to the thin spot in "why". Rate impact 1 to 5 by how much the answer would improve the chapter (5 = the chapter doesn't work without it). Set beat_id when the gap belongs to a beat in the plan. Rules: never ask something the source material already answers; never ask about craft (rhythm, word choice, structure) since the author doesn't need to fix those; never plant a fact inside the question ("was your father angry?" plants anger, "how did your father react?" does not). Ask as many as the chapter genuinely needs and no more; a strong chapter may need none.

Pile 2, craft_notes: problems a skilled writer can fix without new facts. Flat rhythm, repetition, a generic passage, a strained metaphor, a slow opening, a missing transition, any AI-sounding pattern. Put the exact offending text in span (copied verbatim so it can be found) and a concrete fix.

Then score the chapter against the rubric and give a two-sentence summary of its biggest strength and biggest problem.

${rubricPromptBlock()}`;
}

export function editorUser(opts: {
  chapterNumber: number;
  chapterTitle: string;
  draft: string;
  beats: Beat[];
  sourceExcerpts: string;
  bookContext: string;
  lintSummary: string;
}): string {
  return `CHAPTER ${opts.chapterNumber}: "${opts.chapterTitle}"

BOOK CONTEXT (outline and earlier chapters):
${opts.bookContext}

BEAT PLAN:
${opts.beats.map((b) => `${b.id}. ${b.what_happens}${b.source_quote ? ` [source: "${b.source_quote}"]` : " [NO SOURCE]"}`).join("\n")}

AUTHOR'S SOURCE MATERIAL FOR THIS CHAPTER (their own spoken words):
---
${opts.sourceExcerpts}
---

AUTOMATED CHECKS ALREADY RUN (treat as hints, confirm before noting):
${opts.lintSummary || "none"}

THE DRAFT:
---
${opts.draft}
---`;
}

// ─── Step 3: coverage check before each question (Sonnet 5, low effort) ─────

export const COVERAGE_SCHEMA = {
  type: "object",
  properties: {
    covered: { type: "boolean" },
    covered_by_index: { type: ["integer", "null"] },
  },
  required: ["covered", "covered_by_index"],
  additionalProperties: false,
} as const;

export function coverageSystem(): string {
  return `You decide whether an interview question has already been answered. You get one pending question and a numbered list of answers the author has already given. Say covered=true only if an existing answer already gives the specific information the question asks for; a related but vaguer answer does not count. When covered, give that answer's number in covered_by_index.`;
}

// ─── Step 3: follow-up on a vague answer (Sonnet 5, low effort, text) ───────
// The editor already writes each question in plain spoken words, so questions
// are served verbatim; the model only decides whether one follow-up is needed.

export function followUpSystem(): string {
  return `You are T.H.E.O., a book interviewer. The author just answered a question. Decide if the answer gives the specific detail the question was after. If it does, reply with exactly: DONE. If it is vague or skips the detail (no name, no number, no concrete moment when one was asked for), reply with ONE short, friendly follow-up question that asks for the missing specific. Never suggest an answer.`;
}

// ─── Step 4: revise (Opus 5.5) ────────────────────────────────────────────────

export const REVISE_SCHEMA = {
  type: "object",
  properties: {
    chapter: { type: "string" },
    change_log: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string" },
          action: { type: "string", enum: ["fixed", "used_answer", "declined"] },
          what_changed: { type: "string" },
        },
        required: ["ref", "action", "what_changed"],
        additionalProperties: false,
      },
    },
  },
  required: ["chapter", "change_log"],
  additionalProperties: false,
} as const;

export function reviseSystem(voiceAndStyle: string): string {
  return `You revise a chapter of the author's book. You are given the current draft, an editor's craft notes, and the author's own answers to the editor's questions. Revise the draft; do not rewrite it from scratch. Keep every passage the notes don't touch.

Using the author's answers: bring their words in as close to verbatim as the prose allows, in first person, in their voice. Their answers are the most valuable material in the book because they are real. Anything inside quotation marks in the draft or the answers is someone's actual words: never alter it.

For questions the author did not answer: do not invent the missing detail. Tighten, generalize honestly, or leave the beat as it is.

For each craft note: fix it, or decline it with a one-line reason if the fix would hurt the chapter.

Record every change in change_log with ref = the note or question id you were given.

${voiceAndStyle}
${HUMANIZER_RULES}`;
}

export function reviseUser(opts: {
  draft: string;
  craftNotes: { id: string; span: string; problem: string; fix: string }[];
  answered: { id: string; question: string; answer: string }[];
  unanswered: { id: string; question: string }[];
  sourceExcerpts: string;
  targetWords: number;
}): string {
  return `CURRENT DRAFT:
---
${opts.draft}
---

CRAFT NOTES:
${opts.craftNotes.map((n) => `[${n.id}] "${n.span}" : ${n.problem} -> ${n.fix}`).join("\n") || "none"}

THE AUTHOR'S ANSWERS (use these; they are the author's own words):
${opts.answered.map((a) => `[${a.id}] Q: ${a.question}\nA: ${a.answer}`).join("\n\n") || "none"}

QUESTIONS THE AUTHOR DID NOT ANSWER (do not invent these details):
${opts.unanswered.map((u) => `[${u.id}] ${u.question}`).join("\n") || "none"}

ORIGINAL SOURCE MATERIAL (for reference):
---
${opts.sourceExcerpts}
---

Target length: about ${opts.targetWords} words. Return the full revised chapter in "chapter" (no title line) and the change log.`;
}

// ─── Step 5: final check (Sonnet 5) ──────────────────────────────────────────

export const FINAL_SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          find: { type: "string" },
          replace: { type: "string" },
          reason: { type: "string" },
        },
        required: ["find", "replace", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["edits"],
  additionalProperties: false,
} as const;

export function finalCheckSystem(): string {
  return `You are a line editor doing the last pass on a finished chapter. You get the chapter and a list of flagged spots from an automated checker. Fix only the flagged spots, plus anything glaring you notice while reading (a typo, a sentence that reads as machine-written). Do not restyle anything else.

Return edits as find/replace pairs. "find" must be copied exactly from the chapter, long enough to be unique (a full sentence is safest). Never change text inside quotation marks. If nothing needs fixing, return an empty list.

${HUMANIZER_RULES}`;
}
