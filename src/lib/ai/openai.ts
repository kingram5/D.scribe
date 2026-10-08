import OpenAI from "openai";
import Ajv from "ajv";
import type {
  Response,
  ResponseCreateParamsStreaming,
} from "openai/resources/responses/responses";
import { openAIKey, type OpenAIRunConfig, type PrStage } from "./config";
import { normalizeUsage, vendorDollars, compatibleUsage } from "./usage";
import type { NextCallOptions, NextCallResult } from "@/lib/claude-next";
const validator = new Ajv({ strict: false, allErrors: true });
export function openAIClient() {
  return new OpenAI({ apiKey: openAIKey(), maxRetries: 0, timeout: 250_000 });
}
export function responseRequest(
  system: string,
  user: string,
  stage: PrStage,
  config: OpenAIRunConfig,
  opts: NextCallOptions,
): ResponseCreateParamsStreaming {
  return {
    model: config.stages[stage].model,
    instructions: system,
    input: [{ role: "user", content: user }],
    reasoning: { effort: config.stages[stage].effort },
    max_output_tokens: opts.maxTokens ?? 32000,
    service_tier: config.serviceTier,
    stream: true,
    store: false,
    ...(opts.jsonSchema
      ? {
          text: {
            format: {
              type: "json_schema" as const,
              name: `pr_${stage}`,
              strict: true,
              schema: opts.jsonSchema,
            },
          },
        }
      : {}),
  };
}
export interface ProviderOutcome {
  response: Response;
  requestId: string | null;
  result: NextCallResult | null;
  cost: number | null;
  error: string | null;
}
export function interpretResponse(
  response: Response,
  config: OpenAIRunConfig,
  opts: NextCallOptions,
): Omit<ProviderOutcome, "requestId"> {
  let cost: number | null = null;
  let result: NextCallResult | null = null;
  let error: string | null = null;
  try {
    const rate = config.rates[response.model];
    if (!rate || response.service_tier !== config.serviceTier)
      throw new Error(
        "Unpriced model or service tier; reconciliation required.",
      );
    if (!response.usage)
      throw new Error("Missing provider usage; reconciliation required.");
    const usage = normalizeUsage(response.usage);
    cost = vendorDollars(usage, rate);
    if (response.status !== "completed")
      throw new Error(
        `Provider response ${response.status ?? "unknown"}; no manuscript saved.`,
      );
    const messages = response.output.filter((item) => item.type === "message");
    if (messages.some((m) => m.content.some((c) => c.type === "refusal")))
      throw new Error("Provider refused this request.");
    const text = messages
      .flatMap((m) =>
        m.content.flatMap((c) => (c.type === "output_text" ? [c.text] : [])),
      )
      .join("");
    if (!text.trim()) throw new Error("Provider returned empty output.");
    if (opts.jsonSchema) {
      const parsed: unknown = JSON.parse(text);
      if (!validator.validate(opts.jsonSchema, parsed))
        throw new Error("Provider output failed the manuscript schema.");
    }
    result = { text, servedBy: response.model, usage: compatibleUsage(usage) };
  } catch (e) {
    error = e instanceof Error ? e.message : "Provider output invalid";
  }
  return { response, result, cost, error };
}
export async function executeResponse(
  system: string,
  user: string,
  stage: PrStage,
  config: OpenAIRunConfig,
  opts: NextCallOptions,
  attemptId: string,
  started: (id: string, requestId: string | null) => Promise<void>,
): Promise<ProviderOutcome> {
  const client = openAIClient();
  const { data: stream, request_id: requestId } = await client.responses
    .create(responseRequest(system, user, stage, config, opts), {
      signal: opts.signal,
      headers: { "X-Client-Request-Id": attemptId },
    })
    .withResponse();
  let final: Response | null = null;
  for await (const event of stream) {
    if (event.type === "response.created")
      await started(event.response.id, requestId ?? null);
    if (event.type === "response.output_text.delta") opts.onText?.(event.delta);
    if (
      event.type === "response.completed" ||
      event.type === "response.incomplete" ||
      event.type === "response.failed"
    )
      final = event.response;
    if (event.type === "error")
      throw new Error("Provider stream error; reconciliation required.");
  }
  if (!final)
    throw new Error(
      "Provider stream ended without a terminal response; reconciliation required.",
    );
  return {
    ...interpretResponse(final, config, opts),
    requestId: requestId ?? null,
  };
}
