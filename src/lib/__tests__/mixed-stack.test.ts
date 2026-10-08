import { describe, it, expect, vi, afterEach } from "vitest";
import {
  AIError,
  validateSchema,
  type Route,
  type TextResult,
} from "../ai/contracts";
import {
  resolveMixedSnapshot,
  readSnapshot,
  validateRoute,
} from "../ai/publisher-ready-routing";
import { buildTextRequest, generateText, sse } from "../ai/providers/text";
import { normalizeUsage } from "../ai/usage/normalize";
import {
  durableText,
  type AttemptStore,
  type AttemptRow,
} from "../ai/usage/ledger";
import {
  sourceLedger,
  validateEvidence,
  type Issue,
} from "../publisher-ready/source-ledger";
import { auditSelected, needsPremium } from "../publisher-ready/review-policy";
import {
  normalizeGroqChunks,
  transcribeGroq,
  groqVendorCost,
} from "../transcription/groq";
import { selectTranscriptionProvider } from "../transcription/select-provider";
import {
  appendFragment,
  liveConfig,
  shouldCloseLive,
} from "../theo/live-session";
const price = {
  version: "fixture-only",
  source: "https://example.test/fixture",
  verifiedAt: "2026-10-08",
  input: 1,
  output: 2,
  cacheRead: 0.1,
  cacheWrite: 1.25,
  longContext: { threshold: 272000, inputMultiplier: 2, outputMultiplier: 1.5 },
  serviceTier: "default" as const,
};
const route: Route = {
  provider: "openai",
  model: "gpt-6-luna",
  effort: "low",
  timeoutMs: 1000,
  maximumAttempts: 3,
  price,
  verification: "synthetic-contract-fixture; not live validation",
};
const request = {
  system: "Do not invent",
  user: "Author source",
  maxTokens: 100,
};
const result: TextResult = {
  text: "Hello",
  model: route.model,
  usage: normalizeUsage(
    "openai",
    { input_tokens: 10, output_tokens: 5 },
    price,
  ),
};
const objectSchema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function stream(events: unknown[], crlf = false) {
  return new Response(
    events
      .map((e) => `data: ${JSON.stringify(e)}\n\n`)
      .join("")
      .replaceAll("\n", crlf ? "\r\n" : "\n"),
    { headers: { "x-request-id": "req-fixture" } },
  );
}
function store(): AttemptStore & { rows: AttemptRow[] } {
  const rows: AttemptRow[] = [];
  return {
    rows,
    async list() {
      return rows;
    },
    async spent() {
      return rows.reduce((n, r) => n + (r.vendor_cost_usd ?? 0), 0);
    },
    async start(_key, _n, _route, hash) {
      const id = String(rows.length);
      rows.push({
        id,
        state: "started",
        input_hash: hash,
        result: null,
        vendor_cost_usd: null,
      });
      return id;
    },
    async finish(id, state, result, error) {
      Object.assign(rows[+id], {
        state,
        result: result ?? null,
        vendor_cost_usd:
          result?.usage.vendorCostUsd ?? error?.usage?.vendorCostUsd ?? null,
      });
    },
  };
}
describe("mixed routing and payload isolation", () => {
  it("defaults off with no optional credentials, including noncohort accounts", () => {
    expect(resolveMixedSnapshot("author", {})).toBeNull();
    expect(
      resolveMixedSnapshot("author", {
        PUBLISHER_READY_STACK: "mixed",
        PUBLISHER_READY_MIXED_ENABLED: "true",
        PUBLISHER_READY_MIXED_ACCOUNTS: "someone-else",
      }),
    ).toBeNull();
    expect(readSnapshot({ draft: { model: "sonnet5" } })).toBeNull();
  });
  it("fails closed without model verification instead of substituting a target", () =>
    expect(() =>
      resolveMixedSnapshot("a", {
        PUBLISHER_READY_STACK: "mixed",
        PUBLISHER_READY_MIXED_ENABLED: "true",
        PUBLISHER_READY_MIXED_ACCOUNTS: "a",
        INK_METER_V2: "true",
      }),
    ).toThrow(/Verify access/));
  it("accepts an attested config and pins it across environment changes", () => {
    const models = [
      "openai/gpt-6-luna",
      "zai/glm-5.3",
      "zai/glm-5.3-flash",
      "anthropic/claude-sonnet-5-5",
      "anthropic/claude-opus-5-5",
    ];
    const snapshot = resolveMixedSnapshot("a", {
      PUBLISHER_READY_STACK: "mixed",
      PUBLISHER_READY_MIXED_ENABLED: "true",
      PUBLISHER_READY_MIXED_ACCOUNTS: "a",
      INK_METER_V2: "true",
      MIXED_MAX_OPERATION_USD: "2",
      OPENAI_API_KEY: "fixture",
      ANTHROPIC_API_KEY: "fixture",
      ZAI_API_KEY: "fixture",
      MIXED_VERIFIED_MODELS_JSON: JSON.stringify(
        Object.fromEntries(
          models.map((m) => [m, { evidence: "fixture", price }]),
        ),
      ),
    });
    vi.stubEnv("PUBLISHER_READY_MIXED_ENABLED", "false");
    expect(readSnapshot({ mixed: snapshot })?.routes.draft.model).toBe(
      "claude-sonnet-5-5",
    );
  });
  it("uses provider-specific efforts and never Claude sampling", () => {
    const openai = buildTextRequest(route, request);
    expect(openai.reasoning).toEqual({ effort: "low" });
    expect(openai).not.toHaveProperty("reasoning_effort");
    const claude = buildTextRequest(
      {
        ...route,
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        effort: "medium",
      },
      { ...request, schema: objectSchema },
    );
    expect(claude.thinking).toEqual({ type: "adaptive" });
    expect(claude).not.toHaveProperty("temperature");
    expect(claude).not.toHaveProperty("fallbacks");
    const zai = buildTextRequest(
      { ...route, provider: "zai", model: "glm-5.3", effort: "high" },
      request,
    );
    expect(zai.reasoning_effort).toBe("high");
    expect(zai).not.toHaveProperty("output_config");
    expect(() =>
      validateRoute({ ...route, provider: "zai", effort: "medium" }),
    ).toThrow(/Unsupported/);
  });
  it.each([{ ok: "true" }, { ok: true, extra: 1 }, {}, null])(
    "runtime rejects malformed structured output %j",
    (value) => expect(() => validateSchema(value, objectSchema)).toThrow(),
  );
});
describe("provider streaming and failure accounting", () => {
  it("collects OpenAI text and usage with no double-counted reasoning/cache", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const fetcher = vi.fn(async () =>
      stream(
        [
          { type: "response.output_text.delta", delta: '{"ok":true}' },
          {
            type: "response.completed",
            response: {
              usage: {
                input_tokens: 100,
                output_tokens: 30,
                input_tokens_details: { cached_tokens: 60 },
                output_tokens_details: { reasoning_tokens: 20 },
              },
            },
          },
        ],
        true,
      ),
    );
    const out = await generateText(
      route,
      { ...request, schema: objectSchema },
      fetcher,
    );
    expect(out.usage.inputTokens).toBe(40);
    expect(out.usage.outputTokens).toBe(30);
    expect(out.usage.vendorCostUsd).toBeCloseTo(0.000106);
    expect(out.providerRequestId).toBe("req-fixture");
  });
  it("validates Claude output and preserves disjoint cache usage", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
    const out = await generateText(
      { ...route, provider: "anthropic" },
      request,
      async () =>
        stream([
          {
            type: "message_start",
            message: {
              usage: {
                input_tokens: 20,
                cache_read_input_tokens: 30,
                cache_creation_input_tokens: 10,
              },
            },
          },
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Good" },
          },
          {
            type: "message_delta",
            usage: { output_tokens: 50 },
            delta: { stop_reason: "end_turn" },
          },
        ]),
    );
    expect(out.usage.vendorCostUsd).toBeCloseTo(0.0001355);
  });
  it("Z.ai invalid JSON is a paid malformed attempt, not a successful report", async () => {
    vi.stubEnv("ZAI_API_KEY", "test-only");
    try {
      await generateText(
        { ...route, provider: "zai" },
        { ...request, schema: objectSchema },
        async () =>
          stream([
            {
              choices: [
                { delta: { content: '{"ok":"bad"}' }, finish_reason: "stop" },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            },
          ]),
      );
      throw new Error("expected rejection");
    } catch (e) {
      expect(e).toMatchObject({
        code: "malformed",
        usage: { usageStatus: "reported" },
      });
    }
  });
  it.each(["incomplete", "refusal"])("rejects OpenAI %s", async (kind) => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const events =
      kind === "incomplete"
        ? [
            {
              type: "response.incomplete",
              response: { usage: { input_tokens: 1, output_tokens: 2 } },
            },
          ]
        : [
            { type: "response.refusal.delta", delta: "No" },
            { type: "response.completed" },
          ];
    await expect(
      generateText(route, request, async () => stream(events)),
    ).rejects.toMatchObject({
      code: kind === "incomplete" ? "incomplete" : "refused",
    });
  });
  it("subtracts OpenAI cache writes from total input before pricing them", () => {
    const u = normalizeUsage(
      "openai",
      {
        input_tokens: 100,
        output_tokens: 30,
        input_tokens_details: { cached_tokens: 60, cache_write_tokens: 10 },
        output_tokens_details: { reasoning_tokens: 20 },
      },
      price,
    );
    expect(u.inputTokens).toBe(30);
    expect(u.cacheWriteTokens).toBe(10);
    expect(u.vendorCostUsd).toBeCloseTo(0.0001085);
  });
  it("unknown or invalid usage never becomes zero dollars", () => {
    expect(normalizeUsage("zai", {}, price)).toMatchObject({
      usageStatus: "unknown",
      vendorCostUsd: undefined,
    });
    expect(
      normalizeUsage(
        "openai",
        {
          input_tokens: 5,
          output_tokens: 2,
          input_tokens_details: { cached_tokens: 10 },
        },
        price,
      ).usageStatus,
    ).toBe("unknown");
  });
  it("preserves split unicode and final SSE frame", async () => {
    const bytes = new TextEncoder().encode('data: {"text":"café"}');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    });
    const events = [];
    for await (const event of sse(body)) events.push(event);
    expect(events).toEqual([{ text: "café" }]);
  });
});
describe("durable attempt replay, bounded retry and budget", () => {
  it("replays completed attempts without another provider call", async () => {
    const ledger = store(),
      send = vi.fn(async () => result);
    await durableText(ledger, "draft", route, request, 1, send);
    await durableText(ledger, "draft", route, request, 1, send);
    expect(send).toHaveBeenCalledTimes(1);
    await expect(
      durableText(
        ledger,
        "draft",
        route,
        { ...request, user: "changed" },
        1,
        send,
      ),
    ).rejects.toMatchObject({ code: "review_needed" });
  });
  it("retries only known rejected 429s and bounds total attempts", async () => {
    const ledger = store(),
      send = vi.fn(async () => {
        throw new AIError("retryable", "429");
      });
    await expect(
      durableText(ledger, "x", route, request, 1, send),
    ).rejects.toMatchObject({ code: "retryable" });
    expect(send).toHaveBeenCalledTimes(3);
    expect(ledger.rows).toHaveLength(3);
  });
  it("never repeats an ambiguous paid timeout, even after resume", async () => {
    const ledger = store(),
      send = vi.fn(async () => {
        throw new AIError("reconcile", "timeout");
      });
    await expect(
      durableText(ledger, "x", route, request, 1, send),
    ).rejects.toThrow();
    await expect(
      durableText(ledger, "x", route, request, 1, send),
    ).rejects.toThrow(/requires review/);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("requires review before a budget-exceeding request and before spending unknown usage", async () => {
    const send = vi.fn(async () => result);
    await expect(
      durableText(store(), "x", route, request, 0, send),
    ).rejects.toMatchObject({ code: "review_needed" });
    expect(send).not.toHaveBeenCalled();
    await expect(
      durableText(store(), "x", route, request, 1, async () => ({
        ...result,
        usage: normalizeUsage("openai", {}, price),
      })),
    ).rejects.toMatchObject({ code: "reconcile" });
  });
  it("cancellation before dispatch costs no attempt", async () => {
    const abort = new AbortController();
    abort.abort();
    const ledger = store(),
      send = vi.fn(async () => result);
    await expect(
      durableText(
        ledger,
        "x",
        route,
        { ...request, signal: abort.signal },
        1,
        send,
      ),
    ).rejects.toThrow();
    expect(ledger.rows).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });
});
describe("source fidelity and premium review", () => {
  const ledger = sourceLedger([
    {
      id: "transcript",
      full_text: "I moved in 1999.",
      segments: [
        { text: "I moved in 1999.", speaker: "Speaker 0", start: 0, end: 4 },
      ],
    },
  ]);
  const issue: Issue = {
    location: "paragraph 1",
    severity: "serious",
    kind: "timeline",
    source_id: ledger.evidence[0].id,
    source_quote: "1999",
    action: "Ask the author",
    uncertainty: true,
  };
  it("stable source identity retains speaker/timestamp and changes on correction", () => {
    expect(ledger.evidence[0]).toMatchObject({
      speakerId: "Speaker 0",
      start: 0,
      end: 4,
    });
    expect(
      sourceLedger([{ id: "transcript", full_text: "Actually 1998" }]).version,
    ).not.toBe(ledger.version);
  });
  it("rejects invented source IDs or invented quotations", () => {
    expect(() => validateEvidence([issue], ledger)).not.toThrow();
    expect(() =>
      validateEvidence([{ ...issue, source_id: "invented" }], ledger),
    ).toThrow();
    expect(() =>
      validateEvidence([{ ...issue, source_quote: "2000" }], ledger),
    ).toThrow();
  });
  it("escalates mandatory triggers independently of audit percentage", () => {
    expect(needsPremium([issue], false)).toBe(true);
    expect(auditSelected("run", "chapter", 0)).toBe(false);
    expect(auditSelected("run", "chapter", 100)).toBe(true);
    expect(auditSelected("run", "chapter", 10)).toBe(
      auditSelected("run", "chapter", 10),
    );
  });
});
describe("Groq capability parity and native Live", () => {
  const env = {
    UPLOAD_TRANSCRIPTION_PROVIDER: "groq",
    GROQ_TRANSCRIPTION_ACCOUNTS: "a",
    GROQ_SINGLE_SPEAKER_UPLOAD_IDS: "u",
    GROQ_API_KEY: "test",
    GROQ_CAPABILITY_VERIFICATION: "fixture",
  };
  const needs = {
    bytes: 100,
    diarization: false,
    wordTimings: true,
    nativeLiveTranscript: false,
  };
  it("retains legacy for unknown/multiple-speaker and large recordings", () => {
    expect(selectTranscriptionProvider("a", "u", needs, env)).toBe("groq");
    expect(selectTranscriptionProvider("a", "unknown", needs, env)).toBe(
      "current",
    );
    expect(
      selectTranscriptionProvider(
        "a",
        "u",
        { ...needs, diarization: true },
        env,
      ),
    ).toBe("current");
    expect(
      selectTranscriptionProvider(
        "a",
        "u",
        { ...needs, bytes: 25_000_001 },
        env,
      ),
    ).toBe("current");
    expect(
      selectTranscriptionProvider(
        "a",
        "u",
        { ...needs, nativeLiveTranscript: true },
        env,
      ),
    ).toBe("native");
  });
  it("normalizes chunk offsets and preserves repeated speech at different timestamps", () => {
    const chunk = {
      offsetSeconds: 0,
      text: "Yes",
      duration: 2,
      segments: [{ start: 0, end: 1, text: "Yes" }],
      words: [{ start: 0, end: 1, word: "Yes" }],
    };
    const result = normalizeGroqChunks([
      chunk,
      chunk,
      { ...chunk, offsetSeconds: 2 },
    ]);
    expect(result.segments).toHaveLength(2);
    expect(result.full_text).toBe("Yes\n\nYes");
    expect(result.segments[1].words?.[0]).toMatchObject({ s: 2, e: 3 });
  });
  it("uses transcription, not translation, and requires word timing payload", async () => {
    vi.stubEnv("GROQ_API_KEY", "test");
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            text: "Hola",
            duration: 1,
            segments: [{ start: 0, end: 1, text: "Hola" }],
            words: [{ start: 0, end: 1, word: "Hola" }],
          }),
        ),
    );
    const out = await transcribeGroq(
      Buffer.from("fixture"),
      "audio/wav",
      undefined,
      fetcher,
    );
    expect(out.transcript.full_text).toBe("Hola");
    const args = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(args[0]).toContain("transcriptions");
    expect((args[1].body as FormData).has("language")).toBe(false);
  });
  it("deduplicates Live by event ID, preserves roles/corrections, and caps billable activity", () => {
    const event = {
      eventId: "e1",
      role: "user" as const,
      text: "1999",
      startMs: 0,
      endMs: 100,
    };
    const a = appendFragment([], event);
    expect(appendFragment(a, event)).toBe(a);
    const b = appendFragment(a, {
      ...event,
      eventId: "e2",
      text: "Actually, 1998",
      startMs: 101,
      endMs: 200,
    });
    expect(b).toHaveLength(2);
    expect(shouldCloseLive(31000, 0, 0, 300, 30000)).toBe(true);
    expect(shouldCloseLive(300000, 0, 300000, 300, 300000)).toBe(true);
    expect(shouldCloseLive(90001, 0, 90001, 300, 0)).toBe(true);
  });
  it("Live uses client delegation and denies browser model/config injection", () => {
    const config = liveConfig(
      "What happened?",
      [
        { role: "assistant", text: "Tell me" },
        { role: "user", text: "My story" },
      ],
      {},
    );
    expect(config.delegation).toEqual({ type: "client" });
    expect(config.client?.data_channel.allowed_client_events).toEqual([
      "session.close",
    ]);
    expect(config.input?.[0].role).toBe("assistant");
    expect(config.input?.[1].role).toBe("user");
  });
});

