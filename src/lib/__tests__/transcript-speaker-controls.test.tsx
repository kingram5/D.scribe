import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  slot: 0,
  transcript: {
    id: "synthetic-transcript", full_text: "I remember the farm. We stayed that winter.",
    word_count: 10, speaker_map: {}, speakers_confirmed_at: null,
    segments: [
      { speaker: "Speaker 0", text: "I remember the farm.", start: 0, end: 4 },
      { speaker: "Speaker 1", text: "We stayed that winter.", start: 4, end: 8 },
    ],
  },
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useState(initial: unknown) {
    const slot = fixture.slot++;
    // Seed the loaded page; close Insights to verify speaker controls remain independent.
    return actual.useState(slot === 0 ? [fixture.transcript] : slot === 2 || slot === 11 ? false : initial);
  } };
});
vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "synthetic" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/PageShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
import TranscriptPage from "@/app/(main)/project/[projectId]/transcript/page";

beforeEach(() => { fixture.slot = 0; vi.stubEnv("NEXT_PUBLIC_SPEAKER_LABELS", "false"); });
afterEach(() => vi.unstubAllEnvs());
describe("Transcript speaker controls", () => {
  it("renders speaker identification and paragraph reassignment while the analysis flag is off and Insights is closed", () => {
    const html = renderToStaticMarkup(<TranscriptPage />);
    expect(html).toContain('class="ds-tx-speakers"');
    expect(html).toContain("Who is speaking?");
    expect(html).toContain("Save speakers");
    expect(html).toContain("Same person as another speaker (Speaker 0)");
    expect(html).toContain('aria-label="Who said this paragraph"');
    expect(html).toMatch(/<details open="" class="ds-tx-speakers"/);
    expect(html).toMatch(/<details class="ds-tx-insights"/);
  });
});
