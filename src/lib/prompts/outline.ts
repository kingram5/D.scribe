import { Audience, VoiceProfile } from "@/types";

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
- title: Compelling chapter title that fits the speaker's voice
- summary: 2-3 sentences describing what this chapter covers
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
