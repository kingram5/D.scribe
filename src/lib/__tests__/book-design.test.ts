import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  PAGE_STYLES,
  CHAPTER_OPENINGS,
  parseHooks,
  validDesignPatch,
} from "../book-design";
import { generateDOCX } from "../export/docx";
import { generatePDF } from "../export/pdf";
import type { ChapterWithContent } from "../export/load-chapters";
const chapter = {
  chapter_number: 1,
  title: "A thoughtful beginning",
  content: {
    content:
      "Remember the first conversation. It changed everything.\n\n## What happened next\n\nWe listened carefully.",
    word_count: 15,
  },
} as ChapterWithContent;

describe("book design validation and export", () => {
  it("rejects unsafe, unsupported and oversized preferences", () => {
    expect(validDesignPatch({ page_style: "__proto__" })).toBe(false);
    expect(validDesignPatch({ chapter_opening: "constructor" })).toBe(false);
    expect(validDesignPatch({ back_cover_hook: "x".repeat(1201) })).toBe(false);
    expect(validDesignPatch({ back_cover_hook: { html: "no" } })).toBe(false);
    expect(
      validDesignPatch({ page_style: null, chapter_opening: "dropcap" }),
    ).toBe(true);
  });
  it("rejects broken and duplicated AI suggestions", () => {
    expect(() => parseHooks('["short"]')).toThrow();
    expect(() =>
      parseHooks(JSON.stringify(Array(3).fill("a".repeat(40)))),
    ).toThrow();
    expect(
      parseHooks(
        JSON.stringify(["a".repeat(40), "b".repeat(40), "c".repeat(40)]),
      ),
    ).toHaveLength(3);
  });
  for (const page_style of Object.keys(
    PAGE_STYLES,
  ) as (keyof typeof PAGE_STYLES)[]) {
    for (const chapter_opening of Object.keys(
      CHAPTER_OPENINGS,
    ) as (keyof typeof CHAPTER_OPENINGS)[]) {
      it(`exports ${page_style} / ${chapter_opening} without leaking marketing copy`, async () => {
        const options = {
          title: "The Book",
          chapters: [chapter],
          design: {
            page_style,
            chapter_opening,
            back_cover_hook: "PRIVATE MARKETING DRAFT",
          },
        };
        const zip = await JSZip.loadAsync(await generateDOCX(options));
        const xml = await zip.file("word/document.xml")!.async("string");
        expect(xml).toContain(PAGE_STYLES[page_style].font);
        expect(xml).toContain("What happened next");
        expect(xml).not.toContain("PRIVATE MARKETING DRAFT");
        if (chapter_opening === "dropcap") {
          expect(xml).toContain('w:dropCap="drop"');
          expect(xml).toContain("emember the first conversation.");
        } else expect(xml).toContain("Remember the first conversation.");
        if (chapter_opening === "divider") expect(xml).toContain("◆");
        const pdf = (await generatePDF(options)).toString("latin1");
        expect(pdf).toMatch(/^%PDF/);
        expect(pdf).toContain("What happened next");
        expect(pdf).not.toContain("PRIVATE MARKETING DRAFT");
      });
    }
  }
  it("keeps legacy exports working when no preference exists", async () => {
    const zip = await JSZip.loadAsync(
      await generateDOCX({ title: "Legacy", chapters: [chapter] }),
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Georgia");
    expect(xml).toContain("Chapter 1: A thoughtful beginning");
  });
});
