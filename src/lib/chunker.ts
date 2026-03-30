/**
 * Splits transcript text into overlapping chunks for Claude processing.
 * ~3000 words per chunk with 200-word overlap to preserve context.
 */

const DEFAULT_CHUNK_SIZE = 3000; // words
const DEFAULT_OVERLAP = 200; // words

export interface Chunk {
  text: string;
  wordCount: number;
  index: number;
  totalChunks: number;
}

export function chunkTranscript(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP
): Chunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= chunkSize) {
    return [{ text, wordCount: words.length, index: 0, totalChunks: 1 }];
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);

    // Try to break at sentence boundary (look back up to 50 words)
    if (end < words.length) {
      const lastFifty = chunkWords.slice(-50).join(" ");
      const sentenceEnd = lastFifty.search(/[.!?]\s+(?=[A-Z])/);
      if (sentenceEnd !== -1) {
        const trimTo =
          chunkWords.length -
          50 +
          lastFifty.slice(0, sentenceEnd + 1).split(/\s+/).length;
        chunkWords.length = trimTo;
      }
    }

    chunks.push({
      text: chunkWords.join(" "),
      wordCount: chunkWords.length,
      index: chunks.length,
      totalChunks: 0, // filled in below
    });

    const advance = chunkWords.length - overlap;
    if (advance <= 0) break; // prevent infinite loop on small trailing chunks
    start = start + advance;
    if (start >= words.length) break;
  }

  // Fill totalChunks
  for (const chunk of chunks) {
    chunk.totalChunks = chunks.length;
  }

  return chunks;
}

/** Extract transcript text relevant to specific key point IDs */
export function extractExcerptsForChapter(
  fullText: string,
  keyPointQuotes: string[][]
): string {
  // Collect all supporting quotes for this chapter's key points
  const quotes = keyPointQuotes.flat();
  if (quotes.length === 0) return fullText.slice(0, 3000);

  // Find surrounding context for each quote in the transcript
  const excerpts: string[] = [];
  for (const quote of quotes) {
    const idx = fullText.indexOf(quote);
    if (idx === -1) continue;

    const contextStart = Math.max(0, idx - 200);
    const contextEnd = Math.min(fullText.length, idx + quote.length + 200);
    excerpts.push("..." + fullText.slice(contextStart, contextEnd) + "...");
  }

  return excerpts.length > 0 ? excerpts.join("\n\n") : fullText.slice(0, 3000);
}
