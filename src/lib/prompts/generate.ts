import { Audience, VoiceProfile, Enrichment } from "@/types";

// Shared humanizer rules injected into all text-generating prompts.
// Goal: eliminate detectable AI writing patterns so output reads as genuinely human.
export const HUMANIZER_RULES = `
CRITICAL — WRITE LIKE A HUMAN, NOT AN AI:
You must avoid every common AI writing pattern. A human editor will reject anything that "sounds like ChatGPT." Follow these rules absolutely:

Punctuation & typography:
- NEVER use em dashes (—). Use commas, periods, semicolons, or rewrite the sentence.
- Avoid excessive semicolons. One per page max.
- Don't overuse ellipses (...). One per chapter at most.

Banned phrases and clichés (never use these or close variants):
- "no fluff" / "let's be real" / "real talk" / "here's the thing" / "here's the deal"
- "in today's world" / "in this day and age" / "now more than ever"
- "at the end of the day" / "when all is said and done"
- "it's worth noting" / "it's important to note" / "interestingly"
- "dive deep" / "deep dive" / "unpack" / "lean into" / "double down"
- "game-changer" / "paradigm shift" / "landscape" / "tapestry" / "journey"
- "navigate" (when not literal) / "leverage" (as verb) / "utilize"
- "robust" / "seamless" / "comprehensive" / "ultimately" / "furthermore"
- "transformative" / "groundbreaking" / "cutting-edge"
- "a testament to" / "serves as a reminder" / "speaks volumes"
- "the reality is" / "the truth is" / "the fact of the matter"
- "resonate" / "pivotal" / "nuanced" / "multifaceted"
- "unlock" / "revolutionize" / "empower" / "elevate" / "harness"
- "delve" / "embark" / "myriad" / "plethora" / "meld"
- "it goes without saying" / "needless to say" / "suffice it to say"
- "in essence" / "in summary" / "to put it simply" / "in other words"

Sentence patterns to avoid:
- Don't start 3+ sentences in a row with the same word.
- Don't open paragraphs with "So," or "Now," as transitions.
- Avoid the negation-flip / antithesis cliché in EVERY form — it is the #1 AI tell. Banned: "Not X. Rather, Y.", "It's not X, it's Y.", "That's not X — that's Y.", "This isn't about X, it's about Y.", "Not just X, but Y.", "X isn't Y; it's Z." Never set up a point by negating one thing to elevate another. State the point directly.
- Don't use rhetorical questions as transitions between sections.
- Avoid triple-stacked adjective lists ("bold, brave, and transformative").

Structure:
- Vary paragraph length. Mix 1-sentence paragraphs with 4-5 sentence ones.
- Avoid formulaic "topic sentence → 3 supporting points → wrap-up" in every paragraph.
- Don't end every chapter section with a neat summary sentence. Let some ideas land without a bow on top.
- Use contractions naturally (don't, won't, it's, that's). Formal non-contracted prose sounds robotic.

Tone:
- The writing should still be polished and professional, but it should read like a skilled human author, not a language model.
- Vary rhythm naturally. Not every paragraph needs to be airtight. Let some ideas breathe.
- Show, don't announce. Don't write "This is important" or "This matters." Make it land through the writing itself.
`;

export function generateSystem(
  voiceProfile: VoiceProfile | null,
  styleMemoryBlock?: string
): string {
  let system = `You are a ghostwriter who transforms spoken content into polished book chapters. You write in the author's authentic voice — you are not writing your own book, you are helping them write theirs.

POINT OF VIEW — CRITICAL: Write the entire chapter in FIRST PERSON as the author ("I", "me", "my", "we"). This is the author speaking directly to the reader in their own words. NEVER refer to "the author", "the speaker", "the writer", or "the narrator" in the third person, and never narrate what they think/say/believe from the outside. There is no separate narrator — the author IS the voice on the page.`;

  if (voiceProfile) {
    system += `\nVoice Profile:\n${JSON.stringify(voiceProfile, null, 2)}\n\nIMPORTANT: Match the author's tone, sentence patterns, vocabulary level, and rhetorical devices. Use their signature phrases naturally. This should read like THEY wrote it.`;
  }

  // Editorial memory: patterns learned from how this author edits drafts
  if (styleMemoryBlock) {
    system += styleMemoryBlock;
  }

  // Humanizer rules go LAST in system prompt — closest to output = highest compliance
  system += `\n${HUMANIZER_RULES}`;

  return system;
}

export function generatePrompt(opts: {
  chapterNumber: number;
  chapterTitle: string;
  chapterSummary: string;
  transcriptExcerpts: string;
  keyPoints: { id?: string; title: string; summary: string }[];
  blendedKeyPointIds?: string[];
  enrichments?: Enrichment[];
  previousChapters?: { title: string; summary: string }[];
  coveredPoints?: string[];
  narrativeThread?: string;
  previousChapterTail?: string;
  targetWords: number;
  audience: Audience;
  freedomInstruction: string;
}): string {
  const blendedSet = new Set(opts.blendedKeyPointIds || []);
  const featured = opts.keyPoints.filter((kp) => !kp.id || !blendedSet.has(kp.id));
  const blended = opts.keyPoints.filter((kp) => kp.id && blendedSet.has(kp.id));

  let prompt = `Write Chapter ${opts.chapterNumber}: "${opts.chapterTitle}"

Chapter Summary: ${opts.chapterSummary}

Source Material (transcript excerpts for this chapter):
---
${opts.transcriptExcerpts}
---

Key Points — Featured (give each its own section with dedicated coverage):
${featured.map((kp, i) => `${i + 1}. ${kp.title}: ${kp.summary}`).join("\n")}`;

  if (blended.length > 0) {
    prompt += `\n\nKey Points — Blended (weave these themes into the featured sections naturally, don't give them standalone coverage):
${blended.map((kp, i) => `${i + 1}. ${kp.title}: ${kp.summary}`).join("\n")}`;
  }

  if (opts.enrichments && opts.enrichments.length > 0) {
    const included = opts.enrichments.filter((e) => e.included);
    if (included.length > 0) {
      prompt += `\n\nENRICHMENT QUOTES (optional — use with restraint): These quotes are available to deepen the chapter. Weave one in ONLY where it genuinely fits the surrounding point. It is fine to use just some of them, or to skip any that would feel forced — do not cram them in.
SPACING IS CRITICAL: spread whatever quotes you use EVENLY across the whole chapter. Never put two quotes in consecutive paragraphs, never cluster several near the end, and use at most one quote per section — most paragraphs should have no quote at all.
When you do use one, reproduce it VERBATIM inside quotation marks with its attribution (author and source), and lead into it naturally (avoid the "[Author] once said" formula). For scripture, include the book, chapter, and verse (e.g. John 3:16).
Available quotes:\n${included.map((e, i) => `${i + 1}. "${e.quote_text}" — ${e.source_author}, ${e.source_title}`).join("\n")}`;
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
Do not include the chapter title at the top (the editor will handle formatting).

REMINDER: Absolutely NO em dashes (—), NO AI clichés (tapestry, journey, landscape, dive deep, lean into, etc.), NO rhetorical questions as transitions. Write like a human. Reread the humanizer rules before outputting.`;

  return prompt;
}
