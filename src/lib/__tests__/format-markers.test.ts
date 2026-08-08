import { describe, it, expect } from "vitest";
import {
  parseInlineRuns,
  parseBlocks,
  runsToPlainText,
  stripFormatMarkers,
} from "../export/format-markers";

describe("format markers — inline runs", () => {
  it("parses bold, italic, and bold-italic", () => {
    const runs = parseInlineRuns("plain **bold** and *italic* and ***both***");
    expect(runs).toEqual([
      { text: "plain ", bold: false, italic: false },
      { text: "bold", bold: true, italic: false },
      { text: " and ", bold: false, italic: false },
      { text: "italic", bold: false, italic: true },
      { text: " and ", bold: false, italic: false },
      { text: "both", bold: true, italic: true },
    ]);
  });

  it("plain text is a single run and round-trips", () => {
    const runs = parseInlineRuns("nothing fancy here");
    expect(runs).toHaveLength(1);
    expect(runsToPlainText(runs)).toBe("nothing fancy here");
  });
});

describe("format markers — blocks", () => {
  it("parses headings, quotes, breaks, paragraphs", () => {
    const blocks = parseBlocks(
      "## The Kitchen\n\nA paragraph.\n\n> As I remember it.\n\n> The cardamom.\n\n---\n\n### Later\n\nMore prose."
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "quote",
      "break",
      "heading",
      "paragraph",
    ]);
    const quote = blocks[2];
    if (quote.kind !== "quote") throw new Error("expected quote");
    expect(quote.paragraphs).toHaveLength(2);
    expect(runsToPlainText(quote.paragraphs[0])).toBe("As I remember it.");
  });

  it("plain prose stays plain paragraphs (backward compatible)", () => {
    const blocks = parseBlocks("First paragraph.\n\nSecond paragraph.");
    expect(blocks.every((b) => b.kind === "paragraph")).toBe(true);
    expect(blocks).toHaveLength(2);
  });
});

describe("format markers — TTS strip", () => {
  it("removes every marker but keeps every word", () => {
    const spoken = stripFormatMarkers(
      "## Title\n\n> A quote with **bold** inside.\n\nAnd *emphasis* stays wordy."
    );
    expect(spoken).not.toMatch(/[*#>]/);
    expect(spoken).toContain("Title");
    expect(spoken).toContain("A quote with bold inside.");
    expect(spoken).toContain("And emphasis stays wordy.");
  });
});
