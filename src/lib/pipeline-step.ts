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
