/**
 * PR #47 review (2026-11-14): with the OpenAI/Live routing off, Interview
 * answers must behave exactly as production does today, and the code must not
 * depend on #47's migrations. Runs pinned to OpenAI keep the stricter rules.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Filter = [op: string, key: string, value: unknown];
interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  payload?: Record<string, unknown>;
  filters: Filter[];
}
type Result = { data: unknown; error: unknown };

const state = vi.hoisted(() => ({
  handler: (() => ({ data: null, error: null })) as (c: Call) => Result,
  calls: [] as Call[],
  rpcs: [] as string[],
  claude: vi.fn(),
  recordInk: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from(table: string) {
      const c: Call = { table, op: "select", filters: [] };
      const run = () => {
        state.calls.push(c);
        return Promise.resolve(state.handler(c));
      };
      const chain: Record<string, unknown> = {
        select(columns?: string) { if (c.op === "select") c.columns = columns; return chain; },
        insert(payload: Record<string, unknown>) { c.op = "insert"; c.payload = payload; return chain; },
        update(payload: Record<string, unknown>) { c.op = "update"; c.payload = payload; return chain; },
        upsert(payload: Record<string, unknown>) { c.op = "upsert"; c.payload = payload; return chain; },
        delete() { c.op = "delete"; return chain; },
        single: run,
        maybeSingle: run,
        then(resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) { return run().then(resolve, reject); },
      };
      for (const op of ["eq", "neq", "in", "not", "gt", "gte", "lt", "like", "order", "limit", "range"])
        chain[op] = (key: string, value: unknown) => { c.filters.push([op, key, value]); return chain; };
      return chain;
    },
    rpc(name: string) {
      state.rpcs.push(name);
      return Promise.resolve({ data: null, error: { message: `rpc ${name} is not faked` } });
    },
  }),
}));
vi.mock("@/lib/claude-next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/claude-next")>()),
  callClaudeNext: state.claude,
}));
vi.mock("@/lib/ink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ink")>()),
  recordInkUsage: state.recordInk,
  ensureBalance: async () => ({ ink_balance: 0, lifetime_used: 0, tier: "free", topup_ink: 0 }),
}));
vi.mock("@/lib/auth", () => ({ requireAuth: async () => ({ user: { id: "author1" }, error: null }) }));

import { submitAnswer, isMissingSourceKeyColumn } from "../publisher-ready/interview";
import { STEP_MODELS, StepError } from "../publisher-ready/pipeline";
import { withChapterStep } from "../ai/execution";
import { savedRunConfig, PR_STAGES } from "../ai/config";
import { estimateConfiguredRun } from "../ai/estimate";
import { estimateRunInk } from "../publisher-ready/estimate";
import { GET as liveGET } from "@/app/api/theo/live/route";

const OPENAI_CONFIG = {
  version: 1,
  provider: "openai",
  serviceTier: "default",
  priceVersion: "fixture",
  rates: { "gpt-6.1-sol": { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 } },
  stages: Object.fromEntries(PR_STAGES.map((s) => [s, { model: "gpt-6.1-sol", effort: "low" }])),
};

/** Objects #47's migrations add. None may be touched while its routing is off. */
const NEW_TABLES = ["pr_ai_calls", "pr_step_jobs", "theo_live_sessions", "theo_live_events", "theo_live_workers"];
const MISSING_ON_SELECT = { code: "42703", message: "column pr_answers.source_event_key does not exist" };
const MISSING_ON_INSERT = { code: "PGRST204", message: "Could not find the 'source_event_key' column of 'pr_answers' in the schema cache" };

interface World {
  provider: "legacy" | "openai";
  status: string;
  /** What the source_event_key lookup returns. */
  lookup?: Result;
  /** Fail any insert that carries source_event_key with this error. */
  keyedInsertError?: unknown;
  parentExists?: boolean;
}

