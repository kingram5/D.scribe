import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  scoreChapter,
  scoreBook,
  classifyEdit,
  contentTokens,
  normalizedWordDistance,
  BAND_LABELS,
  DISCLAIMER_LINE,
  FIRST_OPEN_MODAL_TEXT,
  COPYRIGHT_GUIDANCE_URL,
  THIN_CHAPTER_PROMPT,
  MOSTLY_YOURS_DEPTH,
  MOSTLY_YOURS_EDITS,
  MOSTLY_AI_DEPTH,
  COSMETIC_DISTANCE,
  SUBSTANTIVE_DISTANCE,
  BOOK_THIN_SHARE,
  type ChapterReadiness,
  type EditEventLite,
} from "../copyright-readiness";

const AI_DRAFT = `The journey of leadership is a testament to persistence. I learned this early in my career.

My first team was seven people in a rented office. We had no budget and no clients.

At the end of the day, what matters is showing up. The landscape of business rewards those who persist and punishes those who don't.

We won our first contract that spring. It changed everything for the company.`;

const HEAVY_REWRITE = `Leadership takes grit, not slogans. I learned that in a warehouse in Odessa, not a seminar.

Seven of us sat on folding chairs. No budget. No clients. My wife asked if the rent check would clear.

Showing up is the whole job. Business pays people who stay and walks away from people who quit.

We signed the first contract that spring. That signature taught me more than any book.`;

function chapter(
  overrides: Partial<ChapterReadiness> & { chapterNumber: number; band: ChapterReadiness["band"] }
): ChapterReadiness {
  return {
    chapterId: overrides.chapterId ?? `ch-${overrides.chapterNumber}`,
    title: overrides.title ?? `Chapter ${overrides.chapterNumber}`,
    editDepth: overrides.editDepth ?? (overrides.band === "mostly_yours" ? 0.6 : overrides.band === "mixed" ? 0.2 : 0),
    substantiveEdits: overrides.substantiveEdits ?? 0,
    cosmeticEdits: overrides.cosmeticEdits ?? 0,
    ...overrides,
  };
}

describe("contentTokens", () => {
  it("strips punctuation, casing, and stopwords", () => {
    expect(contentTokens("The Cat sat on the Mat!")).toEqual(["cat", "sat", "mat"]);
    expect(contentTokens("HELLO, world.")).toEqual(["hello", "world"]);
  });

  it("treats curly and straight apostrophes the same", () => {
    expect(contentTokens("don’t")).toEqual(contentTokens("don't"));
  });

  it("returns empty for whitespace-only or stopword-only text", () => {
    expect(contentTokens("   \n\t  ")).toEqual([]);
    expect(contentTokens("The and or but")).toEqual([]);
  });
});

describe("normalizedWordDistance", () => {
  it("is 0 for identical text", () => {
    expect(normalizedWordDistance(AI_DRAFT, AI_DRAFT)).toBe(0);
  });

  it("is 0 for punctuation, casing, and whitespace-only changes", () => {
    expect(normalizedWordDistance("Hello, world!", "hello world")).toBe(0);
    expect(normalizedWordDistance("Hello   world", "Hello world")).toBe(0);
    expect(normalizedWordDistance("The cat sat.", "the cat sat!")).toBe(0);
  });

  it("is 0 for empty/empty", () => {
    expect(normalizedWordDistance("", "")).toBe(0);
    expect(normalizedWordDistance("   ", "")).toBe(0);
  });

  it("is 1 when one side is empty and the other has content tokens", () => {
    expect(normalizedWordDistance("", "persistence grit warehouse")).toBe(1);
    expect(normalizedWordDistance("persistence grit warehouse", "")).toBe(1);
  });

  it("rises as more content words change", () => {
    const light = normalizedWordDistance(AI_DRAFT, AI_DRAFT.replace("persistence", "grit"));
    const heavy = normalizedWordDistance(AI_DRAFT, HEAVY_REWRITE);
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
    expect(heavy).toBeGreaterThan(MOSTLY_YOURS_DEPTH);
  });
});

