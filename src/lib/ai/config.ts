/** Server-owned, immutable configuration saved in pr_runs.models. */
export const PR_STAGES = [
  "beats",
  "draft",
  "edit",
  "coverage",
  "interview",
  "revise",
  "final",
  "voice_pairs",
  "voice_anchor",
] as const;
export type PrStage = (typeof PR_STAGES)[number];
export interface ModelRate {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
}
export interface OpenAIRunConfig {
  version: 1;
  provider: "openai";
  serviceTier: "default";
  priceVersion: string;
  rates: Record<string, ModelRate>;
  stages: Record<PrStage, { model: string; effort: "low" | "medium" | "high" }>;
}
export class ProviderUnavailable extends Error {}
export function openAIKey(): string {
  const key = process.env.DSCRIBE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key)
    throw new ProviderUnavailable(
      "OpenAI is not configured. Continue with the existing provider.",
    );
  return key;
}
export function cohortAllows(userId: string): boolean {
  return (process.env.OPENAI_PR_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(userId);
}
export function validateRunConfig(value: unknown): OpenAIRunConfig {
  const c = value as OpenAIRunConfig;
  if (
    !c ||
    c.version !== 1 ||
    c.provider !== "openai" ||
    c.serviceTier !== "default" ||
    !c.priceVersion ||
    !c.rates ||
    !c.stages
  )
    throw new ProviderUnavailable("Unsupported saved provider configuration.");
  for (const stage of PR_STAGES) {
    const m = c.stages[stage];
    const r = m && c.rates[m.model];
    if (
      !m ||
      !["low", "medium", "high"].includes(m.effort) ||
      !r ||
      ![r.input, r.cached, r.cacheWrite, r.output].every(
        (n) => Number.isFinite(n) && n >= 0,
      ) ||
      r.input === 0 ||
      r.output === 0
    )
      throw new ProviderUnavailable(
        `Missing verified rate or model for ${stage}.`,
      );
  }
  return c;
}
export function newRunConfig(userId: string): OpenAIRunConfig | null {
  if ((process.env.PUBLISHER_READY_TEXT_PROVIDER ?? "legacy") === "legacy")
    return null;
  if (process.env.PUBLISHER_READY_TEXT_PROVIDER !== "openai")
    throw new ProviderUnavailable("Unknown Publisher-Ready provider.");
  if (!cohortAllows(userId)) return null;
  openAIKey();
  // No shipped guessed prices: operators supply the verified, dated standard rate card.
  let card: { version: string; models: Record<string, ModelRate> };
  try {
    card = JSON.parse(process.env.OPENAI_PR_RATE_CARD ?? "");
  } catch {
    throw new ProviderUnavailable(
      "OpenAI rate card must be verified and configured before use.",
    );
  }
  if (!card || typeof card.version !== "string" || !card.models)
    throw new ProviderUnavailable("Invalid OpenAI rate card.");
  const sol =
    process.env.OPENAI_PUBLISHER_READY_STANDARD_MODEL || "gpt-6.1-sol";
  const astra =
    process.env.OPENAI_PUBLISHER_READY_EDITOR_MODEL || "gpt-6-astra";
  return validateRunConfig({
    version: 1,
    provider: "openai",
    serviceTier: "default",
    priceVersion: card.version,
    rates: card.models,
    stages: {
      beats: { model: sol, effort: "low" },
      draft: { model: sol, effort: "medium" },
      edit: { model: astra, effort: "high" },
      coverage: { model: sol, effort: "low" },
      interview: { model: sol, effort: "low" },
      revise: { model: sol, effort: "high" },
      final: { model: sol, effort: "medium" },
      voice_pairs: { model: sol, effort: "medium" },
      voice_anchor: { model: sol, effort: "low" },
    },
  });
}
export function savedRunConfig(models: unknown): OpenAIRunConfig | null {
  if (models && typeof models === "object" && "provider" in models)
    return validateRunConfig(models);
  return null; // pre-migration runs remain legacy
}
