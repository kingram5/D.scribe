import { describe, expect, it } from "vitest";
import {
  BRIEFING_BUDGET,
  buildBriefingBlock,
  excerptFrom,
  extractAuthorLines,
  rankKeyPoints,
  thinChaptersFrom,
  type BriefingKeyPoint,
} from "@/lib/brainstorm-briefing";

const kp = (title: string, summary: string, extra: Partial<BriefingKeyPoint> = {}): BriefingKeyPoint => ({ title, summary, ...extra });

const POINTS: BriefingKeyPoint[] = [
  kp("Forgiveness is a decision", "He chose to forgive his father before he felt anything", { supporting_quotes: ["I forgave him in the parking lot of the hospital"], relevance_score: 0.9 }),
  kp("Budgeting the church", "How the building fund nearly split the congregation", { relevance_score: 0.5 }),
  kp("Prayer as a habit", "Praying at the same hour every morning for a year", { relevance_score: 0.7 }),
  kp("Leading volunteers", "Why volunteers quit and what kept his team", { relevance_score: 0.6 }),
  kp("Sabbath", "Learning to stop working on Mondays", { relevance_score: 0.4 }),
];

describe("rankKeyPoints", () => {
  it("with no conversation yet, returns the strongest points by relevance score", () => {
    const out = rankKeyPoints(POINTS, "");
    expect(out.map((p) => p.title)).toEqual(["Forgiveness is a decision", "Prayer as a habit", "Leading volunteers", "Budgeting the church"]);
  });

  it("ranks against what the author just said", () => {
    const out = rankKeyPoints(POINTS, "my father was in the hospital and I had to decide whether to forgive him");
    expect(out[0].title).toBe("Forgiveness is a decision");
  });

  it("returns nothing when the conversation shares nothing with the material", () => {
    expect(rankKeyPoints(POINTS, "we went fishing on the lake with my cousins that summer")).toEqual([]);
  });

  it("caps the number of points", () => {
    const many = Array.from({ length: 12 }, (_, i) => kp(`Point ${i}`, "summary", { relevance_score: i / 12 }));
    expect(rankKeyPoints(many, "").length).toBe(4);
  });
});

