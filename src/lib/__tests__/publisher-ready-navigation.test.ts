import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PIPELINE_V2, getActiveStepV2, isStepNavigableV2, publisherReadyUi, type PipelineProgressV2 } from "../pipeline-step";

afterEach(() => vi.unstubAllEnvs());
const project = (state: Partial<PipelineProgressV2>): PipelineProgressV2 => ({ audio_uploads: [], transcripts: [], key_points: [], chapters: [], ...state });

describe("Publisher-Ready project navigation", () => {
  it.each(["", "false", "true"])("requires the exact public rollout flag (%s)", (flag) => {
    vi.stubEnv("NEXT_PUBLIC_PUBLISHER_READY", flag);
    expect(publisherReadyUi()).toBe(flag === "true");
  });
  it("has existing routes for First Draft, Editor Review, Interview and Final Draft", () => {
    const stages = PIPELINE_V2.filter(step => ["generate", "review", "interview", "editor"].includes(step.key));
    expect(stages.map(step => step.label)).toEqual(["First Draft", "Editor Review", "Interview", "Final Draft"]);
    for (const step of stages) expect(fs.existsSync(path.join(process.cwd(), "src/app/(main)/project/[projectId]", step.path, "page.tsx"))).toBe(true);
  });
  it("makes each author stage reachable from real project evidence", () => {
    expect(getActiveStepV2(project({ chapters: [{ status: "outlined" }] }))).toBe(4);
    expect(getActiveStepV2(project({ chapters: [{ status: "generated" }, { status: "edited" }] }))).toBe(7);
    expect(getActiveStepV2(project({ chapters: [{ status: "generated" }] }))).toBe(5);
    expect(getActiveStepV2(project({ pr_status: "interviewing" }))).toBe(6);
    for (const status of ["revising", "checking", "done"]) expect(getActiveStepV2(project({ pr_status: status }))).toBe(7);
  });
  it("lets an author with a draft skip optional review and interview", () => {
    expect(isStepNavigableV2(7, 4, true)).toBe(true);
    expect(isStepNavigableV2(8, 4, true)).toBe(true);
    expect(isStepNavigableV2(7, 4, false)).toBe(false);
  });
});
