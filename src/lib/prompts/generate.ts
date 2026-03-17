import { Audience, VoiceProfile, Enrichment } from "@/types";

export function generateSystem(voiceProfile: VoiceProfile | null): string {
  let system = `You are a ghostwriter who transforms spoken content into polished book chapters. You write in the author's authentic voice — you are not writing your own book, you are helping them write theirs.`;

  if (voiceProfile) {
    system += `\n\nVoice Profile:\n${JSON.stringify(voiceProfile, null, 2)}\n\nIMPORTANT: Match the author's tone, sentence patterns, vocabulary level, and rhetorical devices. Use their signature phrases naturally. This should read like THEY wrote it.`;
  }

  return system;
}

export function generatePrompt(opts: {
  chapterNumber: number;
  chapterTitle: string;
  chapterSummary: string;
  transcriptExcerpts: string;
  keyPoints: { title: string; summary: string }[];
  enrichments?: Enrichment[];
  previousChapters?: { title: string; summary: string }[];
  coveredPoints?: string[];
  narrativeThread?: string;
  previousChapterTail?: string;
  targetWords: number;
  audience: Audience;
  freedomInstruction: string;
}): string {
  let prompt = `Write Chapter ${opts.chapterNumber}: "${opts.chapterTitle}"

Chapter Summary: ${opts.chapterSummary}

Source Material (transcript excerpts for this chapter):
---
${opts.transcriptExcerpts}
---

Key Points to Cover:
${opts.keyPoints.map((kp, i) => `${i + 1}. ${kp.title}: ${kp.summary}`).join("\n")}`;

  if (opts.enrichments && opts.enrichments.length > 0) {
    const included = opts.enrichments.filter((e) => e.included);
    if (included.length > 0) {
      prompt += `\n\nEnrichment quotes to weave in naturally, with attribution:\n${included.map((e) => `- "${e.quote_text}" — ${e.source_author}, ${e.source_title}`).join("\n")}`;
    }
  }

  if (opts.previousChapters && opts.previousChapters.length > 0) {
    prompt += `\n\nContext from Previous Chapters:\n${opts.previousChapters.map((c, i) => `Ch ${i + 1}: "${c.title}" — ${c.summary}`).join("\n")}`;
  }

  if (opts.coveredPoints && opts.coveredPoints.length > 0) {
    prompt += `\n\nKey points already covered in previous chapters (DO NOT repeat):\n${opts.coveredPoints.map((p) => `- ${p}`).join("\n")}`;
  }

  if (opts.narrativeThread) {
    prompt += `\n\nNarrative thread: ${opts.narrativeThread}`;
  }

  if (opts.previousChapterTail) {
    prompt += `\n\nEnd of Previous Chapter (continue the flow naturally from here — match the energy and create a smooth transition):\n---\n...${opts.previousChapterTail}\n---`;
  }

  prompt += `

Parameters:
- Target word count: ${opts.targetWords}
- Audience: ${opts.audience}
- Creative freedom: ${opts.freedomInstruction}

Write the full chapter text. Use proper paragraphs. Include section breaks where natural.
Do not include the chapter title at the top (the editor will handle formatting).`;

  return prompt;
}
