import { VoiceProfile } from "@/types";
import { generateSystem } from "./generate";

/**
 * System prompt for full chapter rewrites.
 * Reuses generateSystem() so voice profile + HUMANIZER_RULES are inherited.
 */
export function rewriteChapterSystem(voiceProfile: VoiceProfile | null): string {
  return generateSystem(voiceProfile);
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

Rewrite the full chapter now. Do not include the chapter title — the editor handles that.
REMINDER: NO em dashes (—), NO AI cliches, write like a human. Reread the humanizer rules before outputting.`;

  return prompt;
}

/**
 * System prompt for selection-based magic edits.
 * Same voice/humanizer foundation as chapter rewrites.
 */
export function selectionEditSystem(voiceProfile: VoiceProfile | null): string {
  return generateSystem(voiceProfile);
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

Return ONLY the rewritten text. Do not include the surrounding context. Do not add explanations, labels, or markers.
REMINDER: NO em dashes (—), NO AI cliches, write like a human.`;
}
