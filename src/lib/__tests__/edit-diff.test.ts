import { describe, it, expect } from "vitest";
import { computeEditDelta } from "../edit-diff";
import { styleMemoryPromptBlock, isEmptyMemory, StyleMemory } from "../style-memory";

const GENERATED = `The journey of leadership is a testament to persistence. I learned this early in my career.

My first team was seven people in a rented office. We had no budget and no clients.

At the end of the day, what matters is showing up. The landscape of business rewards those who persist — and punishes those who don't.

We won our first contract that spring. It changed everything for the company.`;

const EDITED = `Leadership takes persistence. I learned this early in my career.

My first team was seven people in a rented office. We had no budget and no clients.

What matters is showing up. Business rewards people who persist and punishes the ones who quit.

We won our first contract that spring. It changed everything for the company.

That contract taught me more than any book ever did.`;

describe("computeEditDelta", () => {
  const delta = computeEditDelta(GENERATED, EDITED);

  it("identifies unchanged sentences via LCS", () => {
    // "I learned this early in my career." etc. survive untouched
    expect(delta.stats.sentences_total).toBeGreaterThan(5);
    expect(delta.stats.edit_rate).toBeLessThan(1);
    expect(delta.stats.edit_rate).toBeGreaterThan(0);
  });

  it("aligns rewritten sentences as changed pairs", () => {
    const pair = delta.changed_pairs.find((p) =>
      p.original.includes("journey of leadership")
    );
    expect(pair).toBeDefined();
    expect(pair!.edited).toContain("Leadership takes persistence");
  });

  it("captures added sentences", () => {
    expect(delta.added.some((s) => s.includes("more than any book"))).toBe(true);
  });

  it("detects removed AI tells", () => {
    expect(delta.stats.em_dashes_removed).toBeGreaterThanOrEqual(1);
    expect(delta.stats.banned_phrases_removed).toContain("at the end of the day");
    expect(delta.stats.banned_phrases_removed).toContain("journey");
  });

  it("returns zero-change delta for identical texts", () => {
    const same = computeEditDelta(GENERATED, GENERATED);
    expect(same.stats.sentences_changed).toBe(0);
    expect(same.changed_pairs).toEqual([]);
    expect(same.stats.edit_rate).toBe(0);
  });

  it("handles empty inputs", () => {
    const empty = computeEditDelta("", "");
    expect(empty.stats.sentences_total).toBe(0);
    expect(empty.stats.edit_rate).toBe(0);
  });
});

describe("styleMemoryPromptBlock", () => {
  const memory: StyleMemory = {
    avoid: ["em dashes", 'openers like "At the end of the day"'],
    prefer: ["short declarative openings", "concrete numbers over vague scale words"],
    phrase_swaps: [{ from: "the landscape of business", to: "business" }],
    notes: ["cuts roughly 10% of words from every draft"],
  };

  it("renders all sections", () => {
    const block = styleMemoryPromptBlock(memory);
    expect(block).toContain("AUTHOR'S EDITING PATTERNS");
    expect(block).toContain("em dashes");
    expect(block).toContain("short declarative openings");
    expect(block).toContain('"the landscape of business" → "business"');
    expect(block).toContain("cuts roughly 10%");
  });

  it("returns empty string for empty/missing memory", () => {
    expect(styleMemoryPromptBlock(null)).toBe("");
    expect(styleMemoryPromptBlock(undefined)).toBe("");
    expect(
      styleMemoryPromptBlock({ avoid: [], prefer: [], phrase_swaps: [], notes: [] })
    ).toBe("");
  });

  it("isEmptyMemory agrees with the block builder", () => {
    expect(isEmptyMemory(memory)).toBe(false);
    expect(isEmptyMemory(null)).toBe(true);
    expect(isEmptyMemory({ avoid: [], prefer: [], phrase_swaps: [], notes: [] })).toBe(true);
  });
});
