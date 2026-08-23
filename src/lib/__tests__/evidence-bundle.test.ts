import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { coverPageLine, generateEvidencePDF, type EvidenceBundle } from "../export/evidence-bundle";
import { DISCLAIMER_LINE } from "../copyright-readiness";

const sample: EvidenceBundle = {
  title: "Odessa Nights",
  generatedAt: new Date("2026-08-23T12:00:00.000Z"),
  transcripts: [
    {
      id: "t1",
      full_text: "AUTHOR: We lost the house.\n\nINTERVIEWER: What did you do the next morning?",
      word_count: 14,
      created_at: "2026-08-01T00:00:00.000Z",
      kind: "brainstorm",
      source_name: "brainstorm-2026-08-01",
    },
    {
      id: "t2",
      full_text: "I remember the night my father called me into the garage.",
      word_count: 11,
      created_at: "2026-08-02T00:00:00.000Z",
      kind: "interview",
      source_name: "garage.m4a",
    },
  ],
  edits: [
    {
      chapter_id: "c1",
      chapter_number: 1,
      chapter_title: "Origins",
      kind: "magic_edit",
      created_at: "2026-08-03T00:00:00.000Z",
      instruction: "Make this sound like I said it",
      before_text: "The journey of leadership is a testament.",
      after_text: "Leadership takes grit.",
    },
  ],
  versions: [
    {
      chapter_id: "c1",
      chapter_number: 1,
      chapter_title: "Origins",
      version: 1,
      word_count: 1200,
      created_at: "2026-08-03T00:00:00.000Z",
      source: "generation",
    },
    {
      chapter_id: "c1",
      chapter_number: 1,
      chapter_title: "Origins",
      version: 2,
      word_count: 1180,
      created_at: "2026-08-03T01:00:00.000Z",
      source: "manual_edit",
    },
  ],
};

describe("coverPageLine", () => {
  it("uses the load-bearing cover sentence", () => {
    expect(coverPageLine("Odessa Nights", new Date("2026-08-23T12:00:00.000Z"))).toBe(
      "Authorship evidence for Odessa Nights, generated 2026-08-23 — retain with your records."
    );
  });
});

describe("generateEvidencePDF", () => {
  it("produces a PDF buffer with no model involvement", async () => {
    const buf = await generateEvidencePDF(sample);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("handles empty sections", async () => {
    const buf = await generateEvidencePDF({
      title: "Empty",
      generatedAt: new Date("2026-08-23T00:00:00.000Z"),
      transcripts: [],
      edits: [],
      versions: [],
    });
    expect(buf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });
});

describe("evidence route ownership", () => {
  const route = readFileSync(
    join(__dirname, "..", "..", "app", "api", "export", "evidence", "route.ts"),
    "utf8"
  );
  const lib = readFileSync(join(__dirname, "..", "export", "evidence-bundle.ts"), "utf8");

  it("uses the same ownership path as manuscript export (user_id + project id)", () => {
    expect(lib).toMatch(/\.eq\("user_id", userId\)/);
    expect(lib).toMatch(/\.eq\("id", projectId\)/);
    expect(lib).toMatch(/\.eq\("project_id", projectId\)/);
    expect(route).toMatch(/loadEvidenceForProject\(project_id, user\.id\)/);
    expect(route).not.toMatch(/askClaude|recordInkUsage|voice-match/);
    expect(lib).not.toMatch(/askClaude|recordInkUsage/);
  });

  it("does not put banned verdict words in the bundle copy", () => {
    expect(`${lib}\n${coverPageLine("X", new Date())}\n${DISCLAIMER_LINE}`.toLowerCase()).not.toContain(
      "copyrightable"
    );
    expect(lib.toLowerCase()).not.toContain("legally protected");
  });
});
