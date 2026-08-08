import { describe, it, expect } from "vitest";
import {
  AUDIENCES,
  SCRIPTURE_AUDIENCES,
  getAudienceProfile,
  brainstormProfileBlock,
  extractionProfileBlock,
  outlineProfileBlock,
  generationProfileBlock,
} from "../audience-profiles";

describe("audience profiles — coverage", () => {
  it("lists all 16 audiences including the two the structure page carried", () => {
    expect(AUDIENCES).toHaveLength(16);
    expect(AUDIENCES).toContain("Young Adult");
    expect(AUDIENCES).toContain("Academic");
  });

  it("General and unknown audiences get NO conditioning (generic behavior preserved)", () => {
    expect(getAudienceProfile("General")).toBeNull();
    expect(getAudienceProfile(null)).toBeNull();
    expect(getAudienceProfile(undefined)).toBeNull();
    expect(getAudienceProfile("Definitely Not An Audience")).toBeNull();
    expect(brainstormProfileBlock("General")).toBeNull();
    expect(extractionProfileBlock("General")).toBe("");
    expect(outlineProfileBlock(null)).toBe("");
    expect(generationProfileBlock(undefined)).toBe("");
  });

  it("every non-General audience returns a complete profile", () => {
    for (const a of AUDIENCES) {
      if (a === "General") continue;
      const p = getAudienceProfile(a);
      expect(p, a).not.toBeNull();
      expect(p!.persona.length, a).toBeGreaterThan(20);
      expect(p!.opener.length, a).toBeGreaterThan(10);
      expect(p!.probes.length, a).toBeGreaterThanOrEqual(3);
      expect(p!.preserve.length, a).toBeGreaterThanOrEqual(3);
      expect(p!.generation.length, a).toBeGreaterThanOrEqual(3);
      expect(p!.outlineShape.length, a).toBeGreaterThan(30);
    }
  });

  it("template audiences fold the audience name into the interviewer", () => {
    const p = getAudienceProfile("Parenting")!;
    expect(p.persona).toContain("Parenting");
    expect(p.opener).toContain("Parenting");
  });
});

describe("audience profiles — scripture handling", () => {
  it("scripture rule appears for scripture audiences, with the project translation", () => {
    for (const a of SCRIPTURE_AUDIENCES) {
      const block = brainstormProfileBlock(a, "ESV")!;
      expect(block, a).toContain("SCRIPTURE RULE");
      expect(block, a).toContain("ESV");
      const gen = generationProfileBlock(a, "NKJV");
      expect(gen, a).toContain("SCRIPTURE RULE");
      expect(gen, a).toContain("NKJV");
    }
  });

  it("scripture rule never leaks into non-faith audiences", () => {
    const block = brainstormProfileBlock("Money & Finance", "ESV")!;
    expect(block).not.toContain("SCRIPTURE RULE");
    expect(generationProfileBlock("Memoir & Biography", "ESV")).not.toContain("SCRIPTURE RULE");
  });
});

describe("audience profiles — the voice-precedence rule, enforced", () => {
  // 3b's load-bearing constraint: generation directives are CONTENT AND STRUCTURE
  // only. The author's voice (Voice Profile + style memory) owns diction, rhythm,
  // phrasing. A style adjective in a generation directive is the first step toward
  // "sounds like the genre instead of the author" — the exact failure every
  // competitor gets roasted for. This test makes the rule mechanical.
  const STYLE_WORDS =
    /\b(warm(?:ly)?|friendly|casual|formal(?:ly)?|conversational|punchy|breezy|folksy|lyrical|poetic|eloquent|upbeat|inspirational|uplifting|humorous|witty|playful|heartfelt|elegant|polished|tone|rhythm|cadence|diction)\b/i;

  it("no generation directive contains a style adjective, for any audience", () => {
    for (const a of AUDIENCES) {
      const p = getAudienceProfile(a);
      if (!p) continue;
      for (const directive of p.generation) {
        expect(STYLE_WORDS.test(directive), `${a}: "${directive}"`).toBe(false);
      }
    }
  });

  it("the generation block header states the precedence rule", () => {
    const block = generationProfileBlock("Money & Finance");
    expect(block).toContain("NEVER override the author's voice");
  });
});

describe("audience profiles — flagship content spot checks", () => {
  it("Money & Finance preserves numbers and never lets the AI supply them", () => {
    const p = getAudienceProfile("Money & Finance")!;
    expect(p.preserve.join(" ")).toMatch(/number|figure/i);
    expect(p.guardrails.join(" ")).toMatch(/never supply statistics/i);
    expect(p.generation.join(" ")).toMatch(/never invent, round, or update figures/i);
  });

  it("Memoir preserves scenes, names, and uncertainty markers", () => {
    const p = getAudienceProfile("Memoir & Biography")!;
    const preserved = p.preserve.join(" ");
    expect(preserved).toMatch(/scene/i);
    expect(preserved).toMatch(/named person|names/i);
    expect(preserved).toMatch(/as I remember it/i);
    expect(p.generation.join(" ")).toMatch(/never invent/i);
  });

  it("Christian Living forbids fabricated scripture in guardrails and generation", () => {
    const p = getAudienceProfile("Christian Living")!;
    expect(p.guardrails.join(" ")).toMatch(/NEVER fabricate/i);
    expect(p.generation.join(" ")).toMatch(/never introduce verses/i);
  });
});
