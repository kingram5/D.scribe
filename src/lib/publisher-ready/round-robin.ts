/**
 * Round-robin scheduler for the second interview (Kyle, 2026-09-27):
 * no cap on questions per chapter, but never more than 5 IN A ROW for one
 * chapter. Ask up to 5 for chapter 1, then chapter 2, ... through the last
 * chapter, then back to chapter 1 for its next 5, until every queue is empty.
 *
 * Pure: takes the question rows, returns the next one to ask. The API route
 * persists status changes; this module decides order only.
 */

export const MAX_IN_A_ROW = 5;

export type QuestionStatus = "queued" | "asked" | "answered" | "skipped" | "dropped_covered" | "unanswered";

export interface RRQuestion {
  id: string;
  chapter_id: string;
  impact: number; // 1-5, higher asked first
  status: QuestionStatus;
  asked_round: number | null;
  created_at: string;
}

export interface RRChapter {
  id: string;
  chapter_number: number;
}

export interface NextPick {
  question: RRQuestion;
  round: number;
  /** 1-based position of this question inside the chapter's current block of 5. */
  positionInBlock: number;
  chapter_id: string;
}

/** Questions still waiting to be asked, highest impact first, oldest first on ties. */
function pending(questions: RRQuestion[], chapterId: string): RRQuestion[] {
  return questions
    .filter((q) => q.chapter_id === chapterId && q.status === "queued")
    .sort((a, b) => b.impact - a.impact || a.created_at.localeCompare(b.created_at));
}

/** How many questions a chapter has already had put to it in a given round. */
function askedInRound(questions: RRQuestion[], chapterId: string, round: number): number {
  return questions.filter(
    (q) => q.chapter_id === chapterId && q.asked_round === round && q.status !== "queued"
  ).length;
}

/**
 * The next question to ask, or null when every chapter's queue is empty.
 *
 * State lives entirely in the rows: `asked_round` on each asked question. The
 * current round is the highest round any question was asked in (or 1). Within
 * that round, walk chapters in order; a chapter keeps the floor until it has had
 * MAX_IN_A_ROW questions this round or runs out, then the next chapter goes.
 * When no chapter can take another question this round, the next round starts
 * at chapter 1.
 */
export function nextQuestion(chapters: RRChapter[], questions: RRQuestion[]): NextPick | null {
  const ordered = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  if (!questions.some((q) => q.status === "queued")) return null;

  const currentRound = Math.max(1, ...questions.map((q) => q.asked_round ?? 0));

  for (let round = currentRound; round <= currentRound + 1; round++) {
    for (const ch of ordered) {
      const queue = pending(questions, ch.id);
      if (queue.length === 0) continue;
      const used = askedInRound(questions, ch.id, round);
      if (used >= MAX_IN_A_ROW) continue;
      // Earlier chapter still mid-block in this round? Finish it first. Because we
      // walk in order and only skip full or empty chapters, the first chapter
      // reached here is exactly the one whose turn it is.
      return { question: queue[0], round, positionInBlock: used + 1, chapter_id: ch.id };
    }
  }
  return null;
}

export interface Progress {
  remaining: number;
  answered: number;
  skipped: number;
  round: number;
  chaptersWithQuestions: number;
}

export function progress(questions: RRQuestion[]): Progress {
  return {
    remaining: questions.filter((q) => q.status === "queued").length,
    answered: questions.filter((q) => q.status === "answered").length,
    skipped: questions.filter((q) => q.status === "skipped" || q.status === "dropped_covered").length,
    round: Math.max(1, ...questions.map((q) => q.asked_round ?? 0)),
    chaptersWithQuestions: new Set(questions.filter((q) => q.status === "queued").map((q) => q.chapter_id)).size,
  };
}
