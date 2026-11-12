import { describe, it, expect } from "vitest";
import { welcomeLine, nextLine, chapterLead } from "../publisher-ready/room-lines";

const q = { question: "What did your father say when you left?", chapter_number: 3, chapter_title: "Leaving Home", positionInBlock: 0 };

describe("second interview room lines (flow v2)", () => {
  it("welcomes back and names the chapter before the first question", () => {
    const line = welcomeLine(q, 0);
    expect(line.startsWith("Welcome back.")).toBe(true);
    expect(line).toContain('First, chapter 3, "Leaving Home".');
    expect(line.endsWith(q.question)).toBe(true);
  });

  it("picks up where the author left off on a return visit", () => {
    expect(welcomeLine({ ...q, positionInBlock: 2 }, 4)).toContain("pick up where we left off");
  });

  it("names the chapter only at the start of its block", () => {
    expect(chapterLead({ ...q, positionInBlock: 1 })).toBe("");
    expect(nextLine({ ...q, positionInBlock: 1 }, 0)).toBe(`Got it. ${q.question}`);
  });

  it("closes out when the editor has nothing left", () => {
    expect(nextLine(null, 2)).toContain("Tap I'm done");
    expect(welcomeLine(null, 0)).toContain("Tap I'm done");
  });

  it("never uses an em dash (Kyle's kill list)", () => {
    for (const line of [welcomeLine(q, 0), welcomeLine(q, 3), nextLine(q, 1), nextLine(q, 2, true), nextLine(null, 0)]) {
      expect(line).not.toContain("—");
    }
  });
});
