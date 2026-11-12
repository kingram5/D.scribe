import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/claude-next", () => ({ callClaudeNext: vi.fn(), parseJsonReply: vi.fn() }));
import { computeDials, pickDirection, voiceDialsBlock, pickSourceSentences } from "../voice-dials";

describe("voice picker scoring", () => {
  it("maps a pick to the dimension's direction regardless of display order", () => {
    expect(pickDirection({ dimension: "length", a_pole: "short", choice: "a" })).toBe(-1);
    expect(pickDirection({ dimension: "formality", a_pole: "relaxed", choice: "b" })).toBe(1);
    expect(pickDirection({ dimension: "length", a_pole: "short", choice: "b" })).toBe(1);
    expect(pickDirection({ dimension: "length", a_pole: "long", choice: "a" })).toBe(1);
    expect(pickDirection({ dimension: "length", a_pole: "long", choice: "neither" })).toBe(0);
  });

  it("averages picks per dimension and measures polish bias from anchors", () => {
    const { dials, polishBias } = computeDials([
      { dimension: "length", a_pole: "short", choice: "a" },
      { dimension: "length", a_pole: "long", choice: "b" },
      { dimension: "formality", a_pole: "relaxed", choice: "b" },
      { dimension: "anchor", a_pole: "spoken", choice: "b" }, // chose the polished rewrite
    ]);
    expect(dials.length).toBe(-1);
    expect(dials.formality).toBe(1);
    expect(polishBias).toBe(1);
  });

  it("writes nothing for an author who never used the picker", () => {
    expect(voiceDialsBlock(null)).toBe("");
    expect(voiceDialsBlock({ length: 0.2 })).toBe("");
  });

  it("writes confident dials and their own rewrites", () => {
    const block = voiceDialsBlock({ length: -1, texture: -0.6 }, 0, ["Look, I was broke and I knew it."]);
    expect(block).toContain("Keep sentences short and punchy. (strong preference)");
    expect(block).toContain("spoken roughness");
    expect(block).toContain('"Look, I was broke and I knew it."');
  });

  it("discounts toward-polish picks when the author chose polish over their own words", () => {
    const block = voiceDialsBlock({ formality: 0.8, length: -0.8 }, 1);
    expect(block).not.toContain("formal register"); // 0.8 halved to 0.4: below the bar
    expect(block).toContain("Keep sentences short");
    expect(block).toContain("how they'd actually say it");
  });
});

describe("source sentences", () => {
  it("takes mid-length sentences without quotes, spread through the chapter", () => {
    const s = (n: number, tag: string) => `${tag} ${"word ".repeat(n - 2).trim()} end.`;
    const draft = [s(20, "one"), s(5, "short"), 'He said "hello there to everyone in the whole room today" and left for good.', s(20, "two"), s(20, "three"), s(50, "long")].join(" ");
    const picked = pickSourceSentences(draft, 2);
    expect(picked.length).toBe(2);
    expect(picked.every((p) => !p.includes('"'))).toBe(true);
    expect(picked.every((p) => p.split(" ").length <= 35)).toBe(true);
  });
});

describe("pickSourceSentences exclude (flow v2 batches)", () => {
  it("never reuses a sentence an earlier batch used", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i} and it has enough plain words in it to qualify for a pair.`);
    const draft = lines.join(" ");
    const first = pickSourceSentences(draft, 5);
    const second = pickSourceSentences(draft, 5, first);
    expect(second.length).toBe(5);
    expect(second.some((s) => first.includes(s))).toBe(false);
  });
});
