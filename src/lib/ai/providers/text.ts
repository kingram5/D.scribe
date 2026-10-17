import {
  AIError,
  validateSchema,
  type Route,
  type TextRequest,
  type TextResult,
} from "../contracts";
import { validateRoute } from "../publisher-ready-routing";
import { normalizeUsage } from "../usage/normalize";

const ENDPOINTS = {
  openai: "https://api.openai.com/v1/responses",
  anthropic: "https://api.anthropic.com/v1/messages",
  zai: "https://api.z.ai/api/paas/v4/chat/completions",
};
export function buildTextRequest(
  route: Route,
  req: TextRequest,
): Record<string, unknown> {
  validateRoute(route);
  if (
    !Number.isSafeInteger(req.maxTokens) ||
    req.maxTokens <= 0 ||
    req.maxTokens > 64000
  )
    throw new AIError("configuration", "Invalid output limit");
  if (route.provider === "openai")
    return {
      model: route.model,
      instructions: req.system,
      input: req.user,
      store: false,
      stream: true,
      reasoning: { effort: route.effort },
      max_output_tokens: req.maxTokens,
      service_tier: "default",
      ...(req.schema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: "publisher_ready",
                strict: true,
                schema: req.schema,
              },
            },
          }
        : {}),
    };
  if (route.provider === "anthropic")
    return {
      model: route.model,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      thinking: { type: "adaptive" },
      output_config: {
        effort: route.effort,
        ...(req.schema
          ? { format: { type: "json_schema", schema: req.schema } }
          : {}),
      },
      max_tokens: req.maxTokens,
      service_tier: "standard_only",
      stream: true,
    };
  return {
    model: route.model,
    messages: [
      { role: "system", content: req.system },
      {
        role: "user",
        content:
          req.user +
          (req.schema
            ? `\nReturn JSON matching this schema: ${JSON.stringify(req.schema)}`
            : ""),
      },
    ],
    thinking: { type: "enabled" },
    reasoning_effort: route.effort,
    max_tokens: req.maxTokens,
    stream: true,
    ...(req.schema ? { response_format: { type: "json_object" } } : {}),
  };
}

/** SSE parsing handles split UTF-8, CRLF, multiple data lines and an unterminated last frame. */
export async function* sse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return null;
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      throw new AIError("malformed", "Invalid provider event");
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const event = parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event) yield event;
      }
      if (done) {
        if (buffer.trim()) {
          const event = parse(buffer);
          if (event) yield event;
        }
        break;
      }
      if (buffer.length > 4_000_000)
        throw new AIError("malformed", "Provider event exceeds limit");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** One paid attempt. Retry/settlement belong to the durable operation wrapper. */
export async function generateText(
  route: Route,
  req: TextRequest,
  transport: typeof fetch = fetch,
): Promise<TextResult> {
  const body = buildTextRequest(route, req);
  const key =
    process.env[
      {
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        zai: "ZAI_API_KEY",
      }[route.provider]
    ];
  if (!key)
    throw new AIError(
      "configuration",
      "Selected provider credential is missing",
    );
  const headers: Record<string, string> =
    route.provider === "anthropic"
      ? {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        }
      : { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  let raw: Record<string, unknown> = {};
  let requestId: string | undefined;
  let servedModel = route.model;
  let text = "";
  let complete = false;
  let refused = false;
  let incomplete = false;
  const signal = AbortSignal.any([
    AbortSignal.timeout(route.timeoutMs),
    ...(req.signal ? [req.signal] : []),
  ]);
  try {
    const res = await transport(ENDPOINTS[route.provider], {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    requestId =
      res.headers.get("x-request-id") ??
      res.headers.get("request-id") ??
      undefined;
    if (!res.ok) {
      await res.body?.cancel();
      throw new AIError(
        res.status === 429
          ? "retryable"
          : res.status >= 500
            ? "reconcile"
            : "configuration",
        `Provider HTTP ${res.status}`,
        undefined,
        requestId,
      );
    }
    if (!res.body)
      throw new AIError("reconcile", "Provider returned no stream");
    for await (const event of sse(res.body)) {
      // Provider envelopes are checked before their contents become persisted application data.
      const e = event as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const reportedModel = e.response?.model ?? e.message?.model ?? e.model;
      if (typeof reportedModel === "string") servedModel = reportedModel;
      let delta = "";
      if (route.provider === "openai") {
        if (e.type === "response.output_text.delta")
          delta = typeof e.delta === "string" ? e.delta : "";
        if (e.type === "response.refusal.delta") refused = true;
        if (e.response?.usage) raw = e.response.usage;
        if (e.type === "response.completed") complete = true;
        if (e.type === "response.incomplete") incomplete = true;
        if (e.type === "response.failed" || e.type === "error")
          throw new AIError("reconcile", "Provider response failed");
      } else if (route.provider === "anthropic") {
        if (e.type === "message_start") raw = { ...raw, ...e.message?.usage };
        if (e.type === "content_block_delta" && e.delta?.type === "text_delta")
          delta = e.delta.text;
        if (e.type === "message_delta") {
          raw = { ...raw, ...e.usage };
          refused ||= e.delta?.stop_reason === "refusal";
          incomplete ||= e.delta?.stop_reason === "max_tokens";
          complete ||= e.delta?.stop_reason === "end_turn";
        }
        if (e.type === "error")
          throw new AIError("reconcile", "Provider stream failed");
      } else {
        if (e.usage) raw = e.usage;
        const choice = e.choices?.[0];
        if (typeof choice?.delta?.content === "string")
          delta = choice.delta.content;
        refused ||=
          Boolean(choice?.delta?.refusal) ||
          choice?.finish_reason === "content_filter" ||
          choice?.finish_reason === "sensitive";
        complete ||= choice?.finish_reason === "stop";
        incomplete ||=
          choice?.finish_reason === "length" ||
          choice?.finish_reason === "model_context_window_exceeded";
        if (e.error) throw new AIError("reconcile", "Provider stream failed");
      }
      text += delta;
      if (text.length > 1_000_000)
        throw new AIError("malformed", "Provider output exceeds limit");
      // Existing progress channel only; partial output is never saved as a manuscript.
      if (delta) req.onText?.(delta);
    }
    if (servedModel !== route.model)
      throw new AIError(
        "reconcile",
        "Provider served a model different from the pinned route",
      );
    if (refused)
      throw new AIError("refused", "Provider declined the operation");
    if (incomplete || !complete)
      throw new AIError("incomplete", "Provider output did not complete");
    if (!text.trim())
      throw new AIError("malformed", "Provider returned empty output");
    if (req.schema) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AIError("malformed", "Provider returned invalid JSON");
      }
      validateSchema(parsed, req.schema);
    }
    return {
      text,
      usage: normalizeUsage(route.provider, raw, route.price),
      providerRequestId: requestId,
      model: route.model,
    };
  } catch (err) {
    const failure =
      err instanceof AIError
        ? err
        : new AIError(
            req.signal?.aborted ? "cancelled" : "reconcile",
            "Provider transport interrupted; reconcile before retry",
          );
    failure.usage = normalizeUsage(route.provider, raw, route.price);
    if (servedModel !== route.model)
      failure.usage = {
        ...failure.usage,
        usageStatus: "unknown",
        vendorCostUsd: undefined,
      };
    failure.providerRequestId = requestId;
    throw failure;
  }
}
