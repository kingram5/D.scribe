import { Audience } from "@/types";

export const ENRICH_SYSTEM = `You are a research assistant specializing in finding relevant quotes, references, and insights that complement and deepen a chapter's themes.`;

export function enrichPrompt(
  chapterTitle: string,
  chapterSummary: string,
  keyPoints: string[],
  audience: Audience
): string {
  return `Find enrichment material for this chapter.

Chapter: "${chapterTitle}"
Summary: ${chapterSummary}
Key Points: ${keyPoints.join("; ")}
Audience: ${audience}

Provide 5-8 relevant items from your knowledge, categorized as:
- Quotes from notable figures (with attribution)
${audience === "Faith Community" ? "- Scripture or sacred text references\n" : ""}- Historical parallels or anecdotes
- Research findings or statistics
- Complementary perspectives from other authors/speakers

For each item, provide:
- quote_text: The exact quote or reference
- source_author: Who said/wrote it
- source_title: Book, speech, article, etc.
- source_type: book | article | scripture | speech | research
- relevance_note: One sentence on why this connects to the chapter

Return valid JSON array. No markdown fencing.

IMPORTANT: Only provide quotes and references you are confident are accurately attributed. If uncertain about exact wording, paraphrase and note "paraphrased" in the source_type.`;
}