function world(w: World) {
  state.handler = (c) => {
    const has = (key: string) => c.filters.some(([, k]) => k === key);
    if (c.table === "pr_runs" && c.columns === "models")
      return { data: { models: w.provider === "openai" ? OPENAI_CONFIG : STEP_MODELS }, error: null };
    if (c.table === "pr_runs")
      return { data: { id: "run1", user_id: "author1", project_id: "proj1", status: w.status }, error: null };
    if (c.table === "pr_questions" && c.op === "select")
      return { data: { id: "q1", question: "What did the farm look like?", status: "asked" }, error: null };
    if (c.table === "pr_questions" && c.op === "update") return { data: null, error: null };
    if (c.table === "pr_answers" && c.op === "select" && has("source_event_key"))
      return w.lookup ?? { data: null, error: null };
    if (c.table === "pr_answers" && c.op === "select")
      return { data: w.parentExists ? { id: "a0" } : null, error: null };
    if (c.table === "pr_answers" && c.op === "insert") {
      if (c.payload && "source_event_key" in c.payload && w.keyedInsertError)
        return { data: null, error: w.keyedInsertError };
      return { data: { id: "a1" }, error: null };
    }
    return { data: null, error: { message: `unexpected ${c.op} on ${c.table}` } };
  };
}

const inserts = () => state.calls.filter((c) => c.table === "pr_answers" && c.op === "insert");
const touchedNew = () => state.calls.map((c) => c.table).filter((t) => NEW_TABLES.includes(t));

const answer = (transcript: string, extra: Partial<Parameters<typeof submitAnswer>[0]> = {}) =>
  submitAnswer({ userId: "author1", runId: "run1", questionId: "q1", transcript, source: "voice", sourceEventKey: "room:11111111-2222-3333-4444-555555555555", ...extra });

beforeEach(() => {
  state.calls = [];
  state.rpcs = [];
  state.claude.mockReset();
  state.claude.mockResolvedValue({ text: "DONE", usage: { input_tokens: 10, output_tokens: 2 }, servedBy: "claude-sonnet-5" });
  state.recordInk.mockReset();
  vi.unstubAllEnvs();
});

describe("Interview answers with the OpenAI/Live routing off (production parity)", () => {
  it("trims an answer over 8,000 characters and saves it, as production does", async () => {
    world({ provider: "legacy", status: "interviewing" });
    const long = "  " + "word ".repeat(1900); // ~9,500 characters
    const out = await answer(long);
    expect(out).toEqual({ followUp: null, answerId: "a1" });
    const saved = inserts()[0].payload!;
    expect(saved.transcript).toBe(long.trim().slice(0, 8000));
    expect((saved.transcript as string).length).toBe(8000);
  });

  it("accepts an answer after the run has moved past the interview stage", async () => {
    for (const status of ["revising", "checking", "done"]) {
      state.calls = [];
      world({ provider: "legacy", status });
      await expect(answer("We kept the farm.")).resolves.toEqual({ followUp: null, answerId: "a1" });
      expect(inserts()).toHaveLength(1);
    }
  });

  it("does not add the follow-up ownership lookup production never had", async () => {
    world({ provider: "legacy", status: "interviewing", parentExists: false });
    await expect(answer("More detail.", { followUpOf: "a0" })).resolves.toEqual({ followUp: null, answerId: "a1" });
    expect(state.calls.some((c) => c.table === "pr_answers" && c.op === "select" && c.filters.some(([, k]) => k === "id"))).toBe(false);
  });

  it("still runs the follow-up model call through the existing provider and Ink meter", async () => {
    world({ provider: "legacy", status: "interviewing" });
    state.claude.mockResolvedValueOnce({ text: "What year was that?", usage: { input_tokens: 10, output_tokens: 5 }, servedBy: "claude-sonnet-5" });
    await expect(answer("A while back.")).resolves.toEqual({ followUp: "What year was that?", answerId: "a1" });
    expect(state.claude).toHaveBeenCalledTimes(1);
    expect(state.recordInk).toHaveBeenCalledWith("author1", "proj1", "pr_interview", "sonnet5", expect.anything());
    expect(state.rpcs).toEqual([]);
  });
});

