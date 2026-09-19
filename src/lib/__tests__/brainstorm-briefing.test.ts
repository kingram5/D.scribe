import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  buildBriefingBlock,
  excerptFrom,
  extractAuthorLines,
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

describe("cross-session continuity", () => {
  // Summarize saves every finished brainstorm as a labeled transcript with the
  // author's answers as speaker "Author". Those answers are the memory: a
  // second session must open with what the author already said, verbatim.

  const SESSION: BriefingTranscript = {
    name: "brainstorm-2026-09-18T10:00:00",
    text: "INTERVIEWER: Where does the book start?\n\nAUTHOR: I want to write about the year our family lost everything and rebuilt.",
    authorLines: ["I want to write about the year our family lost everything and rebuilt."],
  };

  it("extracts substantive author answers from labeled segments", () => {
    const lines = extractAuthorLines([
      { speaker: "Interviewer", text: "What do you want to write about today?" },
      { speaker: "Author", text: "The desert season, and how provision showed up late but fully." },
      { speaker: "Author", text: "Yes." }, // too short to be memory
      { speaker: "Author", text: undefined as unknown as string }, // malformed, skipped
    ]);
    expect(lines).toEqual([
      "The desert season, and how provision showed up late but fully.",
    ]);
  });

  it("returns nothing for unlabeled transcripts", () => {
    expect(extractAuthorLines(null)).toEqual([]);
    expect(extractAuthorLines([{ text: "wall of speech text" }])).toEqual([]);
  });

  it("surfaces past answers as a continuity section, separate from transcript excerpts", () => {
    const block = buildBriefingBlock({
      keyPoints: [],
      transcripts: [SESSION, TRANSCRIPTS[0]],
    });
    expect(block).toContain("EARLIER BRAINSTORM SESSIONS");
    expect(block).toContain('"I want to write about the year our family lost everything and rebuilt."');
    expect(block).toContain("TRANSCRIPT EXCERPTS:");
  });

  it("keeps excerpts section for material without author labels", () => {
    const block = buildBriefingBlock({ keyPoints: [], transcripts: [TRANSCRIPTS[0]] });
    expect(block).not.toContain("EARLIER BRAINSTORM SESSIONS");
    expect(block).toContain("TRANSCRIPT EXCERPTS:");
  });
});

// Source probes, house style: the doctrine lives in the route's system prompt
// string, so a revert to the flat rules list turns these red.
describe("the interviewer's doctrine", () => {
  const route = () =>
    fs.readFileSync(
      path.resolve(__dirname, "../../app/api/brainstorm/route.ts"),
      "utf8",
    );

  it("teaches the question behind the answer, tension-naming and thread-mining", () => {
    const src = route();
    expect(src).toContain("INTERVIEW CRAFT:");
    expect(src).toContain("ASK THE QUESTION BEHIND THE ANSWER");
    expect(src).toContain("NAME THE TENSION");
    expect(src).toContain("NEVER LET A BIG THREAD DIE UNMINED");
  });

  it("keeps the one-question rule and the topic anchor", () => {
    const src = route();
    expect(src).toContain("Never ask multiple questions in a single message");
    expect(src).toContain("TOPIC ANCHOR");
  });
});
