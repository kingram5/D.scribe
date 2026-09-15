import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const userA = {
  id: "user-a",
  email: "a@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { full_name: "Kyle Parks" },
};

const requireAuth = vi.fn();
const checkInk = vi.fn();
const checkRateLimit = vi.fn();
const recordFlatInkUsage = vi.fn();
const ttsGateLocked = vi.fn();
const liveCreate = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireAuth: () => requireAuth(),
}));
vi.mock("@/lib/ink", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ink")>("@/lib/ink");
  return {
    ...actual,
    checkInk: (...args: unknown[]) => checkInk(...args),
    recordFlatInkUsage: (...args: unknown[]) => recordFlatInkUsage(...args),
  };
});
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@/lib/topups", async () => {
  const actual = await vi.importActual<typeof import("@/lib/topups")>("@/lib/topups");
  return {
    ...actual,
    ttsGateLocked: (...args: unknown[]) => ttsGateLocked(...args),
  };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("openai", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class OpenAI {
    live = { create: liveCreate };
    constructor() {}
  }
  return { default: OpenAI, APIError };
});

const from = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({ from }),
}));

function chain(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const name of ["select", "eq", "in", "gte", "limit", "order"]) {
    api[name] = vi.fn(self);
  }
  api.single = vi.fn(async () => result);
  api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return api;
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("brainstorm live session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
    requireAuth.mockResolvedValue({ user: userA, error: null });
    checkInk.mockResolvedValue({ allowed: true });
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    ttsGateLocked.mockReturnValue(false);
    liveCreate.mockResolvedValue({
      session: { id: "live_abc" },
      transport: { type: "webrtc", sdp: "v=0" },
    });
    from.mockImplementation((table: string) => {
      if (table === "projects") {
        return chain({
          data: { id: "proj-a", title: "The Ledger", audience: "Money & Finance", scripture_translation: null },
          error: null,
        });
      }
      if (table === "ink_balances") {
        return chain({ data: { tier: "pro", topup_tts_chars: 0 }, error: null });
      }
      if (table === "research_items") {
        return chain({ data: [], error: null });
      }
      return chain({ data: null, error: null });
    });
  });

  it("rejects an unauthenticated caller", async () => {
    requireAuth.mockResolvedValue({
      user: null,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/session", { sdp: "v=0", project_id: "proj-a" }));
    expect(res.status).toBe(401);
    expect(liveCreate).not.toHaveBeenCalled();
  });

  it("requires an SDP offer and a project id", async () => {
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const missingSdp = await POST(jsonRequest("http://local/api/brainstorm/live/session", { project_id: "proj-a" }));
    expect(missingSdp.status).toBe(400);
    const missingProject = await POST(jsonRequest("http://local/api/brainstorm/live/session", { sdp: "v=0" }));
    expect(missingProject.status).toBe(400);
    expect(liveCreate).not.toHaveBeenCalled();
  });

  it("does not mint a session for someone else's project", async () => {
    from.mockImplementation((table: string) => {
      if (table === "projects") return chain({ data: null, error: null });
      return chain({ data: null, error: null });
    });
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/session", { sdp: "v=0", project_id: "proj-b" }));
    expect(res.status).toBe(404);
    expect(liveCreate).not.toHaveBeenCalled();
  });

  it("keeps the Pro voice gate", async () => {
    ttsGateLocked.mockReturnValue(true);
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/session", { sdp: "v=0", project_id: "proj-a" }));
    expect(res.status).toBe(403);
    expect(liveCreate).not.toHaveBeenCalled();
  });

  it("preflights Live Ink before talking to OpenAI", async () => {
    checkInk.mockResolvedValue({ allowed: false, reason: "Need more Ink" });
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/session", { sdp: "v=0", project_id: "proj-a" }));
    expect(res.status).toBe(402);
    expect(checkInk).toHaveBeenCalledWith("user-a", "brainstorm_live");
    expect(liveCreate).not.toHaveBeenCalled();
  });

  it("returns 503 with live_not_configured when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/session", { sdp: "v=0", project_id: "proj-a" }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "live_not_configured" });
    expect(liveCreate).not.toHaveBeenCalled();
  });

  it("maps OpenAI API failures to 502 instead of forwarding vendor 503", async () => {
    const { APIError } = await import("openai");
    liveCreate.mockRejectedValue(new APIError(503, "overloaded"));
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/session", { sdp: "v=0", project_id: "proj-a" }));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "live_openai_failed", openai_status: 503 });
  });

  it("creates a gpt-live-1 WebRTC session and returns the SDP answer", async () => {
    const { POST } = await import("@/app/api/brainstorm/live/session/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/session", {
      sdp: "v=0 offer",
      project_id: "proj-a",
      messages: [{ role: "user", content: "A book about rest" }],
    }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      session: { id: "live_abc" },
      transport: { type: "webrtc", sdp: "v=0" },
      opening: false,
    });
    expect(liveCreate).toHaveBeenCalledTimes(1);
    const body = liveCreate.mock.calls[0]![0];
    expect(body.session.model).toBe("gpt-live-1");
    expect(body.transport).toEqual({ type: "webrtc", sdp: "v=0 offer" });
    expect(body.session.instructions).toMatch(/T\.H\.E\.O/);
    expect(body.session.audio.output.voice).toBe("meridian");
  });
});

describe("brainstorm live usage route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: userA, error: null });
    checkRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    recordFlatInkUsage.mockResolvedValue(3.5);
    from.mockImplementation((table: string) => {
      if (table === "projects") return chain({ data: { id: "proj-a" }, error: null });
      return chain({ data: null, error: null });
    });
  });

  it("settles duration against gpt-live-1 as flat Ink", async () => {
    const { POST } = await import("@/app/api/brainstorm/live/usage/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/usage", {
      project_id: "proj-a",
      session_id: "live_abc",
      usage: { seconds: 30 },
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, ink: 3.5, seconds: 30 });
    expect(recordFlatInkUsage).toHaveBeenCalledWith("user-a", "proj-a", "brainstorm_live", "gpt-live-1", 3.5);
  });

  it("rejects a session id that is not a Live id", async () => {
    const { POST } = await import("@/app/api/brainstorm/live/usage/route");
    const res = await POST(jsonRequest("http://local/api/brainstorm/live/usage", {
      project_id: "proj-a",
      session_id: "sess-1",
      usage: { seconds: 30 },
    }));
    expect(res.status).toBe(400);
    expect(recordFlatInkUsage).not.toHaveBeenCalled();
  });
});
