import type { Provider, Price, Usage } from "../contracts";
const count = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
export function normalizeUsage(
  provider: Provider,
  raw: unknown,
  price: Price,
): Usage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const input = count(provider === "zai" ? u.prompt_tokens : u.input_tokens);
  const output = count(
    provider === "zai" ? u.completion_tokens : u.output_tokens,
  );
  const details = (
    provider === "zai" ? u.prompt_tokens_details : u.input_tokens_details
  ) as Record<string, unknown> | undefined;
  const outDetails = (
    provider === "zai" ? u.completion_tokens_details : u.output_tokens_details
  ) as Record<string, unknown> | undefined;
  const cached =
    count(
      provider === "anthropic"
        ? u.cache_read_input_tokens
        : details?.cached_tokens,
    ) ?? 0;
  const written =
    count(
      provider === "openai"
        ? details?.cache_write_tokens
        : u.cache_creation_input_tokens,
    ) ?? 0;
  const reasoning = count(outDetails?.reasoning_tokens);
  const creation = u.cache_creation as Record<string, unknown> | undefined;
  const oneHour =
    provider === "anthropic"
      ? (count(creation?.ephemeral_1h_input_tokens) ?? 0)
      : 0;
  const optionalCounts = [
    provider === "anthropic"
      ? u.cache_read_input_tokens
      : details?.cached_tokens,
    provider === "openai"
      ? details?.cache_write_tokens
      : u.cache_creation_input_tokens,
    outDetails?.reasoning_tokens,
    ...(provider === "anthropic"
      ? [
          creation?.ephemeral_1h_input_tokens,
          creation?.ephemeral_5m_input_tokens,
        ]
      : []),
  ];
  const validOptional = optionalCounts.every(
    (v) => v == null || count(v) !== undefined,
  );
  const totalInput =
    provider === "anthropic" ? (input ?? 0) + cached + written : (input ?? 0);
  const long =
    price.longContext && totalInput > price.longContext.threshold
      ? price.longContext
      : undefined;
  // Claude's input excludes cache reads/writes; OpenAI/Z.ai counts include cache.
  const uncached =
    input === undefined
      ? undefined
      : provider === "anthropic"
        ? input
        : input - cached - written;
  const known =
    validOptional &&
    oneHour <= written &&
    (oneHour === 0 || price.cacheWrite1h !== undefined) &&
    uncached !== undefined &&
    uncached >= 0 &&
    output !== undefined &&
    (reasoning === undefined || reasoning <= output);
  return {
    inputTokens: uncached,
    outputTokens: output,
    cachedInputTokens: cached,
    cacheWriteTokens: written,
    reasoningTokens: reasoning,
    rawUsage: raw ?? null,
    priceVersion: price.version,
    usageStatus: known ? "reported" : "unknown",
    vendorCostUsd: known
      ? ((uncached! * price.input +
          cached * price.cacheRead +
          (written - oneHour) * price.cacheWrite +
          oneHour * (price.cacheWrite1h ?? 0)) *
          (long?.inputMultiplier ?? 1) +
          output! * price.output * (long?.outputMultiplier ?? 1)) /
        1e6
      : undefined,
  };
}
