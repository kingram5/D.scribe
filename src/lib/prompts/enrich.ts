import { Audience } from "@/types";

export const ENRICH_SYSTEM = `You are a research assistant specializing in finding relevant quotes, references, and insights that complement and deepen a chapter's themes.`;

export function enrichPrompt(
  chapterTitle: string,
  chapterSummary: string,
  keyPoints: string[],
  audience: Audience,
  translation?: string | null,
  excludeQuotes?: string[]
): string {
  const aud = audience as string;
  const scriptureAudience = aud === "Faith Community" || aud === "Christian Living";
  const transNote = scriptureAudience && translation ? ` Use the ${translation} translation for all scripture.` : "";
  const excludeNote = excludeQuotes && excludeQuotes.length > 0
    ? `\n\nThe writer has ALREADY chosen these quotes — do NOT repeat or closely duplicate them; find genuinely different material:\n${excludeQuotes.map((q) => `- "${q}"`).join("\n")}`
    : "";
  return `Find enrichment material for this chapter.

Chapter: "${chapterTitle}"
Summary: ${chapterSummary}
Key Points: ${keyPoints.join("; ")}
Audience: ${audience}

Provide 6-10 relevant, high-quality options so the writer has a good range to choose their favorites from. Draw from:
- Quotes from notable figures (with attribution)
${scriptureAudience ? `- Scripture references — ALWAYS include the exact book, chapter, and verse (e.g. "John 3:16").${transNote}\n` : ""}- Historical parallels or anecdotes
- Research findings or statistics
- Complementary perspectives from other authors

For each item, provide:
- quote_text: The exact quote or reference
- source_author: Who said/wrote it${scriptureAudience ? " (for scripture, the translation, or \"Scripture\")" : ""}
- source_title: Book, speech, article, etc.${scriptureAudience ? " — for scripture this MUST be the book + chapter:verse, e.g. \"John 3:16\"" : ""}
- source_type: book | article | scripture | speech | research
- relevance_note: One sentence on why this connects to the chapter

Return valid JSON array. No markdown fencing.

IMPORTANT: Only provide quotes and references you are confident are accurately attributed. If uncertain about exact wording, paraphrase and note "paraphrased" in the source_type. Any scripture reference MUST carry an exact book, chapter, and verse.${excludeNote}`;
}
