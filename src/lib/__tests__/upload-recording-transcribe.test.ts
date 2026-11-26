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
    const body = src.slice(start, start + 700);
    expect(body).toMatch(/engine\.recordings\.length\s*>\s*0/);
    expect(body).toMatch(/engine\.uploadAll\(\)/);
  });

  it("uploadAll sends recordings as well as picked files", () => {
    expect(engine()).toMatch(/for \(const file of \[\.\.\.recordings, \.\.\.files\]\)/);
  });

  it("the Transcribe button is enabled by a recording alone", () => {
    expect(engine()).toMatch(/canInitialize\s*=\s*\n?\s*files\.length > 0 \|\| recordings\.length > 0/);
  });
});
