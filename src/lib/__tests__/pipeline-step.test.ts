/**
 * Unit tests for the dashboard pipeline placement.
 *
 * The inline version this replaced could never return 3 ("analyze") — having
 * key points jumped straight to 4. Harmless while the timeline was decoration;
 * a dead end once the timeline became navigation, because Analysis is the page
 * that creates the key points that would have unlocked it.
 */

import { describe, it, expect } from "vitest";
import { PIPELINE, getActiveStep, isStepNavigable, type PipelineProgress } from "../pipeline-step";

function project(p: Partial<PipelineProgress> = {}): PipelineProgress {
  return { audio_uploads: [], transcripts: [], key_points: [], chapters: [], ...p };
}

describe("PIPELINE shape", () => {
  it("has seven steps, each with a route", () => {
    expect(PIPELINE).toHaveLength(7);
    for (const step of PIPELINE) {
      expect(step.path).toBeTruthy();
      expect(step.label).toBeTruthy();
    }
  });

  it("routes match the real page directories", () => {
    expect(PIPELINE.map((s) => s.path)).toEqual([
      "upload", "transcript", "structure", "analysis", "generate", "editor", "export",
    ]);
  });
});

describe("getActiveStep: walking the pipeline forward", () => {
  it("empty project sits on Upload", () => {
    expect(getActiveStep(project())).toBe(0);
  });

  it("audio uploaded moves to Transcription", () => {
    expect(getActiveStep(project({ audio_uploads: [{}] }))).toBe(1);
  });

  it("transcript exists moves to Structure", () => {
    expect(getActiveStep(project({ audio_uploads: [{}], transcripts: [{}] }))).toBe(2);
  });

  // The regression this file exists for.
  it("key points but no chapters sits on Analysis, not Generate", () => {
    const p = project({ audio_uploads: [{}], transcripts: [{}], key_points: [{}, {}] });
    expect(getActiveStep(p)).toBe(3);
    expect(PIPELINE[getActiveStep(p)].key).toBe("analyze");
  });

  it("chapters outlined moves to Generate", () => {
    const p = project({ transcripts: [{}], key_points: [{}], chapters: [{ status: "outlined" }] });
    expect(getActiveStep(p)).toBe(4);
  });

  it("any generated chapter moves to Editor", () => {
    const p = project({ chapters: [{ status: "outlined" }, { status: "generated" }] });
    expect(getActiveStep(p)).toBe(5);
  });

  it("an edited chapter moves to Export", () => {
    const p = project({ chapters: [{ status: "generated" }, { status: "edited" }] });
    expect(getActiveStep(p)).toBe(6);
  });

  it("every step index is reachable by some real project state", () => {
    const states: PipelineProgress[] = [
      project(),
      project({ audio_uploads: [{}] }),
      project({ transcripts: [{}] }),
      project({ key_points: [{}] }),
      project({ chapters: [{ status: "outlined" }] }),
      project({ chapters: [{ status: "generated" }] }),
      project({ chapters: [{ status: "edited" }] }),
    ];
    expect(states.map(getActiveStep)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("more advanced evidence wins over less", () => {
    // A project with everything should still read as Export, not Upload.
    const p = project({
      audio_uploads: [{}], transcripts: [{}], key_points: [{}],
      chapters: [{ status: "edited" }],
    });
    expect(getActiveStep(p)).toBe(6);
  });
});

describe("isStepNavigable: completed, current, and exactly one ahead", () => {
  it("allows every completed step", () => {
    expect(isStepNavigable(0, 3)).toBe(true);
    expect(isStepNavigable(2, 3)).toBe(true);
  });

  it("allows the current step", () => {
    expect(isStepNavigable(3, 3)).toBe(true);
  });

  it("allows exactly one step ahead", () => {
    expect(isStepNavigable(4, 3)).toBe(true);
  });

  it("locks anything two or more steps ahead", () => {
    expect(isStepNavigable(5, 3)).toBe(false);
    expect(isStepNavigable(6, 3)).toBe(false);
  });

  it("a freshly transcribed project can reach Analysis", () => {
    // The case that was a dead end: active = Structure (2), Analysis = 3.
    const active = getActiveStep(project({ audio_uploads: [{}], transcripts: [{}] }));
    expect(active).toBe(2);
    expect(isStepNavigable(3, active)).toBe(true);
    // ...but still cannot skip ahead to Generate.
    expect(isStepNavigable(4, active)).toBe(false);
  });

  it("a brand new project cannot jump to Export", () => {
    expect(isStepNavigable(6, 0)).toBe(false);
  });
});
