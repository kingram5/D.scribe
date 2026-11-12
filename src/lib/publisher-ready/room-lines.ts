/**
 * What T.H.E.O. says in the second interview room (flow v2, Kyle 9/28: "a 2nd
 * interview room exactly like the first where THEO welcomes them back and asks
 * the editor's questions"). The questions come from the editor; these lines
 * only frame them, so they're deterministic: no model call, no wait, no cost.
 */

export interface RoomQuestion {
  question: string;
  chapter_number: number;
  chapter_title: string;
  /** 0 = first question of this chapter's block, so name the chapter. */
  positionInBlock: number;
}

const BRIDGES = ["Got it.", "That helps.", "Good. That's the kind of thing only you know.", "Thank you.", "Perfect.", "That'll go in."];

export function chapterLead(q: RoomQuestion, opener = "Now"): string {
  if (q.positionInBlock !== 0 || !q.chapter_number) return "";
  const title = q.chapter_title ? `, "${q.chapter_title}"` : "";
  return `${opener}, chapter ${q.chapter_number}${title}. `;
}

/** First turn: the welcome back, then the first question. */
export function welcomeLine(q: RoomQuestion | null, alreadyAnswered: number): string {
  if (!q) return "Welcome back. Your editor doesn't have any questions left for you, so we're done here. Tap I'm done and I'll write your final draft.";
  const intro = alreadyAnswered > 0
    ? "Welcome back. Let's pick up where we left off."
    : "Welcome back. Your editor read every chapter and came back with a few questions only you can answer. Say as much or as little as you like, and skip anything that doesn't fit.";
  return `${intro} ${chapterLead({ ...q, positionInBlock: 0 }, alreadyAnswered > 0 ? "We're on" : "First")}${q.question}`;
}

/** After an answer (or a skip): a short bridge, then the next question. */
export function nextLine(q: RoomQuestion | null, turn: number, skipped = false): string {
  const bridge = skipped ? "No problem, we'll leave that one." : BRIDGES[turn % BRIDGES.length];
  if (!q) return `${bridge} That's everything your editor asked. Tap I'm done and I'll put your answers into the book.`;
  return `${bridge} ${chapterLead(q)}${q.question}`;
}