describe("buildBriefingBlock", () => {
  it("is empty for a project with no material", () => {
    expect(buildBriefingBlock({ keyPoints: [], transcripts: [] })).toBe("");
  });

  it("is empty mid-conversation when nothing recorded is relevant", () => {
    expect(buildBriefingBlock({ keyPoints: POINTS, transcripts: [] }, "we went fishing on the lake with my cousins")).toBe("");
  });

  it("surfaces the matched point with the author's own quote", () => {
    const block = buildBriefingBlock({ keyPoints: POINTS, transcripts: [] }, "my father in the hospital, deciding to forgive");
    expect(block).toContain("Forgiveness is a decision");
    expect(block).toContain('"I forgave him in the parking lot of the hospital"');
    expect(block).not.toContain("Sabbath");
  });

  it("tells Theo the digest is silent by default and never to invent quotes", () => {
    const block = buildBriefingBlock({ keyPoints: POINTS, transcripts: [] });
    expect(block).toMatch(/Use it silently/);
    expect(block).toMatch(/CALLBACKS/);
    expect(block).toMatch(/Never invent/);
  });

  it("puts continuity FIRST so a budget trim can never cut the memory", () => {
    const block = buildBriefingBlock({
      keyPoints: POINTS,
      transcripts: [],
      handoffs: [{ line: "I forgave him in the parking lot", openThread: "what his mother said afterwards", nextQuestion: "Who else needed to hear it?" }],
    });
    expect(block.indexOf("FROM EARLIER SESSIONS")).toBeGreaterThan(0);
    expect(block.indexOf("FROM EARLIER SESSIONS")).toBeLessThan(block.indexOf("ALREADY RECORDED"));
    expect(block).toContain("what his mother said afterwards");
    expect(block).toContain("Who else needed to hear it?");
  });

  it("falls back to the author's past lines when a session has no handoff", () => {
    const block = buildBriefingBlock({ keyPoints: [], transcripts: [{ name: "brainstorm", text: "x", authorLines: ["The winter the heat got shut off in the Decatur house changed how I saw my mother."] }] });
    expect(block).toContain("Decatur house");
  });

  it("names thin chapters to Theo and forbids naming them to the author", () => {
    const block = buildBriefingBlock({ keyPoints: POINTS, transcripts: [], thinChapters: [{ title: "The Long Obedience", points: 0 }] });
    expect(block).toContain("The Long Obedience");
    expect(block).toMatch(/NEVER mention chapters/);
  });

  it("uses a transcript excerpt only when there is nothing better", () => {
    const text = "Thanks for having me. ".repeat(40) + "The day the mill closed my father came home at noon. " + "More detail here. ".repeat(40);
    const withOnlyTranscript = buildBriefingBlock({ keyPoints: [], transcripts: [{ name: "talk.mp3", text }] });
    expect(withOnlyTranscript).toContain('from "talk.mp3"');
    const withPoints = buildBriefingBlock({ keyPoints: POINTS, transcripts: [{ name: "talk.mp3", text }] });
    expect(withPoints).not.toContain('from "talk.mp3"');
  });

  it("never exceeds the budget", () => {
    const fat = Array.from({ length: 30 }, (_, i) => kp(`Point number ${i} with a long title `.repeat(3), "summary text ".repeat(40), { supporting_quotes: ["a quote ".repeat(40)], relevance_score: 1 }));
    const block = buildBriefingBlock({
      keyPoints: fat, transcripts: [],
      handoffs: [{ line: "line ".repeat(100), openThread: "thread ".repeat(60), nextQuestion: "question ".repeat(60) }],
      thinChapters: [{ title: "T ".repeat(80), points: 0 }, { title: "U ".repeat(80), points: 1 }],
    });
    expect(block.length).toBeLessThanOrEqual(BRIEFING_BUDGET);
    expect(block).toContain("FROM EARLIER SESSIONS");
  });
});

describe("extractAuthorLines", () => {
  it("keeps the author's LONGEST lines, not the warm-up", () => {
    const lines = extractAuthorLines([
      { speaker: "Author", text: "Hi Theo, yes I am ready to get started today, thank you." },
      { speaker: "Interviewer", text: "Where were you when you learned that?" },
      { speaker: "Author", text: "I was standing in the hospital parking lot holding my father's watch, and I remember thinking that I could carry this anger for another twenty years or I could put it down right there." },
      { speaker: "Author", text: "ok" },
    ]);
    expect(lines[0]).toContain("hospital parking lot");
    expect(lines).not.toContain("ok");
  });

  it("handles junk", () => {
    expect(extractAuthorLines(null)).toEqual([]);
    expect(extractAuthorLines(undefined)).toEqual([]);
  });
});

describe("thinChaptersFrom", () => {
  it("returns the thinnest chapters first and ignores well-fed ones", () => {
    const out = thinChaptersFrom([
      { title: "One", key_point_ids: ["a", "b", "c"] },
      { title: "Two", key_point_ids: [] },
      { title: "Three", key_point_ids: ["a"] },
      { title: "", key_point_ids: [] },
    ]);
    expect(out).toEqual([{ title: "Two", points: 0 }, { title: "Three", points: 1 }]);
  });
});

describe("excerptFrom", () => {
  it("returns short text whole", () => {
    expect(excerptFrom("A short line.")).toBe("A short line.");
  });
  it("starts at a sentence boundary past the wind-up", () => {
    const text = "Thanks for having me. ".repeat(30) + "The real point starts here and keeps going for a while. " + "Filler sentence. ".repeat(30);
    const out = excerptFrom(text);
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out[0]).toMatch(/[A-Z]/);
  });
});