describe("Migration-order safety (code deployed before 20261008231000)", () => {
  it("saves the answer without the key when source_event_key does not exist", async () => {
    world({ provider: "legacy", status: "interviewing", lookup: { data: null, error: MISSING_ON_SELECT }, keyedInsertError: MISSING_ON_INSERT });
    await expect(answer("We kept the farm.")).resolves.toEqual({ followUp: null, answerId: "a1" });
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].payload).not.toHaveProperty("source_event_key");
    expect(state.calls.some((c) => c.table === "pr_questions" && c.op === "update")).toBe(true);
  });

  it("falls back to production's insert when the column is new but not yet in PostgREST's schema cache", async () => {
    world({ provider: "legacy", status: "interviewing", keyedInsertError: MISSING_ON_INSERT });
    await expect(answer("We kept the farm.")).resolves.toEqual({ followUp: null, answerId: "a1" });
    expect(inserts()).toHaveLength(2);
    expect(inserts()[0].payload).toHaveProperty("source_event_key");
    expect(inserts()[1].payload).not.toHaveProperty("source_event_key");
  });

  it("keeps the dedupe once the migration is in: a repeated request returns the saved answer", async () => {
    world({ provider: "legacy", status: "interviewing", lookup: { data: { id: "a9", question_id: "q1", transcript: "We kept the farm." }, error: null } });
    await expect(answer("We kept the farm.")).resolves.toEqual({ followUp: null, answerId: "a9" });
    expect(inserts()).toHaveLength(0);
  });

  it("never treats a duplicate-key error as a missing column", async () => {
    const duplicate = { code: "23505", message: "duplicate key value violates unique constraint \"pr_answers_source_event\"" };
    world({ provider: "legacy", status: "interviewing", keyedInsertError: duplicate });
    await expect(answer("We kept the farm.")).rejects.toBe(duplicate);
    expect(inserts()).toHaveLength(1);
    expect(isMissingSourceKeyColumn(duplicate)).toBe(false);
    expect(isMissingSourceKeyColumn({ code: "42703", message: "column pr_answers.other does not exist" })).toBe(false);
  });

  it("touches none of #47's tables or functions on a legacy answer, chapter step, estimate or Live check", async () => {
    world({ provider: "legacy", status: "interviewing" });
    await answer("We kept the farm.");

    const action = vi.fn(async () => "draft saved");
    await expect(withChapterStep("author1", "run1", "ch1", "draft", action)).resolves.toBe("draft saved");
    expect(action).toHaveBeenCalledTimes(1);

    vi.stubEnv("INK_METER_V2", "true");
    const chapters = [{ target_word_count: 500 }, { target_word_count: 3000 }];
    const before = state.calls.length;
    await expect(estimateConfiguredRun(chapters, null)).resolves.toBe(estimateRunInk(chapters));
    expect(state.calls.length).toBe(before); // no ink_meter_settings read on legacy runs

    const live = await liveGET(new NextRequest("https://example.test/api/theo/live"));
    expect(await live.json()).toEqual({ available: false });

    expect(touchedNew()).toEqual([]);
    expect(state.rpcs).toEqual([]);
  });

  it("reads every existing production run as legacy", () => {
    expect(savedRunConfig(STEP_MODELS)).toBeNull();
    expect(savedRunConfig({})).toBeNull();
  });

  it("answers an unknown run with production's 404, not a 500", async () => {
    state.handler = () => ({ data: null, error: null });
    const err = await answer("Hello.").catch((e) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as StepError).status).toBe(404);
  });
});

describe("Interview answers on a run pinned to OpenAI (new path keeps the strict rules)", () => {
  it("refuses an answer over 8,000 characters and saves nothing", async () => {
    world({ provider: "openai", status: "interviewing" });
    const err = await answer("x".repeat(8001)).catch((e) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as StepError).status).toBe(400);
    expect(inserts()).toHaveLength(0);
  });

  it("refuses an answer once the run is past the interview", async () => {
    world({ provider: "openai", status: "revising" });
    const err = await answer("We kept the farm.").catch((e) => e);
    expect((err as StepError).status).toBe(409);
    expect(inserts()).toHaveLength(0);
  });

  it("refuses a follow-up that doesn't belong to this question", async () => {
    world({ provider: "openai", status: "interviewing", parentExists: false });
    const err = await answer("More detail.", { followUpOf: "a0" }).catch((e) => e);
    expect((err as StepError).status).toBe(404);
    expect(inserts()).toHaveLength(0);
  });

  it("saves a valid follow-up with its source key", async () => {
    world({ provider: "openai", status: "interviewing", parentExists: true });
    await expect(answer("It was 1987.", { followUpOf: "a0" })).resolves.toEqual({ followUp: null, answerId: "a1" });
    expect(inserts()[0].payload).toMatchObject({ transcript: "It was 1987.", source_event_key: "room:11111111-2222-3333-4444-555555555555" });
    expect(state.claude).not.toHaveBeenCalled();
  });

  it("does not silently drop dedupe when the column is missing", async () => {
    world({ provider: "openai", status: "interviewing", parentExists: true, lookup: { data: null, error: MISSING_ON_SELECT } });
    await expect(answer("It was 1987.", { followUpOf: "a0" })).rejects.toBe(MISSING_ON_SELECT);
    expect(inserts()).toHaveLength(0);
  });
});
