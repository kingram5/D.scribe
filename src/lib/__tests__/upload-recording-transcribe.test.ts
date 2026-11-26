// Transcribe must send an in-app recording even when no file was picked.
// Regression: recordings moved to their own list on 8/13 (1bf889a) but the
// page's Transcribe handler still only checked picked files, so a
// recording-only session could not be transcribed (Janine, 2026-11-25).
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
const page = () => read("app/(main)/project/[projectId]/upload/page.tsx");
const engine = () => read("app/(main)/project/[projectId]/upload/useUploadEngine.ts");

describe("upload: recording-only sessions can be transcribed", () => {
  it("the Transcribe handler uploads when only recordings exist", () => {
    const src = page();
    const start = src.indexOf("function handleInitialize");
    const body = src.slice(start, start + 1100);
    expect(body).toMatch(/engine\.recordings\.length\s*>\s*0/);
    expect(body).toMatch(/engine\.uploadAll\(/);
  });

  it("uploadAll sends recordings as well as picked files", () => {
    expect(engine()).toMatch(/for \(const file of \[\.\.\.recordings, (\.\.\.extra, )?\.\.\.files\]\)/);
  });

  it("the Transcribe button is enabled by a recording alone", () => {
    expect(engine()).toMatch(/canInitialize\s*=\s*\n?\s*files\.length > 0 \|\| recordings\.length > 0/);
  });
});

describe("upload: Transcribe closes a paused take (Kyle 2026-11-25)", () => {
  it("a paused take enables the Transcribe button", () => {
    expect(engine()).toMatch(/\(isPaused && seconds > 0\)/);
  });

  it("Transcribe finishes a paused take and sends it", () => {
    const src = page();
    const start = src.indexOf("function handleInitialize");
    const body = src.slice(start, start + 1100);
    expect(body).toMatch(/engine\.isPaused \? await engine\.finishRecording\(\) : null/);
    expect(body).toMatch(/engine\.uploadAll\(pausedTake \? \[pausedTake\] : \[\]\)/);
  });

  it("finishRecording waits for the recorder to hand back the file, with a timeout", () => {
    const src = engine();
    expect(src).toMatch(/const finishRecording = useCallback/);
    expect(src).toMatch(/stopResolverRef\.current = null;\s*\n\s*resolve\?\.\(finished\);/);
    expect(src).toMatch(/}, 5000\);/);
  });

  it("uploadAll includes a take finished in the same click", () => {
    expect(engine()).toMatch(/for \(const file of \[\.\.\.recordings, \.\.\.extra, \.\.\.files\]\)/);
  });

  it("pausing still only pauses (no save, no split)", () => {
    expect(engine()).toMatch(/mediaRecorderRef\.current\.pause\(\);/);
  });
});
