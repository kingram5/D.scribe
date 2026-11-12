/**
 * Claude 5-series client for the Publisher-Ready pipeline.
 *
 * Kept separate from claude-lite.ts on purpose: the 5-series models reject any
 * sampling parameter (temperature/top_p/top_k return a 400) and run adaptive
 * thinking controlled by `effort`, while every existing caller still sends a
 * temperature to Sonnet 4.6. Raw fetch, same as claude-lite (the SDK was
 * dropped for its memory footprint on Vercel).
 */

import { logger } from "@/lib/logger";
import type { ClaudeUsage } from "@/lib/claude-lite";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
/** Server-side refusal fallback, routed by refusal category (Fable / Opus). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Keys double as the `ink_rates.model` rows added in migration 029. */
export type NextModelKey = "sonnet5" | "opus55" | "fable51";

export const NEXT_MODELS: Record<NextModelKey, string> = {
  sonnet5: "claude-sonnet-5",
  opus55: "claude-opus-5-5",
  fable51: "claude-fable-5-1",
};

/** Vendor list prices, $ per million tokens. Mirrors ink_rates (029) for estimates. */
export const NEXT_RATES: Record<NextModelKey, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  sonnet5: { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 4 },
  opus55: { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 8 },
  fable51: { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 20 },
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface NextCallOptions {
  model: NextModelKey;
  effort: Effort;
  maxTokens?: number;
  /** JSON schema for structured output (output_config.format). */
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Called with each text delta while streaming. */
  onText?: (delta: string) => void;
}

export interface NextCallResult {
  text: string;
  usage: ClaudeUsage;
  /** The model that actually served the turn (differs after a refusal fallback). */
  servedBy: string;
}

export class RefusalError extends Error {
  constructor(public category: string | null) {
    super(`The model declined this request${category ? ` (${category})` : ""}.`);
    this.name = "RefusalError";
  }
}

/** Build the request body. Exported for tests: it must never carry sampling params. */
export function buildNextRequest(system: string, user: string, opts: NextCallOptions): Record<string, unknown> {
  const outputConfig: Record<string, unknown> = { effort: opts.effort };
  if (opts.jsonSchema) outputConfig.format = { type: "json_schema", schema: opts.jsonSchema };
  const body: Record<string, unknown> = {
    model: NEXT_MODELS[opts.model],
    max_tokens: opts.maxTokens ?? 32000,
    stream: true,
    thinking: { type: "adaptive" },
    output_config: outputConfig,
    system,
    messages: [{ role: "user", content: user }],
  };
  // Memoir material touches grief, abuse, illness; a classifier decline should
  // re-run on the recommended fallback instead of failing the author's book.
  if (opts.model === "fable51" || opts.model === "opus55") body.fallbacks = "default";
  return body;
}

/**
 * One streamed call. Streaming is used for every step (long chapters, long
 * thinking) so no request hits an HTTP timeout; text deltas go to onText.
 */
export async function callClaudeNext(system: string, user: string, opts: NextCallOptions): Promise<NextCallResult> {
  const body = buildNextRequest(system, user, opts);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": API_VERSION,
  };
  if (body.fallbacks) headers["anthropic-beta"] = FALLBACK_BETA;

  const res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(body), signal: opts.signal });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    const message = `Claude API ${res.status}: ${err.slice(0, 200)}`;
    logger.error(message, { meta: { status: res.status, model: body.model, body: err.slice(0, 500) } });
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let servedBy = String(body.model);
  let stopReason: string | null = null;
  let refusalCategory: string | null = null;
  const usage: ClaudeUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      let event: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { event = JSON.parse(data); } catch { continue; }

      if (event.type === "message_start" && event.message) {
        if (event.message.model) servedBy = event.message.model;
        const u = event.message.usage || {};
        usage.input_tokens += u.input_tokens || 0;
        usage.cache_read_input_tokens = (usage.cache_read_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        usage.cache_creation_input_tokens = (usage.cache_creation_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        text += event.delta.text;
        opts.onText?.(event.delta.text);
      } else if (event.type === "message_delta") {
        if (event.usage?.output_tokens != null) usage.output_tokens = event.usage.output_tokens;
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.delta?.stop_details?.category !== undefined) refusalCategory = event.delta.stop_details.category;
      } else if (event.type === "error") {
        throw new Error(`Claude stream error: ${event.error?.type || "unknown"} ${event.error?.message || ""}`.trim());
      }
    }
  }

  if (stopReason === "refusal") throw new RefusalError(refusalCategory);
  if (stopReason === "max_tokens") logger.warn("claude-next hit max_tokens", { meta: { model: body.model } });
  return { text, usage, servedBy };
}

/** Vendor dollars for a usage record at list price. */
export function usageDollars(model: NextModelKey, u: ClaudeUsage): number {
  const r = NEXT_RATES[model];
  return (
    (u.input_tokens * r.in +
      u.output_tokens * r.out +
      (u.cache_read_input_tokens || 0) * r.cacheRead +
      (u.cache_creation_input_tokens || 0) * r.cacheWrite) /
    1_000_000
  );
}

/** Parse a structured-output reply; throws a named error on bad JSON. */
export function parseJsonReply<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error("Model returned malformed JSON");
  }
}
