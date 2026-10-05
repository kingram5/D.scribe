import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  sources: [] as Record<string, unknown>[], candidates: [] as Record<string, unknown>[], existing: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[], sourceError: false, owner: "user",
  model: vi.fn(), bill: vi.fn(), filters: [] as [string, string, unknown][],
}));
vi.mock("@/lib/auth", () => ({ requireAuth: async () => ({ user: { id: "user" } }) }));
vi.mock("@/lib/ink", () => ({ checkInk: async () => ({ allowed: true }), recordInkUsage: mocks.bill }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/claude-lite", () => ({ askClaudeWithUsage: mocks.model, cleanJson: (text: string) => text }));
vi.mock("@/lib/supabase", () => ({ createServerClient: () => ({
  from(table: string) {
    let operation = "select";
    const result = () => {
      if (table === "research_items") return { data: mocks.sources, error: mocks.sourceError ? { message: "offline" } : null };
      if (table === "projects") return { data: { id: "project" }, error: null };
      if (table === "chapters") return { data: [{ id: "chapter" }], error: null };
      if (table === "enrichments") return { data: operation === "insert" ? mocks.inserts : mocks.existing, error: null };
      return { data: [], error: null };
    };
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => { mocks.filters.push([table, column, value]); return chain; },
      in: () => chain,
      delete: () => { operation = "delete"; return chain; },
      insert: (items: Record<string, unknown>[]) => { operation = "insert"; mocks.inserts.push(...items); return chain; },
      update: (patch: Record<string, unknown>) => { operation = "update"; mocks.updates.push(patch); return chain; },
      single: async () => {
        if (table === "chapters") return { data: { id: "chapter", title: "Test", summary: "Test", key_point_ids: [], projects: { id: "project", user_id: mocks.owner, audience: "General" } } };
        if (table === "enrichments") return { data: { ...mocks.existing[0], chapters: { project_id: "project", projects: { user_id: mocks.owner } } }, error: null };
        return result();
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
}) }));
import { GET, POST, PATCH } from "../../app/api/enrich/route";
const safe = { quote_text: "A carefully sourced observation for this chapter.", source_author: "A named researcher", source_title: "A research article", source_type: "article", relevance_note: "Relevant", id: "safe", chapter_id: "chapter", included: true };
const unsafe = { ...safe, id: "unsafe", source_author: "Adolf Hitler", source_title: "Mein Kampf" };
const source = (item = safe) => ({ text: item.quote_text, attribution: item.source_author, source_title: item.source_title, source_url: "https://example.org/research" });
const request = (method: string, body: unknown) => new NextRequest("https://local.test/api/enrich", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  mocks.sources = [source(), source(unsafe)]; mocks.candidates = [safe, unsafe]; mocks.existing = []; mocks.inserts = []; mocks.updates = []; mocks.sourceError = false; mocks.owner = "user"; mocks.filters = [];
  mocks.model.mockReset().mockImplementation(async () => ({ text: JSON.stringify(mocks.candidates), usage: { input_tokens: 0, output_tokens: 0 } })); mocks.bill.mockReset().mockResolvedValue(undefined);
});
describe("enrichment server boundaries (mocked services)", () => {
  it("filters generated candidates before auto-selection or persistence", async () => {
    const response = await POST(request("POST", { chapter_id: "chapter" }));
    expect(response.status).toBe(200); expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({ source_author: safe.source_author, included: true });
    expect(JSON.stringify(await response.json())).not.toContain("Adolf Hitler");
    expect(mocks.model.mock.calls[0][1]).not.toContain("Mein Kampf;");
  });
  it("filters already-included cached suggestions without modifying stored rows", async () => {
    mocks.existing = [safe, unsafe];
    const response = await GET(new NextRequest("https://local.test/api/enrich?project_id=project"));
    expect(await response.json()).toEqual({ chapter: [safe] }); expect(mocks.updates).toEqual([]);
    expect(mocks.filters).toContainEqual(["research_items", "user_id", "user"]);
    expect(mocks.filters).toContainEqual(["research_items", "project_id", "project"]);
  });
  it.each(["missing", "unsafe", "unknown"])("returns an empty list without model calls when sources are %s", async (kind) => {
    mocks.sources = kind === "missing" ? [] : [source(kind === "unsafe" ? unsafe : { ...safe, source_author: "Unknown" })];
    const response = await POST(request("POST", { chapter_id: "chapter" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual([]);
    expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.bill).not.toHaveBeenCalled(); expect(mocks.inserts).toEqual([]);
  });
  it("returns a smaller or empty verified list without requesting replacement quotes", async () => {
    mocks.candidates = [unsafe, { ...safe, quote_text: "An invented ungrounded substitute." }];
    const response = await POST(request("POST", { chapter_id: "chapter" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual([]); expect(mocks.model).toHaveBeenCalledTimes(1); expect(mocks.inserts).toEqual([]);
  });
  it("rejects unsafe inclusion even if the client bypasses the UI; still allows removing it", async () => {
    mocks.existing = [unsafe];
    expect((await PATCH(request("PATCH", { id: "unsafe", included: true }))).status).toBe(422);
    expect(mocks.updates).toEqual([]);
    expect((await PATCH(request("PATCH", { id: "unsafe", included: false }))).status).toBe(200);
    expect(mocks.updates).toEqual([{ included: false }]);
  });
  it("rejects unverifiable inclusion and accepts owned verified sources", async () => {
    mocks.existing = [safe]; mocks.sources = [];
    expect((await PATCH(request("PATCH", { id: "safe", included: true }))).status).toBe(422);
    mocks.sources = [source()]; expect((await PATCH(request("PATCH", { id: "safe", included: true }))).status).toBe(200);
    expect(mocks.updates).toEqual([{ included: true }]);
  });
  it("fails closed when verification fails and preserves ownership checks", async () => {
    mocks.existing = [safe]; mocks.sourceError = true;
    expect((await GET(new NextRequest("https://local.test/api/enrich?project_id=project"))).status).toBe(503);
    expect((await PATCH(request("PATCH", { id: "safe", included: true }))).status).toBe(503);
    expect(mocks.updates).toEqual([]); mocks.owner = "another-user";
    expect((await PATCH(request("PATCH", { id: "safe", included: true }))).status).toBe(401);
  });
});