describe("classifyEdit", () => {
  it("marks identical and punctuation-only edits cosmetic", () => {
    expect(classifyEdit(AI_DRAFT, AI_DRAFT)).toBe("cosmetic");
    expect(classifyEdit("Hello, world!", "hello world")).toBe("cosmetic");
    expect(classifyEdit("Wait — stop.", "Wait, stop.")).toBe("cosmetic");
  });

  it("marks a tiny wording tweak cosmetic (under 0.05)", () => {
    // 1 of 24 content tokens swapped → distance ≈ 0.042
    const before = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray";
    const after = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey yankee";
    const distance = normalizedWordDistance(before, after);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(COSMETIC_DISTANCE);
    expect(classifyEdit(before, after)).toBe("cosmetic");
  });

  it("treats the middle band (0.05–0.15) as cosmetic — conservative under-credit", () => {
    // 1 of ~10 content tokens swapped → distance around 0.1
    const before = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    const after = "alpha bravo charlie delta echo foxtrot golf hotel india kilo";
    const distance = normalizedWordDistance(before, after);
    expect(distance).toBeGreaterThanOrEqual(COSMETIC_DISTANCE);
    expect(distance).toBeLessThan(SUBSTANTIVE_DISTANCE);
    expect(classifyEdit(before, after)).toBe("cosmetic");
  });

  it("marks a heavy rewrite substantive", () => {
    expect(classifyEdit(AI_DRAFT, HEAVY_REWRITE)).toBe("substantive");
    expect(normalizedWordDistance(AI_DRAFT, HEAVY_REWRITE)).toBeGreaterThanOrEqual(SUBSTANTIVE_DISTANCE);
  });

  it("marks emptying or filling a passage substantive", () => {
    expect(classifyEdit("alpha bravo charlie delta echo", "")).toBe("substantive");
    expect(classifyEdit("", "alpha bravo charlie delta echo")).toBe("substantive");
  });
});

describe("scoreChapter", () => {
  it("identical text gives editDepth 0 / mostly_ai", () => {
    const scored = scoreChapter(AI_DRAFT, AI_DRAFT, [], {
      chapterId: "c1",
      chapterNumber: 1,
      title: "Origins",
    });
    expect(scored.editDepth).toBe(0);
    expect(scored.substantiveEdits).toBe(0);
    expect(scored.cosmeticEdits).toBe(0);
    expect(scored.band).toBe("mostly_ai");
    expect(scored.chapterId).toBe("c1");
    expect(scored.chapterNumber).toBe(1);
    expect(scored.title).toBe("Origins");
  });

  it("heavy rewrite gives mostly_yours via editDepth", () => {
    const scored = scoreChapter(AI_DRAFT, HEAVY_REWRITE, []);
    expect(scored.editDepth).toBeGreaterThanOrEqual(MOSTLY_YOURS_DEPTH);
    expect(scored.band).toBe("mostly_yours");
    expect(scored.substantiveEdits).toBe(0);
  });

  it("punctuation-only edits stay cosmetic and do not lift the band", () => {
    const punctuated = AI_DRAFT.replace(/,/g, " —").replace(/\./g, "!");
    const events: EditEventLite[] = [{ before_text: AI_DRAFT, after_text: punctuated }];
    const scored = scoreChapter(AI_DRAFT, punctuated, events);
    expect(scored.editDepth).toBe(0);
    expect(scored.cosmeticEdits).toBe(1);
    expect(scored.substantiveEdits).toBe(0);
    expect(scored.band).toBe("mostly_ai");
  });

  it("five substantive events lift a thin chapter to mostly_yours even if depth is low", () => {
    const events: EditEventLite[] = Array.from({ length: MOSTLY_YOURS_EDITS }, (_, i) => ({
      before_text: "alpha bravo charlie delta echo foxtrot",
      after_text: `rewritten passage number ${i} with many fresh content words here`,
    }));
    const scored = scoreChapter(AI_DRAFT, AI_DRAFT, events);
    expect(scored.editDepth).toBe(0);
    expect(scored.substantiveEdits).toBe(MOSTLY_YOURS_EDITS);
    expect(scored.band).toBe("mostly_yours");
  });

  it("four substantive events on an unedited draft stay mixed, not mostly_yours", () => {
    const events: EditEventLite[] = Array.from({ length: MOSTLY_YOURS_EDITS - 1 }, (_, i) => ({
      before_text: "alpha bravo charlie delta echo foxtrot",
      after_text: `rewritten passage number ${i} with many fresh content words here`,
    }));
    // Depth stays 0 (final == draft) so the edit-count threshold is the only lever.
    const scored = scoreChapter(AI_DRAFT, AI_DRAFT, events);
    expect(scored.substantiveEdits).toBe(4);
    expect(scored.editDepth).toBe(0);
    expect(scored.band).toBe("mixed");
  });

  it("a modest rewrite without events lands in mixed", () => {
    // Swap a handful of content words — enough to clear 0.08, not 0.35.
    const modest = AI_DRAFT
      .replace("journey", "path")
      .replace("testament", "proof")
      .replace("persistence", "grit")
      .replace("landscape", "world")
      .replace("rewards", "pays");
    const scored = scoreChapter(AI_DRAFT, modest, []);
    expect(scored.editDepth).toBeGreaterThanOrEqual(MOSTLY_AI_DEPTH);
    expect(scored.editDepth).toBeLessThan(MOSTLY_YOURS_DEPTH);
    expect(scored.substantiveEdits).toBe(0);
    expect(scored.band).toBe("mixed");
  });

  it("handles empty and missing inputs without throwing", () => {
    const empty = scoreChapter("", "", []);
    expect(empty.editDepth).toBe(0);
    expect(empty.band).toBe("mostly_ai");

    const noEvents = scoreChapter(AI_DRAFT, AI_DRAFT, undefined as unknown as EditEventLite[]);
    expect(noEvents.band).toBe("mostly_ai");

    const filledFromNothing = scoreChapter("", HEAVY_REWRITE, []);
    expect(filledFromNothing.editDepth).toBe(1);
    expect(filledFromNothing.band).toBe("mostly_yours");
  });

  it("defaults chapter metadata when omitted", () => {
    const scored = scoreChapter(AI_DRAFT, AI_DRAFT, []);
    expect(scored.chapterId).toBe("");
    expect(scored.chapterNumber).toBe(0);
    expect(scored.title).toBe("");
  });

  it("scoring one chapter does not mutate another object's fields", () => {
    const a = scoreChapter(AI_DRAFT, AI_DRAFT, [], { chapterNumber: 1, title: "A" });
    const b = scoreChapter(AI_DRAFT, HEAVY_REWRITE, [], { chapterNumber: 2, title: "B" });
    expect(a.band).toBe("mostly_ai");
    expect(b.band).toBe("mostly_yours");
    expect(a.editDepth).toBe(0);
    expect(b.editDepth).not.toBe(a.editDepth);
    expect(a.chapterNumber).toBe(1);
    expect(b.chapterNumber).toBe(2);
  });
});

