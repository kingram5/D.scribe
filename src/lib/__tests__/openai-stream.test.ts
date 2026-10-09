import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  events: [] as unknown[],
  failAfter: false,
  requests: 0,
}));
vi.mock("openai", () => ({
  default: class {
    responses = {
      create: () => {
        sdk.requests++;
        return {
          withResponse: async () => ({
            request_id: "request-fixture",
            data: (async function* () {
              for (const event of sdk.events) yield event;
              if (sdk.failAfter) throw new Error("socket closed");
            })(),
          }),
        };
      },
    };
  },
}));
import { executeResponse } from "../ai/openai";
import { PR_STAGES, validateRunConfig } from "../ai/config";
const config = validateRunConfig({
  version: 1,
  provider: "openai",
  serviceTier: "default",
  priceVersion: "fixture",
  rates: { fixture: { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 } },
  stages: Object.fromEntries(
    PR_STAGES.map((s) => [s, { model: "fixture", effort: "low" }]),
  ),
});
const response = {
  id: "response-fixture",
  model: "fixture",
  service_tier: "default",
  status: "completed",
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: "Author's words" }],
    },
  ],
};
const run = (started = vi.fn().mockResolvedValue(undefined)) =>
  executeResponse(
    "Rules",
    "Source",
    "draft",
    config,
    { model: "sonnet5", effort: "low" },
    "attempt-fixture",
    started,
  );
beforeEach(() => {
  sdk.events = [];
  sdk.failAfter = false;
  sdk.requests = 0;
  vi.stubEnv("DSCRIBE_OPENAI_API_KEY", "fixture-only");
});
afterEach(() => vi.unstubAllEnvs());
describe("interrupted provider streams", () => {
  it.each(["completed", "incomplete", "failed"])(
    "retains terminal %s usage when the connection then fails",
    async (status) => {
      sdk.events = [
        { type: "response.created", response },
        { type: `response.${status}`, response: { ...response, status } },
      ];
      sdk.failAfter = true;
      const started = vi.fn().mockResolvedValue(undefined);
      const out = await run(started);
      expect(started).toHaveBeenCalledWith(response.id, "request-fixture");
      expect(out.cost).toBeCloseTo(0.00022);
      expect(out.result !== null).toBe(status === "completed");
      expect(sdk.requests).toBe(1);
    },
  );
  it("does not accept partial output when terminal usage is missing", async () => {
    sdk.events = [
      { type: "response.created", response },
      { type: "response.output_text.delta", delta: "Partial" },
    ];
    await expect(run()).rejects.toThrow(/terminal response/);
    expect(sdk.requests).toBe(1);
  });
  it("does not retry a transport failure before completion", async () => {
    sdk.events = [{ type: "response.created", response }];
    sdk.failAfter = true;
    await expect(run()).rejects.toThrow("socket closed");
    expect(sdk.requests).toBe(1);
  });
  it("stops if response identity cannot be persisted", async () => {
    sdk.events = [
      { type: "response.created", response },
      { type: "response.completed", response },
    ];
    await expect(
      run(vi.fn().mockRejectedValue(new Error("database unavailable"))),
    ).rejects.toThrow("database unavailable");
    expect(sdk.requests).toBe(1);
  });
});
