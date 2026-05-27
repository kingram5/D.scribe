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

Return ONLY a valid JSON array. No markdown fencing. CRITICAL for valid JSON: inside quote_text, use curly quotes “ ” for any quotation marks within the text — never raw straight double quotes inside a string value.

IMPORTANT: Only provide quotes and references you are confident are accurately attributed. source_type MUST be exactly one of: book, article, scripture, speech, research. If you are paraphrasing rather than quoting verbatim, keep the correct source_type and add "(paraphrased)" to relevance_note. Any scripture reference MUST carry an exact book, chapter, and verse.${excludeNote}`;
}
