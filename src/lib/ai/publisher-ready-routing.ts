import {
  AIError,
  type Route,
  type RoutingSnapshot,
  type Workload,
  type Price,
} from "./contracts";

const TARGETS = {
  interview: ["openai", "gpt-6-luna", "low", "THEO_BACKEND_MODEL"],
  organize: ["openai", "gpt-6-luna", "low", "MIXED_ORGANIZE_MODEL"],
  analysis: ["zai", "glm-5.3", "high", "MIXED_ANALYSIS_MODEL"],
  beats: ["zai", "glm-5.3-flash", "low", "MIXED_BEATS_MODEL"],
  draft: ["anthropic", "claude-sonnet-5-5", "medium", "MIXED_DRAFT_MODEL"],
  editor: ["zai", "glm-5.3", "high", "MIXED_EDITOR_MODEL"],
  premium_editor: [
    "anthropic",
    "claude-opus-5-5",
    "high",
    "MIXED_PREMIUM_EDITOR_MODEL",
  ],
  revision: [
    "anthropic",
    "claude-sonnet-5-5",
    "medium",
    "MIXED_REVISION_MODEL",
  ],
  coverage: ["openai", "gpt-6-luna", "low", "MIXED_CHECK_MODEL"],
  final_check: ["openai", "gpt-6-luna", "low", "MIXED_CHECK_MODEL"],
} as const;
export const workloads = Object.keys(TARGETS) as Workload[];
type Env = Record<string, string | undefined>;
export function inMixedCohort(
  actorId: string,
  env: Env = process.env,
): boolean {
  return (env.PUBLISHER_READY_MIXED_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(actorId);
}
export function mixedRequested(
  actorId: string,
  env: Env = process.env,
): boolean {
  return (
    env.PUBLISHER_READY_STACK === "mixed" &&
    env.PUBLISHER_READY_MIXED_ENABLED === "true" &&
    inMixedCohort(actorId, env)
  );
}
export function validateRoute(route: Route): void {
  const efforts =
    route.provider === "zai"
      ? ["low", "high", "max"]
      : route.provider === "anthropic"
        ? ["low", "medium", "high", "max"]
        : ["low", "medium", "high"];
  if (
    !efforts.includes(route.effort) ||
    !route.model ||
    !route.verification ||
    route.maximumAttempts < 1 ||
    route.maximumAttempts > 3 ||
    route.timeoutMs < 1000 ||
    route.timeoutMs > 240000
  )
    throw new AIError(
      "configuration",
      "Unsupported model capability or attempt limit",
    );
  const p = route.price;
  if (
    !p ||
    !p.version ||
    !p.source?.startsWith("https://") ||
    !Number.isFinite(Date.parse(p.verifiedAt)) ||
    p.serviceTier !== "default" ||
    (route.provider === "openai" &&
      route.model === "gpt-6-luna" &&
      !p.longContext) ||
    [
      p.input,
      p.output,
      p.cacheRead,
      p.cacheWrite,
      ...(p.cacheWrite1h === undefined ? [] : [p.cacheWrite1h]),
    ].some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0) ||
    (p.longContext &&
      (!Number.isSafeInteger(p.longContext.threshold) ||
        p.longContext.threshold < 1 ||
        !Number.isFinite(p.longContext.inputMultiplier) ||
        p.longContext.inputMultiplier < 1 ||
        !Number.isFinite(p.longContext.outputMultiplier) ||
        p.longContext.outputMultiplier < 1))
  )
    throw new AIError(
      "configuration",
      "Verified versioned vendor prices are required",
    );
}
/** No forecast rates shipped as facts. Operator evidence + prices are required to opt in. */
export function resolveMixedSnapshot(
  actorId: string,
  env: Env = process.env,
): RoutingSnapshot | null {
  if (!mixedRequested(actorId, env)) return null;
  if (env.INK_METER_V2 !== "true")
    throw new AIError(
      "configuration",
      "Mixed routing requires the existing v2 Ink policy",
    );
  let verified: Record<string, { evidence: string; price: Price }>;
  try {
    verified = JSON.parse(env.MIXED_VERIFIED_MODELS_JSON ?? "{}");
  } catch {
    throw new AIError("configuration", "Invalid model verification registry");
  }
  const routes = {} as Record<Workload, Route>;
  for (const work of workloads) {
    const [provider, defaultModel, effort, variable] = TARGETS[work];
    const model = env[variable] || defaultModel;
    const entry = verified[`${provider}/${model}`];
    if (!entry?.evidence || !entry.price)
      throw new AIError(
        "configuration",
        `Verify access, parameters and prices for ${provider}/${model} before enabling mixed routing`,
      );
    const key = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      zai: "ZAI_API_KEY",
    }[provider];
    if (!env[key])
      throw new AIError(
        "configuration",
        `${key} is required for selected routing`,
      );
    routes[work] = {
      provider,
      model,
      effort,
      timeoutMs: 120000,
      maximumAttempts: 3,
      price: entry.price,
      verification: entry.evidence,
    };
    validateRoute(routes[work]);
  }
  const auditPercent = Number(env.MIXED_AUDIT_PERCENT ?? 10);
  const maxOperationUsd = Number(env.MIXED_MAX_OPERATION_USD);
  if (
    !Number.isFinite(auditPercent) ||
    auditPercent < 0 ||
    auditPercent > 100 ||
    !Number.isFinite(maxOperationUsd) ||
    maxOperationUsd <= 0 ||
    maxOperationUsd > 100
  )
    throw new AIError(
      "configuration",
      "Set an explicit operation budget and valid audit percentage",
    );
  return {
    version: "mixed-v1",
    routes,
    auditPercent,
    maxOperationUsd,
    promptVersion: "source-fidelity-v1",
  };
}
export function readSnapshot(models: unknown): RoutingSnapshot | null {
  const value = (models as { mixed?: RoutingSnapshot } | null)?.mixed;
  if (!value) return null;
  if (value.version !== "mixed-v1")
    throw new AIError("configuration", "Unsupported pinned route version");
  for (const work of workloads) validateRoute(value.routes[work]);
  return value;
}
