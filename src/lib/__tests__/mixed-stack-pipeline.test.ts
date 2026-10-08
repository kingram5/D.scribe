import { describe, it, expect, vi } from "vitest";
import cases from "../../../tests/fixtures/mixed-stack/cases.json";
import {
  coreDraft,
  coreEdit,
  coreRevise,
  DEFAULT_MIX,
  type ChapterInput,
} from "../publisher-ready/core";
import { mixedExecutor, mixedFinal } from "../publisher-ready/mixed";
import { sourceLedger } from "../publisher-ready/source-ledger";
import { generateDOCX } from "../export/docx";
import { RUBRIC } from "../publisher-ready/rubric";
import {
  validateSchema,
  type Workload,
  type Schema,
  type RoutingSnapshot,
  type TextResult,
} from "../ai/contracts";
import type { Chapter, ChapterContent } from "@/types";

const snapshot = {
  version: "mixed-v1",
  auditPercent: 0,
  promptVersion: "source-fidelity-v1",
  maxOperationUsd: 2,
} as RoutingSnapshot;
const usage = {
  rawUsage: { fixture: true },
  usageStatus: "reported" as const,
  priceVersion: "fixture",
  vendorCostUsd: 0,
};
function input(source: string): ChapterInput {
  return {
    projectTitle: "Fixture",
    audience: "memoir" as ChapterInput["audience"],
    voiceProfile: null,
    styleMemoryBlock: "Keep the author's plain voice.",
    chapterNumber: 1,
    chapterTitle: "A memory",
    chapterSummary: "A source-grounded memory",
    keyPoints: [],
    previousChapters: [],
    excerpts: source,
    targetWords: 100,
  };
}
// These are contract fixtures, not simulated quality measurements or live model outputs.
describe("mixed stage contracts through the existing DOCX exporter", () => {
  it.each(cases)("preserves $category source ($id)", async (fixture) => {
    const ledger = sourceLedger([
      { id: fixture.id, full_text: fixture.source },
    ]);
    const invoked: Workload[] = [];
    const send = vi.fn(
      async (
        _key: string,
        workload: Workload,
        _system: string,
        _user: string,
        _max: number,
        schema?: Schema,
      ): Promise<TextResult> => {
        invoked.push(workload);
        let data: unknown;
        if (workload === "beats")
          data = {
            beats: [
              {
                id: "b1",
                what_happens: "Tell the supplied memory",
                source_quote: fixture.source,
              },
            ],
          };
        else if (workload === "draft")
          return { text: fixture.source, usage, model: "claude-sonnet-5-5" };
        else if (workload === "editor")
          data = {
            author_questions: [],
            craft_notes: [],
            scores: Object.fromEntries(RUBRIC.map((r) => [r.key, 4])),
            summary: "Fixture report",
            issues: [],
          };
        else if (workload === "revision") data = { edits: [], change_log: [] };
        else data = { findings: [] };
        if (schema) validateSchema(data, schema);
        return { text: JSON.stringify(data), usage, model: workload };
      },
    );
    const draftCall = mixedExecutor({
      snapshot,
      ledger,
      input: input(fixture.source),
      runId: "run",
      chapterId: "ch",
      send,
    });
    const draft = await coreDraft(input(fixture.source), DEFAULT_MIX, {
      call: draftCall,
    });
    expect(draft.text).toBe(fixture.source);
    await coreEdit(
      input(fixture.source),
      draft.text,
      draft.beats,
      {},
      DEFAULT_MIX,
      draftCall,
    );
    const call = mixedExecutor({
      snapshot,
      ledger,
      input: input(fixture.source),
      manuscript: draft.text,
      runId: "run",
      chapterId: "ch",
      send,
    });
    const revision = await coreRevise(
      input(fixture.source),
      draft.text,
      [],
      [],
      DEFAULT_MIX,
      { call },
    );
    const final = await mixedFinal(
      revision.text,
      { "Earlier chapter": "A neighboring chapter's context" },
      ledger,
      send,
    );
    expect(final.text ?? revision.text).toBe(fixture.source);
    expect(invoked).toEqual([
      "beats",
      "draft",
      "editor",
      "revision",
      "final_check",
    ]);
    const doc = await generateDOCX({
      title: "Fixture book",
      chapters: [
        {
          id: "ch",
          title: "A memory",
          chapter_number: 1,
          content: { content: revision.text } as ChapterContent,
        } as Chapter & { content: ChapterContent },
      ],
    });
    expect(doc.subarray(0, 2).toString()).toBe("PK");
    expect(doc.length).toBeGreaterThan(1000);
  });
  it("routes final prose repairs to Sonnet's revision route, never Luna", async () => {
    const ledger = sourceLedger([{ id: "s", full_text: "A real source." }]);
    const send = vi.fn(async (_key: string, workload: Workload) => ({
      text: JSON.stringify(
        workload === "final_check"
          ? { findings: [{ location: "sentence", problem: "typo" }] }
          : {
              edits: [
                {
                  find: "The bus wass late.",
                  replace: "The bus was late.",
                  reason: "typo",
                },
              ],
            },
      ),
      model: workload,
      usage,
    }));
    const result = await mixedFinal("The bus wass late.", {}, ledger, send);
    expect(result.text).toBe("The bus was late.");
    expect(send.mock.calls.map((c) => c[1])).toEqual([
      "final_check",
      "revision",
    ]);
  });
  it("rejects a final repair that changes a quotation", async () => {
    const ledger = sourceLedger([{ id: "s", full_text: 'She said "yes".' }]);
    const send = vi.fn(async (_key: string, workload: Workload) => ({
      text: JSON.stringify(
        workload === "final_check"
          ? { findings: [{ location: "sentence", problem: "tone" }] }
          : { edits: [{ find: 'She said "yes".', replace: 'She said "no".' }] },
      ),
      model: workload,
      usage,
    }));
    await expect(
      mixedFinal('She said "yes".', {}, ledger, send),
    ).rejects.toThrow(/quoted source/);
  });
});
