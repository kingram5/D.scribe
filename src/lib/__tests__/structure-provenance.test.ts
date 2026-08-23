import { describe, it, expect } from "vitest";
import { isOutlineChapterMutation } from "../structure-provenance";

const existing = {
  title: "Origins",
  summary: "How it started",
  sort_order: 0,
  chapter_number: 1,
};

describe("isOutlineChapterMutation", () => {
  it("is false when the existing row is missing", () => {
    expect(isOutlineChapterMutation(null, { title: "New" })).toBe(false);
  });

  it("is false when only non-outline fields change", () => {
    expect(
      isOutlineChapterMutation(existing, { key_point_ids: ["kp-1"], target_word_count: 2000 })
    ).toBe(false);
  });

  it("is false when outline fields are sent but unchanged (outline auto-save)", () => {
    expect(
      isOutlineChapterMutation(existing, {
        title: "Origins",
        summary: "How it started",
        sort_order: 0,
        chapter_number: 1,
      })
    ).toBe(false);
  });

  it("is true for a title or summary edit", () => {
    expect(isOutlineChapterMutation(existing, { title: "Beginnings" })).toBe(true);
    expect(isOutlineChapterMutation(existing, { summary: "A different take" })).toBe(true);
  });

  it("is true for a reorder", () => {
    expect(isOutlineChapterMutation(existing, { sort_order: 2, chapter_number: 3 })).toBe(true);
  });
});
