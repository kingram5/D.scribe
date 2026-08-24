import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";

const requireAuth = vi.fn();
const checkInk = vi.fn();
const isResearchEnabled = vi.fn();
const assessTopic = vi.fn();
const gatherPages = vi.fn();
const extractResearchItems = vi.fn();
const persistResearchItems = vi.fn();
const chargeResearchInk = vi.fn();
const markJob = vi.fn();

const fromMock = vi.fn();

vi.mock("@/lib/auth", () => ({ requireAuth: (...args: unknown[]) => requireAuth(...args) }));
vi.mock("@/lib/ink", () => ({ checkInk: (...args: unknown[]) => checkInk(...args) }));
vi.mock("@/lib/research-search", () => ({
  isResearchEnabled: (...args: unknown[]) => isResearchEnabled(...args),
}));
vi.mock("@/lib/research-pipeline", () => ({
  assessTopic: (...args: unknown[]) => assessTopic(...args),
  gatherPages: (...args: unknown[]) => gatherPages(...args),
  extractResearchItems: (...args: unknown[]) => extractResearchItems(...args),
  persistResearchItems: (...args: unknown[]) => persistResearchItems(...args),
  chargeResearchInk: (...args: unknown[]) => chargeResearchInk(...args),
  markJob: (...args: unknown[]) => markJob(...args),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({ from: (...args: unknown[]) => fromMock(...args) }),
}));

function chain(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const name of ["select", "eq", "in", "gte", "limit", "single", "order"]) {
    api[name] = vi.fn(self);
  }
  api.single = vi.fn(async () => result);
  api.limit = vi.fn(async () => result);
  api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return api;
}

describe("research run route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: "user-a" }, error: null });
    checkInk.mockResolvedValue({ allowed: true });
    isResearchEnabled.mockReturnValue(true);
    fromMock.mockImplementation((table: string) => {
      if (table === "projects") {
        return chain({ data: { id: "proj-a", title: "Tithing", audience: "Faith Community" }, error: null });
      }
      if (table === "research_jobs") {
        const api = chain({ data: [], error: null, count: 0 });
        api.insert = vi.fn(() => chain({ data: { id: "job-1" }, error: null }));
        return api;
      }
      return chain({ data: null, error: null });
    });
  });

  it("fail-opens when the search key is missing", async () => {
    isResearchEnabled.mockReturnValue(false);
    const { POST } = await import("@/app/api/research/run/route");
    const res = await POST(new Request("http://local/api/research/run", {
      method: "POST",
      body: JSON.stringify({ project_id: "proj-a", digest: [] }),
    }) as never);
    expect(await res.json()).toEqual({ disabled: true });
    expect(assessTopic).not.toHaveBeenCalled();
  });

  it("skips when the project is not owned by this user", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "projects") return chain({ data: null, error: null });
      return chain({ data: [], error: null, count: 0 });
    });
    const { POST } = await import("@/app/api/research/run/route");
    const res = await POST(new Request("http://local/api/research/run", {
      method: "POST",
      body: JSON.stringify({ project_id: "proj-b", digest: [] }),
    }) as never);
    expect(await res.json()).toEqual({ skipped: true });
    expect(assessTopic).not.toHaveBeenCalled();
  });

  it("low-confidence non-forced probe skips with no search and no Ink", async () => {
    assessTopic.mockResolvedValue({ confidence: "low", topic_summary: "vague", themes: [], queries: ["q"] });
    const { POST } = await import("@/app/api/research/run/route");
    const res = await POST(new Request("http://local/api/research/run", {
      method: "POST",
      body: JSON.stringify({ project_id: "proj-a", digest: [{ role: "user", content: "faith and money" }] }),
    }) as never);
    expect(await res.json()).toEqual({ skipped: true });
    expect(markJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "skipped" }));
    expect(gatherPages).not.toHaveBeenCalled();
    expect(chargeResearchInk).not.toHaveBeenCalled();
  });

  it("high confidence at probe 2 runs the full pipeline and charges Ink", async () => {
    assessTopic.mockResolvedValue({
      confidence: "high",
      topic_summary: "tithing for young families",
      themes: ["tithing"],
      queries: ["tithing statistics 2026"],
    });
    gatherPages.mockResolvedValue([{ title: "T", url: "https://t.example", content: "hello world quote" }]);
    extractResearchItems.mockResolvedValue([{
      kind: "stat",
      text: "hello world quote",
      source_title: "T",
      source_url: "https://t.example",
      themes: ["tithing"],
    }]);
    persistResearchItems.mockResolvedValue(1);
    const { POST } = await import("@/app/api/research/run/route");
    const res = await POST(new Request("http://local/api/research/run", {
      method: "POST",
      body: JSON.stringify({ project_id: "proj-a", digest: [{ role: "user", content: "tithing for young families" }] }),
    }) as never);
    expect(await res.json()).toEqual({ done: true, items_added: 1 });
    expect(gatherPages).toHaveBeenCalled();
    expect(chargeResearchInk).toHaveBeenCalledWith("user-a", "proj-a");
  });

  it("low confidence with force still runs", async () => {
    assessTopic.mockResolvedValue({ confidence: "low", topic_summary: "vague", themes: [], queries: ["q"] });
    gatherPages.mockResolvedValue([]);
    extractResearchItems.mockResolvedValue([]);
    persistResearchItems.mockResolvedValue(0);
    const { POST } = await import("@/app/api/research/run/route");
    const res = await POST(new Request("http://local/api/research/run", {
      method: "POST",
      body: JSON.stringify({ project_id: "proj-a", digest: [], force: true }),
    }) as never);
    expect(await res.json()).toEqual({ done: true, items_added: 0 });
    expect(gatherPages).toHaveBeenCalled();
    expect(chargeResearchInk).toHaveBeenCalled();
  });
});

describe("research injection in brainstorm", () => {
  it("loads active items into RESEARCHED SOURCES", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/brainstorm/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/formatResearchedSourcesBlock/);
    expect(src).toMatch(/status", "active"/);
  });
});
