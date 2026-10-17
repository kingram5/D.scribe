export type Provider = "openai" | "anthropic" | "zai";
export type Workload =
  | "interview"
  | "organize"
  | "analysis"
  | "beats"
  | "draft"
  | "editor"
  | "premium_editor"
  | "revision"
  | "coverage"
  | "final_check";
export type Schema = {
  type: string | readonly string[];
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: readonly unknown[];
};
export interface Route {
  provider: Provider;
  model: string;
  effort: string;
  timeoutMs: number;
  maximumAttempts: number;
  price: Price;
  verification: string;
}
export interface Price {
  version: string;
  source: string;
  verifiedAt: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  longContext?: {
    threshold: number;
    inputMultiplier: number;
    outputMultiplier: number;
  };
  serviceTier: "default";
}
export interface RoutingSnapshot {
  version: "mixed-v1";
  routes: Record<Workload, Route>;
  auditPercent: number;
  maxOperationUsd: number;
  promptVersion: "source-fidelity-v1";
}
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  rawUsage: unknown;
  usageStatus: "reported" | "unknown";
  vendorCostUsd?: number;
  priceVersion: string;
}
export interface TextRequest {
  system: string;
  user: string;
  maxTokens: number;
  schema?: Schema;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}
export interface TextResult {
  text: string;
  usage: Usage;
  providerRequestId?: string;
  model: string;
}
export class AIError extends Error {
  constructor(
    public code:
      | "configuration"
      | "retryable"
      | "reconcile"
      | "refused"
      | "incomplete"
      | "malformed"
      | "cancelled"
      | "review_needed",
    message: string,
    public usage?: Usage,
    public providerRequestId?: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/** Small strict validator for the schema subset used by the existing pipeline. */
export function validateSchema(
  value: unknown,
  schema: Schema,
  path = "$",
  depth = 0,
): void {
  if (depth > 30)
    throw new AIError("malformed", "Structured output is too deeply nested");
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (
    !types.some(
      (t) =>
        t === actual ||
        (t === "integer" &&
          typeof value === "number" &&
          Number.isSafeInteger(value)),
    )
  )
    throw new AIError("malformed", `Invalid output type at ${path}`);
  if (schema.enum && !schema.enum.includes(value))
    throw new AIError("malformed", `Invalid enum at ${path}`);
  if (typeof value === "number" && !Number.isFinite(value))
    throw new AIError("malformed", `Invalid number at ${path}`);
  if (Array.isArray(value)) {
    if (!schema.items)
      throw new AIError("configuration", "Array schema requires items");
    value.forEach((v, i) =>
      validateSchema(v, schema.items!, `${path}[${i}]`, depth + 1),
    );
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!(key in obj))
        throw new AIError("malformed", `Missing ${path}.${key}`);
    for (const [key, v] of Object.entries(obj)) {
      if (schema.properties?.[key])
        validateSchema(v, schema.properties[key], `${path}.${key}`, depth + 1);
      else if (schema.additionalProperties === false)
        throw new AIError("malformed", `Unexpected ${path}.${key}`);
    }
  }
}
