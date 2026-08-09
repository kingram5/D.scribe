// The interviewer persona shown in the Brainstorm Studio.
// One name across every genre; the role line specializes per audience so the
// audience-conditioning work (audience-profiles.ts) is visible, not hidden.
// Role lines are CONTENT descriptions of what the interviewer listens for —
// never style adjectives (the voice-precedence rule applies to UI copy too).

export const INTERVIEWER_NAME = "T.H.E.O";
export const INTERVIEWER_NAME_FULL = "Technical Human Expression Organizer";

const ROLE_LINES: Record<string, string> = {
  "Money & Finance":
    "Money & Finance interviewer · listens for numbers, frameworks, and what the mistake actually cost",
  "Christian Living":
    "Christian Living interviewer · listens for testimony, scripture anchors, and lived application",
  "Memoir & Biography":
    "Memoir interviewer · listens for scenes, people, and the true chronology beneath the polished version",
};

/** Short role line for the stage header. Falls back to a generic editor line
 *  for audiences without a flagship profile (they run the template persona). */
export function interviewerRoleLine(audience?: string | null): string {
  if (audience && ROLE_LINES[audience]) return ROLE_LINES[audience];
  if (audience && audience !== "General") {
    return `${audience} interviewer · listens for the claims, methods, and stories your reader is paying for`;
  }
  return "Your ghostwriter · listens for the book inside the way you tell it";
}
