import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Response,
  ResponseUsage,
} from "openai/resources/responses/responses";
import {
  newRunConfig,
  savedRunConfig,
  validateRunConfig,
  PR_STAGES,
  type OpenAIRunConfig,
} from "../ai/config";
import { responseRequest, interpretResponse } from "../ai/openai";
import { normalizeUsage, vendorDollars } from "../ai/usage";
import {
  safeVendorLifetime,
  transcriptText,
  type TranscriptEvent,
} from "../theo/live-transcript";
import { liveConfig } from "../theo/live-config";
const rates = {
  "gpt-6.1-sol": { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 },
  "gpt-6-astra": { input: 10, cached: 1, cacheWrite: 12.5, output: 50 },
};
function config(): OpenAIRunConfig {
  vi.stubEnv("PUBLISHER_READY_TEXT_PROVIDER", "openai");
  vi.stubEnv("OPENAI_PR_USER_IDS", "test-user");
  vi.stubEnv("DSCRIBE_OPENAI_API_KEY", "test-only");
  vi.stubEnv(
    "OPENAI_PR_RATE_CARD",
    JSON.stringify({ version: "fixture-not-live-prices", models: rates }),
  );
  return newRunConfig("test-user")!;
}
const usage: ResponseUsage = {
  input_tokens: 1e6,
  input_tokens_details: { cached_tokens: 200000, cache_write_tokens: 100000 },
  output_tokens: 1e6,
  output_tokens_details: { reasoning_tokens: 100000 },
  total_tokens: 2e6,
};
function response(text = "A source-grounded chapter."): Response {
  return {
    id: "resp_fixture",
    model: "gpt-6.1-sol",
    service_tier: "default",
    status: "completed",
    usage,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  } as unknown as Response;
}
afterEach(() => vi.unstubAllEnvs());
describe("provider contracts", () => {
  it("charges long-context input and output premiums without double counting reasoning", () => {
    const usage = {
      input: 273000,
      cached: 0,
      cacheWrite: 0,
      output: 1000,
      reasoning: 800,
    };
    expect(
      vendorDollars(usage, {
        input: 2,
        cached: 0.1,
        cacheWrite: 2.5,
        output: 10,
      }),
    ).toBeCloseTo(1.107);
  });
  it("applies the long-context surcharge only above the boundary, including cached tokens", () => {
    const base = {
      input: 0,
      cached: 272000,
      cacheWrite: 0,
      output: 100,
      reasoning: 0,
    };
    expect(vendorDollars(base, rates["gpt-6.1-sol"])).toBeCloseTo(0.0282, 9);
    expect(
      vendorDollars({ ...base, cached: 272001 }, rates["gpt-6.1-sol"]),
    ).toBeCloseTo(0.0559002, 9);
  });
  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid token counts %s",
    (value) => {
      expect(() => normalizeUsage({ ...usage, output_tokens: value })).toThrow(
        /usage/,
      );
    },
  );
  it("does not publish output when the provider omits usage", () => {
    const out = interpretResponse(
      { ...response(), usage: undefined },
      config(),
      { model: "sonnet5", effort: "low" },
    );
    expect(out.cost).toBeNull();
    expect(out.result).toBeNull();
    expect(out.error).toMatch(/Missing provider usage/);
  });
  it("keeps old runs legacy and rejects malformed new configs", () => {
    expect(savedRunConfig({ draft: { model: "sonnet5" } })).toBeNull();
    expect(() => savedRunConfig({ provider: "openai" })).toThrow();
  });
  it("limits new routing to an authorized cohort and pins the complete mix", () => {
    const c = config();
    expect(newRunConfig("other-user")).toBeNull();
    expect(c.stages.edit).toEqual({ model: "gpt-6-astra", effort: "high" });
    expect(c.stages.revise).toEqual({ model: "gpt-6.1-sol", effort: "high" });
    expect(Object.keys(c.stages)).toHaveLength(PR_STAGES.length);
    vi.stubEnv("OPENAI_PUBLISHER_READY_STANDARD_MODEL", "changed");
    expect(savedRunConfig(c)?.stages.draft.model).toBe("gpt-6.1-sol");
  });
  it("refuses missing exact rates instead of a legacy price fallback", () => {
    const c = config();
    delete c.rates["gpt-6-astra"];
    expect(() => validateRunConfig(c)).toThrow(/rate/);
  });
  it("uses Responses structured output and effort, without Anthropic arguments", () => {
    const c = config();
    const req = responseRequest("Editorial rules", "Source", "edit", c, {
      model: "fable51",
      effort: "high",
      maxTokens: 1234,
      jsonSchema: { type: "object" },
    });
    expect(req.model).toBe("gpt-6-astra");
    expect(req.max_output_tokens).toBe(1234);
    expect(req.text?.format?.type).toBe("json_schema");
    expect(req).not.toHaveProperty("thinking");
    expect(req).not.toHaveProperty("output_config");
    expect(req).not.toHaveProperty("temperature");
    expect(req.store).toBe(false);
  });
  it("counts reasoning once and separates cache subcategories", () => {
    const n = normalizeUsage(usage);
    expect(n.input).toBe(700000);
    expect(n.reasoning).toBe(100000);
    expect(vendorDollars(n, rates["gpt-6.1-sol"])).toBeCloseTo(18.34);
  });
  it("rejects contradictory usage instead of inventing a free call", () => {
    expect(() => normalizeUsage({ ...usage, input_tokens: 1 })).toThrow();
    expect(() =>
      normalizeUsage({
        ...usage,
        output_tokens_details: { reasoning_tokens: 2e6 },
      }),
    ).toThrow();
    expect(() => normalizeUsage({ ...usage, total_tokens: 0 })).toThrow();
  });
  it("accepts a valid structured result and retains usage", () => {
    const c = config();
    const r = interpretResponse(response('{"chapter":"hello"}'), c, {
      model: "sonnet5",
      effort: "medium",
      jsonSchema: {
        type: "object",
        properties: { chapter: { type: "string" } },
        required: ["chapter"],
        additionalProperties: false,
      },
    });
    expect(r.error).toBeNull();
    expect(r.result?.text).toContain("hello");
    expect(r.cost).toBeCloseTo(18.34);
  });
  it.each(["incomplete", "failed"] as const)(
    "records paid %s responses without publishing output",
    (status) => {
      const r = interpretResponse({ ...response(), status }, config(), {
        model: "sonnet5",
        effort: "medium",
      });
      expect(r.result).toBeNull();
      expect(r.cost).toBeGreaterThan(0);
      expect(r.error).toContain(status);
    },
  );
  it("refusals, invalid JSON, and schema mismatches retain cost without a result", () => {
    const c = config();
    for (const r of [
      response("not json"),
      response('{"chapter":12}'),
      {
        ...response(),
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "refusal", refusal: "No" }],
          },
        ],
      },
    ]) {
      const out = interpretResponse(r as Response, c, {
        model: "sonnet5",
        effort: "medium",
        jsonSchema: {
          type: "object",
          properties: { chapter: { type: "string" } },
          required: ["chapter"],
        },
      });
      expect(out.result).toBeNull();
      expect(out.cost).toBeGreaterThan(0);
    }
  });
  it("flags unpriced served models and tiers for reconciliation", () => {
    const c = config();
    expect(
      interpretResponse({ ...response(), model: "unknown-snapshot" }, c, {
        model: "sonnet5",
        effort: "low",
      }).cost,
    ).toBeNull();
    expect(
      interpretResponse({ ...response(), service_tier: "priority" }, c, {
        model: "sonnet5",
        effort: "low",
      }).cost,
    ).toBeNull();
  });
});
describe("Live lifecycle contracts", () => {
  it("reserves enough for the server expiration including a safety margin", () => {
    expect(safeVendorLifetime(3700, 100000, 3605)).toBe(true);
    expect(safeVendorLifetime(3700, 100000, 100)).toBe(false);
    expect(safeVendorLifetime(NaN, 100000, 5200)).toBe(false);
  });
  it("deduplicates transcripts and obeys delegation boundaries", () => {
    const a = {
      type: "session.input_transcript.delta",
      event_id: "a",
      delta: "My father ",
      start_ms: 0,
      end_ms: 500,
    } as TranscriptEvent;
    const b = {
      ...a,
      event_id: "b",
      delta: "taught me.",
      start_ms: 501,
      end_ms: 1000,
    };
    expect(transcriptText([b, a, a])).toBe("My father taught me.");
    expect(transcriptText([a, b], 500, 1000)).toBe("taught me.");
  });
  it("keeps Live disabled by default and in production even with staging caps", () => {
    config();
    expect(liveConfig("test-user")).toBeNull();
    vi.stubEnv("THEO_VOICE_PROVIDER", "openai");
    vi.stubEnv("THEO_LIVE_STAGING", "true");
    vi.stubEnv("THEO_LIVE_USD_PER_MINUTE", "0.05");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(liveConfig("test-user")).toBeNull();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(liveConfig("test-user")?.caps.pro).toBe(5200);
    expect(liveConfig("other-user")).toBeNull();
  });
});
