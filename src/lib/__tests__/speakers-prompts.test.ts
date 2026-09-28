import { describe, it, expect } from "vitest";
import { buildBriefingBlock, type BriefingInput } from "../brainstorm-briefing";
import { extractExcerptsForChapter } from "../chunker";
import { keyPointForPrompt, extractionSpeakerBlock, keyPointSpeakerColumns, projectSourceText } from "../speakers";

const base: BriefingInput = {
  keyPoints: [{ title: "Losing the farm", summary: "A father loses the family farm and the family moves.", supporting_quotes: ["my father lost the farm and we moved to Tulsa"], relevance_score: 0.9 }],
  transcripts: [],
  handoffs: [],
  thinChapters: [],
  pastSessions: [],
};

describe("speaker labels leave unlabeled prompts unchanged", () => {
  it("briefing: no labels = no markers and no extra rule", () => {
    const block = buildBriefingBlock(base);
    expect(block).toContain('in their words: "my father lost the farm');
    expect(block).not.toContain("not the author");
    expect(block).not.toContain("NOT the author's life");
  });

  it("key point + extraction helpers are no-ops when unlabeled", () => {
    const kp = { title: "t", summary: "s" };
    expect(keyPointForPrompt(kp)).toBe(kp);
    const plain = { full_text: "a b c", segments: null, speaker_map: null };
    expect(extractionSpeakerBlock(plain)).toBe("");
    expect(keyPointSpeakerColumns(plain, ["a b c"])).toEqual({});
    expect(projectSourceText([plain, { ...plain, full_text: "d e" }])).toBe("a b c\n\nd e");
  });
});

describe("speaker labels change prompts when someone else spoke", () => {
  it("briefing marks another speaker's point and adds the rule", () => {
    const block = buildBriefingBlock({
      ...base,
      keyPoints: [{ ...base.keyPoints[0], speaker_role: "other", speaker_name: "Pastor Mike" }],
    });
    expect(block).toContain("[Pastor Mike's point, not the author's]");
    expect(block).toContain('in Pastor Mike\'s words: "my father lost the farm');
    expect(block).toContain("NOT the author's life");
  });

  it("writer sees whose point it is", () => {
    expect(keyPointForPrompt({ title: "t", summary: "s.", speaker_role: "other", speaker_name: "Grandma Ruth" }).summary)
      .toBe("s. (This comes from Grandma Ruth, not the author.)");
  });

  it("excerpts still match quotes a model prefixed with a speaker tag", () => {
    const text = "intro words here. [Pastor Mike, my pastor]: my father lost the farm and we moved to Tulsa. more words.";
    const out = extractExcerptsForChapter(text, [["[Pastor Mike, my pastor]: my father lost the farm"]]);
    expect(out).toContain("my father lost the farm");
    expect(out.startsWith("...")).toBe(true);
  });
});