describe("scoreBook", () => {
  it("cannot be lifted by one thick chapter among many thin ones", () => {
    const chapters = [
      chapter({ chapterNumber: 1, band: "mostly_yours", editDepth: 0.9, substantiveEdits: 12 }),
      ...Array.from({ length: 9 }, (_, i) =>
        chapter({ chapterNumber: i + 2, band: "mostly_ai", editDepth: 0 })
      ),
    ];
    const book = scoreBook(chapters, "ai_edited");
    expect(book.band).toBe("mostly_ai");
    expect(book.thinChapters).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(BOOK_THIN_SHARE).toBe(0.3);
  });

  it("is mostly_ai when 30% or more of chapters are mostly_ai", () => {
    const atThreshold = [
      chapter({ chapterNumber: 1, band: "mostly_ai" }),
      chapter({ chapterNumber: 2, band: "mostly_ai" }),
      chapter({ chapterNumber: 3, band: "mostly_ai" }),
      chapter({ chapterNumber: 4, band: "mostly_yours" }),
      chapter({ chapterNumber: 5, band: "mostly_yours" }),
      chapter({ chapterNumber: 6, band: "mostly_yours" }),
      chapter({ chapterNumber: 7, band: "mostly_yours" }),
      chapter({ chapterNumber: 8, band: "mostly_yours" }),
      chapter({ chapterNumber: 9, band: "mostly_yours" }),
      chapter({ chapterNumber: 10, band: "mostly_yours" }),
    ];
    expect(scoreBook(atThreshold, "ai_edited").band).toBe("mostly_ai");

    const under = [
      chapter({ chapterNumber: 1, band: "mostly_ai" }),
      chapter({ chapterNumber: 2, band: "mostly_ai" }),
      ...Array.from({ length: 8 }, (_, i) =>
        chapter({ chapterNumber: i + 3, band: "mixed" })
      ),
    ];
    expect(scoreBook(under, "ai_edited").band).toBe("mixed");
  });

  it("all mostly_yours + ai_generated_accepted stays mixed (structure not claimed)", () => {
    const chapters = [1, 2, 3].map((n) =>
      chapter({ chapterNumber: n, band: "mostly_yours", editDepth: 0.7, substantiveEdits: 6 })
    );
    expect(scoreBook(chapters, "ai_generated_accepted").band).toBe("mixed");
  });

  it("all mostly_yours + ai_edited (or user_authored) is mostly_yours", () => {
    const chapters = [1, 2, 3].map((n) =>
      chapter({ chapterNumber: n, band: "mostly_yours", editDepth: 0.7 })
    );
    expect(scoreBook(chapters, "ai_edited").band).toBe("mostly_yours");
    expect(scoreBook(chapters, "user_authored").band).toBe("mostly_yours");
  });

  it("unknown structure strings fall back to ai_generated_accepted", () => {
    const chapters = [chapter({ chapterNumber: 1, band: "mostly_yours" })];
    const book = scoreBook(chapters, "not_a_real_value");
    expect(book.structure).toBe("ai_generated_accepted");
    expect(book.band).toBe("mixed");
  });

  it("empty/edge inputs: no scored chapters is mostly_ai", () => {
    const empty = scoreBook([], "ai_edited", [1, 2]);
    expect(empty.band).toBe("mostly_ai");
    expect(empty.chapters).toEqual([]);
    expect(empty.thinChapters).toEqual([]);
    expect(empty.unscoredChapters).toEqual([1, 2]);
  });

  it("sorts thin and unscored chapter numbers", () => {
    const book = scoreBook(
      [
        chapter({ chapterNumber: 5, band: "mostly_ai" }),
        chapter({ chapterNumber: 2, band: "mostly_ai" }),
        chapter({ chapterNumber: 4, band: "mixed" }),
      ],
      "ai_generated_accepted",
      [9, 1]
    );
    expect(book.thinChapters).toEqual([2, 5]);
    expect(book.unscoredChapters).toEqual([1, 9]);
  });
});

