export const KEY_POINTS_SYSTEM = `You are an expert at analyzing spoken content and extracting the core arguments, insights, and themes. You specialize in sermons, lectures, and speeches.`;

export function keyPointsPrompt(
  transcriptChunk: string,
  chunkIndex: number,
  totalChunks: number,
  previousPointTitles?: string[],
  deliveryBlock?: string
): string {
  let prompt = `Extract the key points from this transcript segment. For each key point, provide:
- title: A concise 5-10 word title
- summary: 2-3 sentences explaining the point
- supporting_quotes: 1-3 direct quotes from the transcript that support this point
- tags: 2-4 topic tags

Transcript (segment ${chunkIndex + 1} of ${totalChunks}):
---
${transcriptChunk}
---`;

  if (deliveryBlock) {
    prompt += deliveryBlock;
  }

  if (previousPointTitles && previousPointTitles.length > 0) {
    prompt += `\n\nKey points already extracted from previous segments:\n${previousPointTitles.map((t) => `- ${t}`).join("\n")}\nAvoid duplicating these. Only extract NEW points from this segment.`;
  }

  prompt += `\n\nReturn valid JSON array: [{title, summary, supporting_quotes: string[], tags: string[]}]`;
  return prompt;
}
