import { describe, it, expect } from "vitest";
import { PIPELINE_V2, getActiveStepV2, isStepNavigableV2, type PipelineProgressV2 } from "../pipeline-step";

const p = (x: Partial<PipelineProgressV2> = {}): PipelineProgressV2 => ({ audio_uploads: [], transcripts: [], key_points: [], chapters: [], ...x });

describe("9-step Publisher-Ready pipeline", () => {
  it("has nine steps in Kyle's order", () => {
    expect(PIPELINE_V2.map((s) => s.key)).toEqual(["upload", "transcribe", "structure", "analyze", "generate", "interview", "revise", "editor", "export"]);
  });

  it("walks forward through the new steps", () => {
    expect(getActiveStepV2(p({ chapters: [{ status: "outlined" }] }))).toBe(4);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }] }))).toBe(5);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }], pr_status: "interviewing" }))).toBe(5);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }], pr_status: "revising" }))).toBe(6);
    expect(getActiveStepV2(p({ chapters: [{ status: "generated" }], pr_status: "done" }))).toBe(7);
    expect(getActiveStepV2(p({ chapters: [{ status: "edited" }], pr_status: "interviewing" }))).toBe(7);
  });

  it("lets a quick-draft author skip the optional steps to the Editor", () => {
    expect(isStepNavigableV2(7, 5, true)).toBe(true);
    expect(isStepNavigableV2(8, 5, true)).toBe(true);
    expect(isStepNavigableV2(7, 4, false)).toBe(false);
    expect(isStepNavigableV2(6, 5, true)).toBe(true);
  });
});
