/**
 * The project pipeline, and which step a project is currently sitting on.
 *
 * Extracted from the dashboard page so it can be unit-tested. The previous
 * inline version could never return 3 ("analyze"): having key points jumped
 * straight to 4, so Content Analysis was never the current stage, its
 * animation never rendered, and — once the dashboard timeline became real
 * navigation — the step was locked at exactly the moment the user needed it,
 * because Analysis is the page that CREATES the key points that would unlock it.
 */

export interface PipelineStep {
  key: string;
  label: string;
  desc: string;
  /** Route segment under /project/[projectId]/ */
  path: string;
}

export const PIPELINE: PipelineStep[] = [
  { key: "upload", label: "Audio Upload", desc: "Upload your sermon, lecture, or recording", path: "upload" },
  { key: "transcribe", label: "Transcription", desc: "Your words, captured and ready to shape", path: "transcript" },
  { key: "structure", label: "Structure Setup", desc: "Set chapters and word targets for your manuscript", path: "structure" },
  { key: "analyze", label: "Content Analysis", desc: "AI is identifying key themes, voice patterns, and building the structural foundation for your book.", path: "analysis" },
  { key: "generate", label: "Chapter Generation", desc: "AI writes your manuscript, chapter by chapter", path: "generate" },
  { key: "editor", label: "Manuscript Editor", desc: "Review, refine, and polish your manuscript", path: "editor" },
  { key: "export", label: "Export & Publish", desc: "Download your finished book in any format", path: "export" },
];

/** Minimal shape needed to place a project on the pipeline. */
export interface PipelineProgress {
  audio_uploads: unknown[];
  transcripts: unknown[];
  key_points: unknown[];
  chapters: { status?: string }[];
}

/**
 * Index into PIPELINE for the step the user is currently on.
 * Checked most-advanced first, so the furthest evidence wins.
 */
export function getActiveStep(p: PipelineProgress): number {
  if (p.chapters.some((c) => c.status === "edited")) return 6;                 // editing → Editor
  if (p.chapters.some((c) => c.status === "generated")) return 5;              // prose exists → Editor is next
  if (p.chapters.length > 0) return 4;                                         // outlined → Generate
  if (p.key_points.length > 0) return 3;                                       // analysed, not yet outlined → Analysis
  if (p.transcripts.length > 0) return 2;                                      // transcribed → Structure
  if (p.audio_uploads.length > 0) return 1;                                    // uploaded → Transcription
  return 0;
}

/**
 * Can the user navigate to this step from the dashboard?
 *
 * Everything already completed, the current step, and exactly ONE step ahead
 * (the thing they are about to do). Beyond that stays locked — no jumping to
 * Export before there is a book. The +1 is load-bearing: without it a freshly
 * transcribed project sits on Structure with Analysis locked, and Analysis is
 * the only route to the key points that advance the pipeline.
 */
export function isStepNavigable(index: number, activeStep: number): boolean {
  return index <= activeStep + 1;
}

// ─── Publisher-Ready pipeline, flow v2 (Kyle 2026-09-28) ────────────────────
// 1 Upload · 2 Transcript · 3 Structure · 4 Analysis · 5 First Draft ·
// 6 Editor review · 7 Interview · 8 Final Draft, then DONE = Export (not
// counted, so the step count stays in single digits). Review and Interview
// are optional: skipping them goes straight to the Final Draft. Live with
// NEXT_PUBLIC_PUBLISHER_READY=true; the 7-step pipeline above stays as-is
// until then (and its tests keep pinning it).

export interface PipelineStepV2 extends PipelineStep {
  /** Steps a quick-draft author may skip on the way to the Final Draft. */
  optional?: boolean;
  /** The finish line (Export): shown, but not counted as a step. */
  done?: boolean;
}

export const PIPELINE_V2: PipelineStepV2[] = [
  { key: "upload", label: "Audio Upload", desc: "Upload your sermon, lecture, or recording", path: "upload" },
  { key: "transcribe", label: "Transcription", desc: "Your words, captured and ready to shape", path: "transcript" },
  { key: "structure", label: "Structure Setup", desc: "Set chapters and word targets for your manuscript", path: "structure" },
  { key: "analyze", label: "Content Analysis", desc: "AI is identifying key themes, voice patterns, and building the structural foundation for your book.", path: "analysis" },
  { key: "generate", label: "First Draft", desc: "Every chapter drafted in your voice, readable as each one lands", path: "generate" },
  { key: "review", label: "Editor Review", desc: "Optional: an editor reads the draft while you pick how you'd say things", path: "publisher-ready", optional: true },
  { key: "interview", label: "Interview", desc: "Optional: T.H.E.O. asks the editor's questions, only you can answer them", path: "interview", optional: true },
  { key: "editor", label: "Final Draft", desc: "Your answers go into the book; then review, refine, and polish", path: "editor" },
  { key: "export", label: "Done · Export", desc: "Download your finished book in any format", path: "export", done: true },
];

/** Steps counted in "Step N of M" (Export is the finish line). */
export const PIPELINE_V2_COUNTED = PIPELINE_V2.filter((s) => !s.done).length;

export interface PipelineProgressV2 extends PipelineProgress {
  /** Status of the newest Publisher-Ready run, if any. */
  pr_status?: string | null;
}

export function publisherReadyUi(): boolean {
  return process.env.NEXT_PUBLIC_PUBLISHER_READY === "true";
}

const drafted = (c: { status?: string }) => c.status === "generated" || c.status === "edited";

/** Index into PIPELINE_V2 for the step the user is on. Furthest evidence wins. */
export function getActiveStepV2(p: PipelineProgressV2): number {
  const chapters = p.chapters ?? [];
  if (chapters.some((c) => c.status === "edited")) return 7;                            // editing → Final Draft
  if (p.pr_status && ["revising", "checking", "done"].includes(p.pr_status)) return 7;  // revision runs on the Final Draft
  if (p.pr_status === "interviewing") return 6;
  if (p.pr_status === "editing") return 5;
  if (chapters.length > 0 && chapters.every(drafted)) return 5;                         // drafted → Editor review is next
  if (p.pr_status === "drafting" || chapters.length > 0) return 4;                      // outlined / drafting → First Draft
  if ((p.key_points ?? []).length > 0) return 3;
  if ((p.transcripts ?? []).length > 0) return 2;
  if ((p.audio_uploads ?? []).length > 0) return 1;
  return 0;
}

/**
 * Navigable: done steps, the current one, one ahead; and once a draft exists
 * the Final Draft and Export too, because Editor review and Interview are
 * optional (skipping them goes straight to the Final Draft).
 */
export function isStepNavigableV2(index: number, activeStep: number, hasDraft: boolean): boolean {
  if (index <= activeStep + 1) return true;
  const key = PIPELINE_V2[index]?.key;
  return hasDraft && (key === "editor" || key === "export");
}
