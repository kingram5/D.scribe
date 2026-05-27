import { Audience, VoiceProfile, Chapter } from "@/types";

export const OUTLINE_SYSTEM = `You are a book editor who transforms spoken content into well-structured book outlines. You understand narrative arc, chapter flow, and how to organize ideas for a reading audience.`;

export function outlinePrompt(
  keyPoints: { title: string; summary: string }[],
  numChapters: number,
  audience: Audience,
  projectTitle: string,
  voiceProfile?: VoiceProfile | null
): string {
  const pointsList = keyPoints
    .map((kp, i) => `${i + 1}. ${kp.title}: ${kp.summary}`)
    .join("\n");

  let prompt = `Create a ${numChapters}-chapter book outline from these key points.

Key Points:
${pointsList}

Target Audience: ${audience}
Book Title: ${projectTitle}`;

  if (voiceProfile) {
    prompt += `\nVoice Profile: ${voiceProfile.tone}, ${voiceProfile.vocabulary_level}`;
  }

  prompt += `

For each chapter, provide:
- title: Compelling chapter title that fits the author's voice
- summary: 1-2 punchy, reader-facing sentences that capture what the reader gets from this chapter and why it matters — written to make them want to read it, not a dry table-of-contents line
- key_point_ids: Which key points (by number) belong in this chapter
- narrative_arc: How this chapter connects to the previous and next

Guidelines:
- CRITICAL: Each key point number must appear in exactly ONE chapter's key_point_ids array. Never repeat a key point number across multiple chapters.
- Every key point must be assigned to some chapter — do not leave any unassigned.
- Chapters should have roughly equal weight
- The sequence should have a natural narrative arc
- The first chapter should hook the reader
- The last chapter should close with a call to action or reflection

Return valid JSON array: [{title, summary, key_point_ids: number[], narrative_arc}]
No markdown fencing.
Double-check your output: ensure no key_point_id number appears in more than one chapter's array.`;

  return prompt;
}

export function expandOutlinePrompt(
  unassigned: { title: string; summary: string }[],
  numNewChapters: number,
  existingChapters: Pick<Chapter, "chapter_number" | "title" | "summary">[],
  audience: Audience,
  projectTitle: string,
  voiceProfile?: VoiceProfile | null
): string {
  const existingList = existingChapters
    .map((c) => `  Ch ${c.chapter_number}: ${c.title} — ${c.summary}`)
    .join("\n");

  const unassignedList = unassigned
    .map((kp, i) => `${i + 1}. ${kp.title}: ${kp.summary}`)
    .join("\n");

  let prompt = `You are expanding an existing book outline with new chapters from additional source material.

EXISTING CHAPTERS (DO NOT modify, duplicate, or overlap with these):
${existingList}

UNASSIGNED KEY POINTS — assign ALL of these to new chapters:
${unassignedList}

Target Audience: ${audience}
Book Title: ${projectTitle}`;

  if (voiceProfile) {
    prompt += `\nVoice Profile: ${voiceProfile.tone}, ${voiceProfile.vocabulary_level}`;
  }

  prompt += `

Create ${numNewChapters} new chapter(s) that cover ALL ${unassigned.length} unassigned key points above.

Rules:
- CRITICAL: Every unassigned key point (1 through ${unassigned.length}) must appear in exactly ONE new chapter's key_point_ids array.
- Do NOT overlap themes already covered by the existing chapters listed above.
- New chapters should continue naturally from where existing chapters leave off.
- key_point_ids are 1-based indexes into the unassigned key points list above (not UUIDs).

Return valid JSON array: [{title, summary, key_point_ids: number[], narrative_arc}]
No markdown fencing.
Double-check: every number 1–${unassigned.length} must appear exactly once across all new chapters.`;

  return prompt;
}
