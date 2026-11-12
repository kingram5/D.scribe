import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildAssistantMaterial } from "@/lib/chatgpt-app/material";

/**
 * The voice routes against material an AI assistant pushed in (add_to_project).
 * The analysis page sends the NEWEST transcript to voice-profile, so right
 * after a push the next Analyze click lands here with assistant-only text.
 */

const m = buildAssistantMaterial({
  projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Memories",
  text: Array.from({ length: 60 }, (_, i) => `Memory ${i}: the assistant recalls a tidy, well-formed sentence about the author's early life.`).join("\n\n"),
  sourceApp: "chatgpt",
  kind: "memory",
});
const assistantTx = { id: "tx-ai", full_text: m.fullText, segments: m.segments, speaker_map: m.speakerMap };

const mocks = vi.hoisted(() => ({
  transcripts: [] as Record<string, unknown>[],
  existingProfile: { tone: "plain" } as Record<string, unknown> | null,
  reserveInk: vi.fn(),
  model: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth", () => ({ requireAuth: async () => ({ user: { id: "user" }, error: null }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterMs: 0 }) }));
vi.mock("@/lib/ink", () => ({ reserveInk: mocks.reserveInk, releaseInkReservation: vi.fn(), settleInkReservation: vi.fn() }));
vi.mock("@/lib/claude-lite", () => ({ askClaudeWithUsage: mocks.model, cleanJsonLite: (t: string) => t }));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        update: (patch: Record<string, unknown>) => (mocks.updates.push(patch), chain),
        single: async () => {
          if (table === "projects") return { data: { id: "p", voice_profile: mocks.existingProfile }, error: null };
          if (table === "transcripts") return { data: mocks.transcripts[0] ?? null, error: null };
          if (table === "chapters") return { data: { id: "c", project_id: "p" }, error: null };
          if (table === "chapter_contents") return { data: { id: "cc", content: "I wrote this chapter. It is short.", version: 1, generation_params: {} }, error: null };
          return { data: null, error: null };
        },
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: table === "transcripts" ? mocks.transcripts : [], error: null }).then(res),
      };
      return chain;
    },
  }),
}));

import { POST as voiceProfile } from "../../app/api/analyze/voice-profile/route";
import { POST as voiceMatch } from "../../app/api/voice-match/route";

const post = (url: string, body: unknown) =>
  new NextRequest(`https://local.test${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  mocks.transcripts = [assistantTx];
  mocks.existingProfile = { tone: "plain" };
  mocks.updates = [];
  mocks.reserveInk.mockReset().mockResolvedValue({ allowed: true, reservationId: "r" });
  mocks.model.mockReset().mockResolvedValue({ text: "{}", usage: { input_tokens: 1, output_tokens: 1 } });
});

describe("voice routes skip AI-assistant material", () => {
  it("voice-profile keeps the existing profile, reserves no Ink and calls no model", async () => {
    const res = await voiceProfile(post("/api/analyze/voice-profile", { project_id: "p", transcript_id: "tx-ai" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ voice_profile: { tone: "plain" }, skipped: "no_author_voice" });
    expect(mocks.reserveInk).not.toHaveBeenCalled();
    expect(mocks.model).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([]);
  });

  it("voice-profile still learns from the author's own recordings", async () => {
    mocks.transcripts = [{ id: "tx-own", full_text: "This is me, talking the way I talk.", segments: [], speaker_map: null }];
    await voiceProfile(post("/api/analyze/voice-profile", { project_id: "p", transcript_id: "tx-own" }));
    expect(mocks.reserveInk).toHaveBeenCalledTimes(1);
    expect(mocks.model).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.model.mock.calls[0][1])).toContain("me, talking");
  });

  it("voice-match refuses to score against a baseline made only of assistant text", async () => {
    const res = await voiceMatch(post("/api/voice-match", { chapter_id: "c" }));
    expect(res.status).toBe(409);
    expect(mocks.updates).toEqual([]);
  });
});
