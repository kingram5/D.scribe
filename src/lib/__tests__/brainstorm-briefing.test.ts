import { describe, it, expect } from "vitest";
import {
  buildBriefingBlock,
  excerptFrom,
  BRIEFING_BUDGET,
  type BriefingKeyPoint,
  type BriefingTranscript,
} from "@/lib/brainstorm-briefing";

// The interviewer used to be blind to the author's recorded material, so it
// asked strolled questions with no substance behind them. These pin the digest
// that gives it homework: distilled key points, the author's verbatim words,
// and hard caps so the block never bloats the per-turn prompt.

const POINTS: BriefingKeyPoint[] = [
  {
    title: "Tithing is a trust exercise",
    summary: "The author argues tithing measures trust in provision, not compliance.",
    supporting_quotes: ["I told my congregation, you cannot out-give God."],
  },
  {
    title: "The 90-day reset",
    summary: "A framework for restarting stalled finances in one quarter.",
  },
];

const TRANSCRIPTS: BriefingTranscript[] = [
  { name: "sermon-2026-03-15.mp3", text: "Thanks for having me today. ".repeat(5) + "But the real shift came when I stopped managing money and started trusting God with it. That season changed everything for our family and for the church." },
];

describe("excerptFrom", () => {
  it("takes the excerpt from the middle, past the opening wind-up", () => {
    const ex = excerptFrom(TRANSCRIPTS[0].text);
    expect(ex).not.toContain("Thanks for having me");
    expect(ex).toContain("real shift");
  });

  it("returns short text whole", () => {
    expect(excerptFrom("Short talk.")).toBe("Short talk.");
  });

  it("collapses whitespace and caps length", () => {
    const ex = excerptFrom("word ".repeat(400));
    expect(ex.length).toBeLessThanOrEqual(220);
    expect(ex).not.toMatch(/  /);
  });
});

describe("buildBriefingBlock", () => {
  it("returns empty when the project has no material", () => {
    expect(buildBriefingBlock({ keyPoints: [], transcripts: [] })).toBe("");
  });

  it("lists distilled points and quotes the author verbatim", () => {
    const block = buildBriefingBlock({ keyPoints: POINTS, transcripts: TRANSCRIPTS });
    expect(block).toContain("Tithing is a trust exercise");
    expect(block).toContain('"I told my congregation, you cannot out-give God."');
    expect(block).toContain('from "sermon-2026-03-15.mp3"');
  });

  it("instructs Theo to quote verbatim and never invent quotes", () => {
    const block = buildBriefingBlock({ keyPoints: POINTS, transcripts: [] });
    expect(block).toMatch(/verbatim/);
    expect(block).toMatch(/Never invent/);
  });

  it("hard-caps the block so it never bloats the per-turn prompt", () => {
    const many: BriefingKeyPoint[] = Array.from({ length: 40 }, (_, i) => ({
      title: `Point ${i} about money mindset and frameworks`,
      summary: "A long summary ".repeat(20),
      supporting_quotes: ["quote ".repeat(60)],
    }));
    const block = buildBriefingBlock({ keyPoints: many, transcripts: TRANSCRIPTS });
    expect(block.length).toBeLessThanOrEqual(BRIEFING_BUDGET);
  });

  it("caps the number of points surfaced", () => {
    const many: BriefingKeyPoint[] = Array.from({ length: 30 }, (_, i) => ({
      title: `Point ${i}`,
      summary: "s",
    }));
    const block = buildBriefingBlock({ keyPoints: many, transcripts: [] });
    expect(block).toContain("Point 7");
    expect(block).not.toContain("Point 8\n");
  });
});
