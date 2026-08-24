import { describe, expect, it } from "vitest";
import {
  conversationDigest,
  filterGroundedItems,
  formatResearchedSourcesBlock,
  idsToEvict,
  isGroundedInPages,
  isResearchRateLimited,
  manualResearchProbe,
  rankResearchItems,
  researchProbeAt,
  shouldInsertNormalized,
  normalizeResearchText,
} from "@/lib/research-corpus";

describe("researchProbeAt", () => {
  const empty = { completed: false, fired: new Set<number>(), completedAtTurns: null };

  it("probes at 2, 4, 7, and 10", () => {
    expect(researchProbeAt(2, empty)).toEqual({ key: 2, force: false });
    expect(researchProbeAt(4, empty)).toEqual({ key: 4, force: false });
    expect(researchProbeAt(7, empty)).toEqual({ key: 7, force: false });
    expect(researchProbeAt(10, empty)).toEqual({ key: 10, force: true });
  });

  it("the turn-10 probe carries force", () => {
    expect(researchProbeAt(10, empty)?.force).toBe(true);
  });

  it("never double-fires a threshold", () => {
    expect(researchProbeAt(2, { ...empty, fired: new Set([2]) })).toBeNull();
    expect(researchProbeAt(10, { ...empty, fired: new Set([10]) })).toBeNull();
  });

  it("after a completed job, next probes are +8 and never forced", () => {
    const after = { completed: true, fired: new Set([2]), completedAtTurns: 2 };
    expect(researchProbeAt(4, after)).toBeNull();
    expect(researchProbeAt(7, after)).toBeNull();
    expect(researchProbeAt(10, after)).toEqual({ key: 10, force: false });
    expect(researchProbeAt(18, after)).toEqual({ key: 18, force: false });
  });

  it("manual fire ignores count and carries force", () => {
    expect(manualResearchProbe()).toEqual({ key: "manual", force: true });
  });

  it("does not fire before turn 2 or on unscheduled turns", () => {
    expect(researchProbeAt(1, empty)).toBeNull();
    expect(researchProbeAt(3, empty)).toBeNull();
  });
});

describe("grounding filter", () => {
  const pages = [
    "A 2026 Lifeway Research piece found that 54 percent of Protestant churchgoers tithe regularly.",
    "Other filler about weather and traffic.",
  ];

  it("keeps verbatim extracts and drops invented text", () => {
    const kept = filterGroundedItems([
      { text: "54 percent of Protestant churchgoers tithe regularly" },
      { text: "Experts agree tithing will triple by 2030" },
    ], pages);
    expect(kept).toEqual([{ text: "54 percent of Protestant churchgoers tithe regularly" }]);
  });

  it("normalizes whitespace before matching", () => {
    expect(isGroundedInPages("54   percent   of Protestant churchgoers tithe regularly", pages)).toBe(true);
  });
});

describe("ranker", () => {
  const items = [
    {
      kind: "quote" as const,
      text: "aaa",
      source_title: "A",
      source_url: "https://a.example",
      themes: ["tithing"],
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      kind: "stat" as const,
      text: "bbb ".repeat(400),
      source_title: "B",
      source_url: "https://b.example",
      themes: ["generosity"],
      created_at: "2026-01-02T00:00:00.000Z",
    },
    {
      kind: "reference" as const,
      text: "ccc",
      source_title: "C",
      source_url: "https://c.example",
      themes: ["tithing", "families"],
      created_at: "2026-01-03T00:00:00.000Z",
    },
  ];

  it("orders by theme overlap with recent user words", () => {
    const ranked = rankResearchItems(items, "I want to write about tithing for young families");
    expect(ranked[0].source_title).toBe("C");
    expect(ranked.map((i) => i.source_title)).toContain("A");
  });

  it("respects the token cap", () => {
    const ranked = rankResearchItems(items, "tithing families", 80);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked.some((i) => i.source_title === "B")).toBe(false);
    const chars = ranked.reduce((n, i) => n + i.text.length + i.source_title.length, 0);
    expect(chars).toBeLessThanOrEqual(80 * 4);
  });
});

describe("dedupe and corpus cap", () => {
  it("rejects the same normalized text", () => {
    expect(shouldInsertNormalized("Hello  world", [normalizeResearchText("hello world")])).toBe(false);
    expect(shouldInsertNormalized("Hello world", [])).toBe(true);
  });

  it("evicts the oldest items once the 31st would exceed the cap", () => {
    const items = Array.from({ length: 31 }, (_, i) => ({
      id: `id-${i}`,
      created_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    expect(idsToEvict(items, 30)).toEqual(["id-0"]);
  });
});

describe("injection block", () => {
  it("includes RESEARCHED SOURCES when items exist", () => {
    const block = formatResearchedSourcesBlock([{
      kind: "stat",
      text: "54 percent tithe",
      attribution: "Lifeway",
      source_title: "Lifeway Research",
      source_url: "https://example.com/lifeway",
      source_date: "2026",
      themes: ["tithing"],
      created_at: new Date().toISOString(),
    }]);
    expect(block).toContain("RESEARCHED SOURCES");
    expect(block).toContain("54 percent tithe");
    expect(block).toContain("NEW");
  });

  it("is empty when every item is gone", () => {
    expect(formatResearchedSourcesBlock([])).toBe("");
  });
});

describe("rate caps and digest", () => {
  it("rate-limits at 3/hour or 10/day", () => {
    expect(isResearchRateLimited(3, 1)).toBe(true);
    expect(isResearchRateLimited(1, 10)).toBe(true);
    expect(isResearchRateLimited(2, 9)).toBe(false);
  });

  it("trims the digest to the last 20 messages", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    expect(conversationDigest(msgs)).toHaveLength(20);
    expect(conversationDigest(msgs)[0].content).toBe("m5");
  });
});