describe("provider billing boundaries", () => {
  it("keeps malformed optional usage unknown", () => {
    expect(
      normalizeUsage(
        "openai",
        {
          input_tokens: 10,
          output_tokens: 5,
          input_tokens_details: { cached_tokens: -1 },
        },
        price,
      ).usageStatus,
    ).toBe("unknown");
  });
  it("separates one-hour Claude cache writes and refuses an unpriced TTL", () => {
    const raw = {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 20,
      cache_creation: {
        ephemeral_1h_input_tokens: 10,
        ephemeral_5m_input_tokens: 10,
      },
    };
    expect(normalizeUsage("anthropic", raw, price).usageStatus).toBe("unknown");
    expect(
      normalizeUsage("anthropic", raw, { ...price, cacheWrite1h: 2 })
        .vendorCostUsd,
    ).toBeCloseTo(52.5 / 1e6);
  });
  it("applies long-context multipliers to the whole request only above the threshold", () => {
    const rates = {
      ...price,
      longContext: {
        threshold: 100,
        inputMultiplier: 2,
        outputMultiplier: 1.5,
      },
    };
    expect(
      normalizeUsage("openai", { input_tokens: 100, output_tokens: 10 }, rates)
        .vendorCostUsd,
    ).toBeCloseTo(120 / 1e6);
    expect(
      normalizeUsage(
        "openai",
        {
          input_tokens: 101,
          output_tokens: 10,
          input_tokens_details: { cached_tokens: 1 },
        },
        rates,
      ).vendorCostUsd,
    ).toBeCloseTo(230.2 / 1e6);
  });
  it("bills Groq's minimum per request without rounding longer audio", () => {
    expect(groqVendorCost(0.01, 0.04)).toBeCloseTo((10 / 3600) * 0.04);
    expect(groqVendorCost(12.25, 0.04)).toBeCloseTo((12.25 / 3600) * 0.04);
    expect(() => groqVendorCost(NaN, 0.04)).toThrow();
  });
});