describe("copy — effort not outcome, never a legal verdict", () => {
  const allCopy = [
    DISCLAIMER_LINE,
    FIRST_OPEN_MODAL_TEXT,
    COPYRIGHT_GUIDANCE_URL,
    THIN_CHAPTER_PROMPT(4),
    ...Object.values(BAND_LABELS),
  ].join("\n");

  it("never uses the word copyrightable", () => {
    expect(allCopy.toLowerCase()).not.toContain("copyrightable");
  });

  it("never claims the work is legally protected", () => {
    expect(allCopy.toLowerCase()).not.toContain("legally protected");
  });

  it("keeps the load-bearing first-open modal text verbatim", () => {
    expect(FIRST_OPEN_MODAL_TEXT).toBe(
      "This score is D.Scribe's own measure of how much of this book is yours. It is not legal advice, not a copyright determination, and is based on no official formula — no such formula exists. It shows you where the book is mostly unedited AI draft. For real copyright questions, see the U.S. Copyright Office's AI guidance or an attorney."
    );
  });

  it("keeps the persistent disclaimer verbatim", () => {
    expect(DISCLAIMER_LINE).toBe("D.Scribe's own metric — not a legal assessment.");
  });

  it("points at the Copyright Office AI guidance", () => {
    expect(COPYRIGHT_GUIDANCE_URL).toBe("https://www.copyright.gov/ai/");
  });

  it("names bands as effort, not outcome", () => {
    expect(BAND_LABELS.mostly_yours).toBe("Mostly yours");
    expect(BAND_LABELS.mixed).toBe("Mixed");
    expect(BAND_LABELS.mostly_ai).toBe("Mostly AI");
  });

  it("thin-chapter prompt tells the author where to add themselves", () => {
    expect(THIN_CHAPTER_PROMPT(4)).toBe(
      "Chapter 4 is mostly unedited AI draft — add your voice or cut it"
    );
  });
});

function walkSrc(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkSrc(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

describe("src/ copy guardrails", () => {
  const files = walkSrc(join(__dirname, "..", ".."));

  it("never uses the word copyrightable anywhere in src/", () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").toLowerCase().includes("copyrightable"));
    expect(hits).toEqual([]);
  });

  it("never uses 'legally protected' anywhere in src/", () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").toLowerCase().includes("legally protected"));
    expect(hits).toEqual([]);
  });

  it("does not share a route or module with Voice-Match", () => {
    const api = readFileSync(join(__dirname, "..", "..", "app", "api", "copyright-readiness", "route.ts"), "utf8");
    const badge = readFileSync(join(__dirname, "..", "..", "components", "editor", "CopyrightReadinessBadge.tsx"), "utf8");
    expect(api).not.toMatch(/voice-match|voiceMatch|lintAITells/);
    expect(badge).not.toMatch(/voice-match|voiceMatch|lintAITells/);
    expect(api).toMatch(/loadBookReadiness/);
    expect(badge).toMatch(/Copyright Readiness/);
  });
});
