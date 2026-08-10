import { VoiceProfile } from "@/types";
import { generateSystem } from "./generate";

/**
 * Chapter text carries formatting as markers (see lib/export/format-markers.ts) — the editor
 * and the PDF/DOCX exporters render them. A rewrite that returns clean prose therefore DELETES
 * the author's headings, quotes and emphasis. The selection prompt used to say "do not add
 * markers", written when a marker meant the >>> <<< delimiter, which made this worse.
 */
const FORMATTING_CONTRACT = `FORMATTING: the text uses markers that carry real formatting. Preserve them exactly as they appear, and use the same vocabulary if the feedback asks for new formatting:
- "## Heading" and "### Heading" for headings
- "> " at the start of a paragraph for a block quote
- **bold**, *italic*, ***bold italic*** for emphasis
- "---" alone on a line for a scene break
Never strip a marker that was already there, and never wrap your output in the >>> <<< delimiters used to mark the selection.`;

/**
 * System prompt for full chapter rewrites.
 * Reuses generateSystem() so voice profile + HUMANIZER_RULES are inherited.
 */
export function rewriteChapterSystem(
  voiceProfile: VoiceProfile | null,
  styleMemoryBlock?: string
): string {
  return generateSystem(voiceProfile, styleMemoryBlock);
}

/**
 * User prompt for full chapter rewrites.
 * Takes existing content + author feedback → revised chapter.
 */
export function rewriteChapterPrompt(opts: {
  currentContent: string;
  feedback: string;
  chapterTitle: string;
  previousChapterTail?: string;
  nextChapterHead?: string;
}): string {
  let prompt = `You are revising an existing chapter based on the author's feedback. Your job is to rewrite the chapter while:
1. Incorporating the author's feedback fully
2. Maintaining the author's voice and style throughout
3. Preserving the core structure and arguments unless the feedback asks to change them
4. Keeping approximately the same word count unless told otherwise
5. Ensuring smooth transitions and coherent flow

CURRENT CHAPTER: "${opts.chapterTitle}"
---
${opts.currentContent}
---`;

  if (opts.previousChapterTail) {
    prompt += `\n\nEND OF PREVIOUS CHAPTER (for transition context):\n---\n...${opts.previousChapterTail}\n---`;
  }

  if (opts.nextChapterHead) {
    prompt += `\n\nSTART OF NEXT CHAPTER (for transition context):\n---\n${opts.nextChapterHead}...\n---`;
  }

  prompt += `\n\nAUTHOR'S FEEDBACK:
${opts.feedback}

${FORMATTING_CONTRACT}

Rewrite the full chapter now. Do not include the chapter title — the editor handles that.
REMINDER: NO em dashes (—), NO AI cliches, write like a human. Reread the humanizer rules before outputting.`;

  return prompt;
}

/**
 * System prompt for selection-based magic edits.
 * Same voice/humanizer foundation as chapter rewrites.
 */
export function selectionEditSystem(
  voiceProfile: VoiceProfile | null,
  styleMemoryBlock?: string
): string {
  return generateSystem(voiceProfile, styleMemoryBlock);
}

/**
 * User prompt for selection-based magic edits.
 * Rewrites ONLY the selected text, blending with surrounding context.
 */
export function selectionEditPrompt(opts: {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  feedback: string;
}): string {
  return `Rewrite ONLY the selected text based on the author's feedback. The rewritten text must blend seamlessly with the surrounding context — match the tone, rhythm, and style.

CONTEXT BEFORE THE SELECTION:
...${opts.contextBefore}

SELECTED TEXT TO REWRITE:
>>>${opts.selectedText}<<<

CONTEXT AFTER THE SELECTION:
${opts.contextAfter}...

AUTHOR'S FEEDBACK:
${opts.feedback}

${FORMATTING_CONTRACT}

Return ONLY the rewritten text. Do not include the surrounding context, and do not add explanations or labels.
REMINDER: NO em dashes (—), NO AI cliches, write like a human.`;
}
