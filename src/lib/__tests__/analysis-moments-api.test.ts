import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { selectAnalysisMoments } from "../analysis-moments";
import type { Transcript } from "@/types";

const state = vi.hoisted(() => ({ owner: true, saveError: false, transcripts: [] as unknown[], upsert: vi.fn(), filters: [] as [string, string, unknown][] }));
vi.mock("@/lib/auth", () => ({ requireAuth: async () => ({ user: { id: "author1" }, error: null }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/supabase", () => ({ createServerClient: () => ({
  from: (table: string) => {
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); return chain; },
      single: async () => ({ data: state.owner ? { id: "p1" } : null }),
      order: async () => ({ data: state.transcripts, error: null }),
      upsert: async (row: unknown, opts: unknown) => { state.upsert(row, opts); return { error: state.saveError ? { message: "database unavailable" } : null }; },
    };
    return chain;
  },
}) }));

import { POST } from "@/app/api/analysis-moments/route";
const text = "I remember the first time I realized that listening was more important than always knowing the answer because it changed how I led our team.";
const tx = { id: "tx", full_text: text, segments: [], speaker_count: 1, word_count: 27 } as unknown as Transcript;
const card = selectAnalysisMoments([tx])[0];
function request(overrides = {}) {
  return new NextRequest("https://example.test/api/analysis-moments", { method: "POST", body: JSON.stringify({ project_id: "p1", card_id: card.id, importance: "essential", context: "I apologized the next day.", clarification_answer: "", ...overrides }) });
}
beforeEach(() => { state.owner = true; state.saveError = false; state.transcripts = [tx]; state.upsert.mockClear(); state.filters = []; });

describe("Analysis moments save authorization", () => {
  it("checks project ownership and saves canonical excerpts, never client-supplied quotes or user IDs", async () => {
    const response = await POST(request({ excerpt: "FAKE QUOTE", user_id: "other-user" }));
    expect(response.status).toBe(200);
    expect(state.filters).toContainEqual(["projects", "user_id", "author1"]);
    expect(state.upsert.mock.calls[0][0]).toMatchObject({ excerpt: text, user_id: "author1", transcript_id: "tx" });
  });
  it("does not write choices into another person's project", async () => {
    state.owner = false;
    expect((await POST(request())).status).toBe(404);
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("rejects a stale or fabricated card", async () => {
    expect((await POST(request({ card_id: "made-up" }))).status).toBe(409);
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("rejects invalid choices and oversized context", async () => {
    expect((await POST(request({ importance: "publish" }))).status).toBe(400);
    expect((await POST(request({ context: "x".repeat(6001) }))).status).toBe(400);
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("reports database failure instead of claiming the choice saved", async () => {
    state.saveError = true;
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Couldn't save this choice. Please retry." });
  });
});
