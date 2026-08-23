import { describe, it, expect } from "vitest";
import { DISCLOSURE_SYSTEM, disclosurePrompt } from "../prompts/disclosure";
import type { BookReadiness } from "../copyright-readiness";

const readiness: BookReadiness = {
  band: "mixed",
  structure: "ai_edited",
  thinChapters: [4],
  unscoredChapters: [8],
  chapters: [
    {
      chapterId: "c1",
      chapterNumber: 1,
      title: "Origins",
      editDepth: 0.4,
      substantiveEdits: 6,
      cosmeticEdits: 1,
      band: "mostly_yours",
    },
    {
      chapterId: "c4",
      chapterNumber: 4,
      title: "The Long Middle",
      editDepth: 0.02,
      substantiveEdits: 0,
      cosmeticEdits: 0,
      band: "mostly_ai",
    },
  ],
};

describe("disclosure prompt", () => {
  const prompt = disclosurePrompt({
    title: "Odessa Nights",
    readiness,
    editTotals: { events: 7, substantive: 6, cosmetic: 1 },
  });
  const combined = `${DISCLOSURE_SYSTEM}\n${prompt}`;

  it("asks for first-person factual JSON with both keys", () => {
    expect(DISCLOSURE_SYSTEM).toMatch(/First person/);
    expect(DISCLOSURE_SYSTEM).toMatch(/copyrightOfficeStatement/);
    expect(DISCLOSURE_SYSTEM).toMatch(/kdpAnswer/);
    expect(prompt).toMatch(/copyrightOfficeStatement/);
    expect(prompt).toMatch(/kdpAnswer/);
  });

  it("feeds bands and edit totals, never chapter prose", () => {
    expect(prompt).toContain("Odessa Nights");
    expect(prompt).toContain("mostly_ai");
    expect(prompt).toContain("ai_edited");
    expect(prompt).toContain("Thin (mostly unedited AI draft) chapters: 4");
    expect(prompt).toContain("6 substantive");
    expect(prompt).not.toMatch(/I remember the night/);
    expect(combined.toLowerCase()).toContain("no chapter prose");
  });

  it("forbids legal conclusions without using banned verdict words", () => {
    expect(DISCLOSURE_SYSTEM).toMatch(/No legal conclusions/);
    expect(combined.toLowerCase()).not.toContain("copyrightable");
    expect(combined.toLowerCase()).not.toContain("legally protected");
  });
});
