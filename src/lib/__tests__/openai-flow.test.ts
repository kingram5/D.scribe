import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response } from "openai/resources/responses/responses";
const sdk = vi.hoisted(() => ({
  responses: [] as unknown[],
  requests: [] as unknown[],
}));
vi.mock("openai", () => ({
  default: class {
    responses = {
      create: (request: unknown) => {
        sdk.requests.push(request);
        const response = sdk.responses.shift();
        return {
          withResponse: async () => ({
            request_id: "fixture-request",
            data: (async function* () {
              yield { type: "response.created", response };
              yield { type: "response.completed", response };
            })(),
          }),
        };
      },
    };
  },
}));
import { withEvaluationProvider } from "../ai/execution";
import { validateRunConfig, PR_STAGES } from "../ai/config";
import {
  coreDraft,
  coreEdit,
  coreRevise,
  coreFinal,
  type ChapterInput,
} from "../publisher-ready/core";
import { RUBRIC } from "../publisher-ready/rubric";
const config = validateRunConfig({
  version: 1,
  provider: "openai",
  serviceTier: "default",
  priceVersion: "fixture",
  rates: {
    "gpt-6.1-sol": { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 },
    "gpt-6-astra": { input: 10, cached: 1, cacheWrite: 12.5, output: 50 },
  },
  stages: Object.fromEntries(
    PR_STAGES.map((s) => [
      s,
      {
        model: s === "edit" ? "gpt-6-astra" : "gpt-6.1-sol",
        effort: s === "edit" ? "high" : "medium",
      },
    ]),
  ),
});
function output(text: string, model = "gpt-6.1-sol") {
  return {
    id: "r" + sdk.responses.length,
    model,
    service_tier: "default",
    status: "completed",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 10 },
    },
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  } as unknown as Response;
}
beforeEach(() => {
  sdk.responses = [];
  sdk.requests = [];
  vi.stubEnv("DSCRIBE_OPENAI_API_KEY", "fixture-only");
});
describe("production core with Responses adapter (synthetic source, no vendor calls)", () => {
  it.each([
    [
      "memoir",
      'Dad said, "We are not selling the farm." We stayed and repaired the fence.',
    ],
    [
      "nonfiction",
      'The instructor said, "Disconnect power first." We verified the switch before maintenance.',
    ],
  ])(
    "preserves %s source through draft, review, revision and conditional final check",
    async (kind, source) => {
      const input: ChapterInput = {
        projectTitle: "Synthetic contract fixture",
        audience: "General",
        voiceProfile: null,
        styleMemoryBlock: "",
        chapterNumber: 1,
        chapterTitle: kind,
        chapterSummary: "A practical moment",
        keyPoints: [],
        previousChapters: [],
        excerpts: source,
        targetWords: 500,
      };
      sdk.responses.push(
        output(
          JSON.stringify({
            beats: [
              {
                id: "b1",
                what_happens: "A moment from the source",
                source_quote: source,
              },
            ],
          }),
        ),
        output(source),
        output(
          JSON.stringify({
            author_questions: [],
            craft_notes: [],
            scores: Object.fromEntries(RUBRIC.map((r) => [r.key, 1])),
            summary: "Source respected.",
          }),
          "gpt-6-astra",
        ),
        output(JSON.stringify({ chapter: source, change_log: [] })),
      );
      const stages: string[] = [];
      await withEvaluationProvider(
        config,
        () => {},
        async (stage, out) => {
          stages.push(stage);
          expect(out.cost).toBeGreaterThan(0);
        },
        async () => {
          const draft = await coreDraft(input);
          const review = await coreEdit(input, draft.text, draft.beats, {});
          expect(review.report.author_questions).toEqual([]);
          const revision = await coreRevise(input, draft.text, [], []);
          const final = await coreFinal(revision.text, {});
          expect(final.text).toBe(source);
          expect(final.spend).toEqual([]);
        },
      );
      expect(stages).toEqual(["beats", "draft", "edit", "revise"]);
      expect(sdk.requests).toHaveLength(4);
    },
  );
});
