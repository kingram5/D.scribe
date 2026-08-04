/**
 * Unit tests for reconcileOutline.
 *
 * FIELD REPORT 2026-08-04 (Kyle): a new project set to 5 chapters produced 8
 * chapter notes. Two independent defects behind it — the structure page never
 * persisted the number (fixed on the page), and /api/outline asked the model
 * for N chapters with NOTHING enforcing it, inserting whatever array came back.
 * Production data at the time: 9 of 12 projects had a chapter count that did
 * not match their setting, including 10 requested -> 7 stored.
 *
 * These lock the structural guarantee: the author's number wins, and no key
 * point is ever silently dropped while getting there.
 */

import { describe, it, expect } from "vitest";
import { reconcileOutline, type DraftChapter } from "../outline-reconcile";

function ch(title: string, ids: number[]): DraftChapter {
  return { title, summary: `${title} summary`, key_point_ids: ids, narrative_arc: "arc" };
}

/** Every key point 1..total appears exactly once across all chapters. */
function coverage(chapters: DraftChapter[]): number[] {
  return chapters.flatMap((c) => c.key_point_ids).sort((a, b) => a - b);
}

describe("reconcileOutline: the requested count is the contract", () => {
  it("leaves a correct outline untouched", () => {
    const input = [ch("A", [1, 2]), ch("B", [3, 4]), ch("C", [5])];
    const { chapters, adjusted } = reconcileOutline(input, 3, 5);
    expect(chapters).toHaveLength(3);
    expect(adjusted).toBe(false);
    expect(coverage(chapters)).toEqual([1, 2, 3, 4, 5]);
  });

  it("merges down when the model returns too many (the 8-instead-of-5 case)", () => {
    const input = [ch("A", [1]), ch("B", [2]), ch("C", [3]), ch("D", [4]), ch("E", [5]), ch("F", [6]), ch("G", [7]), ch("H", [8])];
    const { chapters, adjusted } = reconcileOutline(input, 5, 8);
    expect(chapters).toHaveLength(5);
    expect(adjusted).toBe(true);
    // Nothing lost in the merge.
    expect(coverage(chapters)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("splits up when the model returns too few (10 requested, 7 returned)", () => {
    const input = [ch("A", [1, 2, 3, 4]), ch("B", [5, 6, 7, 8]), ch("C", [9, 10, 11, 12])];
    const { chapters } = reconcileOutline(input, 6, 12);
    expect(chapters).toHaveLength(6);
    expect(coverage(chapters)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("never drops a key point while merging, even down to one chapter", () => {
    const input = [ch("A", [1, 2]), ch("B", [3]), ch("C", [4, 5])];
    const { chapters } = reconcileOutline(input, 1, 5);
    expect(chapters).toHaveLength(1);
    expect(coverage(chapters)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("reconcileOutline: every key point gets exactly one home", () => {
  it("rehomes key points the model forgot entirely", () => {
    // 6 key points exist; the model only placed 4.
    const input = [ch("A", [1, 2]), ch("B", [3, 4])];
    const { chapters, adjusted } = reconcileOutline(input, 2, 6);
    expect(adjusted).toBe(true);
    expect(coverage(chapters)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("de-duplicates a key point the model put in two chapters", () => {
    const input = [ch("A", [1, 2]), ch("B", [2, 3])];
    const { chapters } = reconcileOutline(input, 2, 3);
    expect(coverage(chapters)).toEqual([1, 2, 3]);
  });

  it("discards out-of-range indices instead of writing broken references", () => {
    // 0 and 99 are not valid 1-based indices into a 3-key-point set.
    const input = [ch("A", [0, 1, 99]), ch("B", [2, 3])];
    const { chapters } = reconcileOutline(input, 2, 3);
    expect(coverage(chapters)).toEqual([1, 2, 3]);
  });

  it("handles a malformed key_point_ids field without throwing", () => {
    const input = [
      { title: "A", summary: "s", key_point_ids: undefined as unknown as number[] },
      ch("B", [1]),
    ];
    const { chapters } = reconcileOutline(input, 2, 2);
    expect(chapters).toHaveLength(2);
    expect(coverage(chapters)).toEqual([1, 2]);
  });

  it("does not mutate the caller's array", () => {
    const input = [ch("A", [1]), ch("B", [2])];
    reconcileOutline(input, 1, 2);
    expect(input).toHaveLength(2);
    expect(input[0].key_point_ids).toEqual([1]);
  });

  it("survives an empty outline rather than crashing the route", () => {
    const { chapters, adjusted } = reconcileOutline([], 5, 10);
    expect(chapters).toEqual([]);
    expect(adjusted).toBe(false);
  });
});
