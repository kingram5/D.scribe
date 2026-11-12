import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createServerClient: () => ({}) }));
vi.mock("next/server", () => ({ after: () => {}, NextResponse: { json: () => ({}) } }));

import { applyEdits } from "../publisher-ready/pipeline";
import { buildNextRequest, usageDollars } from "../claude-next";
import { estimateRunInk, estimateChapterUsd } from "../publisher-ready/estimate";
import { rubricTotal, bandFor, RUBRIC } from "../publisher-ready/rubric";
import { EDITOR_SCHEMA } from "../publisher-ready/prompts";

describe("5-series request builder", () => {
  it("never sends sampling parameters and always sets effort + adaptive thinking", () => {
    for (const model of ["sonnet5", "opus55", "fable51"] as const) {
      const body = buildNextRequest("sys", "user", { model, effort: "high" });
      expect(body).not.toHaveProperty("temperature");
      expect(body).not.toHaveProperty("top_p");
      expect(body).not.toHaveProperty("top_k");
      expect(body.thinking).toEqual({ type: "adaptive" });
      expect((body.output_config as { effort: string }).effort).toBe("high");
    }
  });

  it("uses exact model ids and turns on refusal fallback for Fable and Opus only", () => {
    expect(buildNextRequest("s", "u", { model: "fable51", effort: "high" }).model).toBe("claude-fable-5-1");
    expect(buildNextRequest("s", "u", { model: "opus55", effort: "high" }).model).toBe("claude-opus-5-5");
    expect(buildNextRequest("s", "u", { model: "sonnet5", effort: "low" }).model).toBe("claude-sonnet-5");
    expect(buildNextRequest("s", "u", { model: "fable51", effort: "high" }).fallbacks).toBe("default");
    expect(buildNextRequest("s", "u", { model: "sonnet5", effort: "low" })).not.toHaveProperty("fallbacks");
  });

  it("puts structured output under output_config.format", () => {
    const body = buildNextRequest("s", "u", { model: "fable51", effort: "high", jsonSchema: { type: "object" } });
    expect((body.output_config as { format: unknown }).format).toEqual({ type: "json_schema", schema: { type: "object" } });
  });

  it("prices usage at list rates", () => {
    expect(usageDollars("fable51", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(60);
    expect(usageDollars("sonnet5", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(2);
  });
});

describe("final-check edit applier", () => {
  it("applies unique edits", () => {
    const r = applyEdits("The rain came down hard. We waited.", [{ find: "The rain came down hard.", replace: "Rain hammered the roof." }]);
    expect(r).toEqual({ text: "Rain hammered the roof. We waited.", applied: 1, rejected: 0 });
  });

  it("skips edits whose find text is missing or ambiguous", () => {
    const text = "We waited. We waited.";
    expect(applyEdits(text, [{ find: "We waited.", replace: "Nothing." }]).applied).toBe(0);
    expect(applyEdits(text, [{ find: "absent", replace: "x" }]).applied).toBe(0);
  });

  it("refuses to change quoted speech", () => {
    const text = 'Dad said, "We are not selling the farm." Then he left.';
    const r = applyEdits(text, [{ find: 'Dad said, "We are not selling the farm."', replace: 'Dad said, "We will keep the farm."' }]);
    expect(r.applied).toBe(0);
    const ok = applyEdits(text, [{ find: 'Dad said, "We are not selling the farm." Then he left.', replace: 'Dad said, "We are not selling the farm." He left.' }]);
    expect(ok.applied).toBe(1);
  });
});

describe("run estimate", () => {
  it("lands a 40k-word, 12-chapter book near 1,100 Ink", () => {
    const chapters = Array.from({ length: 12 }, () => ({ target_word_count: 3333 }));
    const ink = estimateRunInk(chapters);
    expect(ink).toBeGreaterThan(1000);
    expect(ink).toBeLessThan(1250);
  });

  it("scales with length", () => {
    expect(estimateChapterUsd(6000)).toBeGreaterThan(estimateChapterUsd(2000));
  });
});

describe("rubric", () => {
  it("editor schema requires every rubric criterion", () => {
    expect(EDITOR_SCHEMA.properties.scores.required).toEqual(RUBRIC.map((c) => c.key));
  });

  it("totals and bands clamp to 0-2 per criterion", () => {
    const all2 = Object.fromEntries(RUBRIC.map((c) => [c.key, 2]));
    const all0 = Object.fromEntries(RUBRIC.map((c) => [c.key, 0]));
    expect(rubricTotal({ ...all2, hook: 9 })).toBe(RUBRIC.length * 2);
    expect(bandFor(all2)).toBe("Publisher-ready");
    expect(bandFor(all0)).toBe("Needs work");
  });
});
