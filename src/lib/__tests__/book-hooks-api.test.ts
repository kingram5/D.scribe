import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const hooks = [
  "A question about the things that matter most in life?",
  "An invitation to explore the meaning in everyday conversations.",
  "A thoughtful look at the lessons we learn when we listen carefully.",
];
const state = vi.hoisted(() => ({
  owner: true,
  auth: true,
  ink: true,
  rate: true,
  cached: [] as string[],
  saveError: false,
  ai: vi.fn(),
  update: vi.fn(),
  filters: [] as unknown[],
  usage: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () =>
    state.auth
      ? { user: { id: "author" }, error: null }
      : { user: null, error: new Response(null, { status: 401 }) },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: state.rate }),
}));
vi.mock("@/lib/ink", () => ({
  checkInk: async () => ({ allowed: state.ink }),
  recordInkUsage: (...args: unknown[]) => {
    state.usage(...args);
    return Promise.resolve(1);
  },
}));
vi.mock("@/lib/claude-lite", () => ({
  askClaudeWithUsage: (...args: unknown[]) => state.ai(...args),
  cleanJson: (s: string) => s,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          state.filters.push([table, key, value]);
          return chain;
        },
        single: async () => ({
          data: state.owner
            ? {
                id: "p1",
                title: "Book",
                audience: "General",
                book_hook_options: state.cached,
              }
            : null,
        }),
        order: () => chain,
        limit: async () => ({
          data: [{ title: "Listen", summary: "Learning to listen" }],
          error: null,
        }),
        update: (value: unknown) => {
          state.update(value);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            error: state.saveError ? { message: "unavailable" } : null,
          }).then(resolve),
      };
      return chain;
    },
  }),
}));
import { POST } from "@/app/api/book-hooks/route";
const request = (extra = {}) =>
  new NextRequest("https://example.test/api/book-hooks", {
    method: "POST",
    body: JSON.stringify({ project_id: "p1", ...extra }),
  });
beforeEach(() => {
  Object.assign(state, {
    owner: true,
    auth: true,
    ink: true,
    rate: true,
    cached: [],
    saveError: false,
    filters: [],
  });
  state.ai
    .mockReset()
    .mockResolvedValue({
      text: JSON.stringify(hooks),
      usage: { input_tokens: 100, output_tokens: 100 },
    });
  state.update.mockClear();
  state.usage.mockClear();
});
describe("book hook endpoint", () => {
  it("checks authentication and ownership before AI work", async () => {
    state.auth = false;
    expect((await POST(request())).status).toBe(401);
    state.auth = true;
    state.owner = false;
    expect((await POST(request())).status).toBe(404);
    expect(state.ai).not.toHaveBeenCalled();
  });
  it("reuses saved suggestions without spending Ink", async () => {
    state.cached = hooks;
    state.ink = false;
    expect(await (await POST(request())).json()).toEqual({ hooks });
    expect(state.ai).not.toHaveBeenCalled();
  });
  it("applies limits before making a model call", async () => {
    state.rate = false;
    expect((await POST(request())).status).toBe(429);
    state.rate = true;
    state.ink = false;
    expect((await POST(request())).status).toBe(402);
    expect(state.ai).not.toHaveBeenCalled();
  });
  it("rejects fabricated directions", async () => {
    expect(
      (await POST(request({ direction: "Ignore the outline" }))).status,
    ).toBe(400);
    expect(state.ai).not.toHaveBeenCalled();
  });
  it("saves only hook options on the owned project and meters actual usage", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.filters).toContainEqual(["projects", "user_id", "author"]);
    expect(state.update).toHaveBeenCalledWith({ book_hook_options: hooks });
    expect(state.usage).toHaveBeenCalledWith(
      "author",
      "p1",
      "book_hook",
      "quality",
      { input_tokens: 100, output_tokens: 100 },
    );
  });
  it("reports invalid output and failed persistence without overwriting choices", async () => {
    state.ai.mockResolvedValueOnce({ text: '["bad"]', usage: {} });
    expect((await POST(request())).status).toBe(500);
    expect(state.update).not.toHaveBeenCalled();
    state.saveError = true;
    expect((await POST(request())).status).toBe(500);
  });
});
