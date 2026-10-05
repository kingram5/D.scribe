import { describe, it, expect } from "vitest";
import { PIPELINE_V2, PIPELINE_V2_COUNTED, getActiveStepV2, isStepNavigableV2, type PipelineProgressV2 } from "../pipeline-step";

const p = (x: Partial<PipelineProgressV2> = {}): PipelineProgressV2 => ({ audio_uploads: [], transcripts: [], key_points: [], chapters: [], ...x });

describe("flow v2 pipeline (Kyle 9/28: 8 steps, Export = done)", () => {
  it("has Kyle's eight steps, then Export as the uncounted finish line", () => {
    expect(PIPELINE_V2.map((s) => s.key)).toEqual(["upload", "transcribe", "structure", "analyze", "generate", "review", "interview", "editor", "export"]);
    expect(PIPELINE_V2.map((s) => s.label).slice(4, 8)).toEqual(["First Draft", "Editor Review", "Interview", "Final Draft"]);
    expect(PIPELINE_V2_COUNTED).toBe(8);
    expect(PIPELINE_V2[8].done).toBe(true);
  });

  it("walks forward through the new steps", () => {
    expect(getActiveStepV2(p({ chapters: [{ status: "outlined" }] }))).toBe(4);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }, { status: "outlined" }] }))).toBe(4); // still drafting
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }, { status: "generated" }] }))).toBe(5);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }], pr_status: "editing" }))).toBe(5);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }], pr_status: "interviewing" }))).toBe(6);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }], pr_status: "revising" }))).toBe(7);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }], pr_status: "done" }))).toBe(7);
    expect(getActiveStepV2(p({ chapters: [{ status: "edited" }], pr_status: "interviewing" }))).toBe(7);
  });

  it("lets an author skip the optional review straight to the Final Draft", () => {
    expect(isStepNavigableV2(7, 5, true)).toBe(true);
    expect(isStepNavigableV2(8, 5, true)).toBe(true);
    expect(isStepNavigableV2(7, 4, false)).toBe(false);
    expect(isStepNavigableV2(6, 5, true)).toBe(true);
  });
});
