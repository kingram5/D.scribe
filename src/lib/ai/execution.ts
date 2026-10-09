import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase";
import { ensureBalance } from "@/lib/ink";
import {
  callClaudeNext,
  type NextCallOptions,
  type NextCallResult,
} from "@/lib/claude-next";
import {
  openAIKey,
  savedRunConfig,
  type OpenAIRunConfig,
  type PrStage,
} from "./config";
import { executeResponse, type ProviderOutcome } from "./openai";
interface Context {
  runId: string;
  userId: string;
  config: OpenAIRunConfig;
  signal?: AbortSignal;
}
const context = new AsyncLocalStorage<Context>();
interface Evaluation {
  config: OpenAIRunConfig;
  before: (maximumUsd: number) => void;
  observed: (stage: PrStage, outcome: ProviderOutcome) => Promise<void>;
}
const evaluation = new AsyncLocalStorage<Evaluation>();
/** Evaluation calls use the exact production adapter but never touch a customer wallet. */
export function withEvaluationProvider<T>(
  config: OpenAIRunConfig,
  before: Evaluation["before"],
  observed: Evaluation["observed"],
  action: () => Promise<T>,
) {
  return evaluation.run({ config, before, observed }, action);
}
export function maximumCallUsd(
  system: string,
  user: string,
  opts: NextCallOptions,
  stage: PrStage,
  config: OpenAIRunConfig,
) {
  const rate = config.rates[config.stages[stage].model];
  const inputBound =
    Buffer.byteLength(system + user + JSON.stringify(opts.jsonSchema ?? {})) +
    2048;
  return (
    (inputBound *
      Math.max(rate.input, rate.cacheWrite, rate.cached) *
      (inputBound > 272000 ? 2 : 1) +
      (opts.maxTokens ?? 32000) *
        rate.output *
        (inputBound > 272000 ? 1.5 : 1)) /
    1e6
  );
}
export function isProviderMetered() {
  return !!context.getStore();
}
export async function withRunProvider<T>(
  userId: string,
  runId: string,
  action: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const { data, error } = await createServerClient()
    .from("pr_runs")
    .select("models")
    .eq("id", runId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("Run not found");
  const config = savedRunConfig(data.models);
  return config
    ? context.run({ userId, runId, config, signal }, action)
    : action();
}
export async function callPublisherModel(
  system: string,
  user: string,
  opts: NextCallOptions & { stage: PrStage },
): Promise<NextCallResult> {
  const sample = evaluation.getStore();
  if (sample) {
    sample.before(
      maximumCallUsd(system, user, opts, opts.stage, sample.config),
    );
    const out = await executeResponse(
      system,
      user,
      opts.stage,
      sample.config,
      opts,
      randomUUID(),
      async () => {},
    );
    await sample.observed(opts.stage, out);
    if (out.error || !out.result)
      throw new Error(out.error || "Evaluation response incomplete");
    return out.result;
  }
  const ctx = context.getStore();
  if (!ctx) return callClaudeNext(system, user, opts);
  openAIKey();
  (opts.signal ?? ctx.signal)?.throwIfAborted();
  const db = createServerClient();
  const selection = ctx.config.stages[opts.stage];
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        opts.stage,
        selection,
        system,
        user,
        opts.maxTokens,
        opts.jsonSchema,
        ctx.config.priceVersion,
      ]),
    )
    .digest("hex");
  // UTF-8 bytes conservatively bound tokens; reserve output including reasoning.
  const maxUsd = maximumCallUsd(system, user, opts, opts.stage, ctx.config);
  await ensureBalance(ctx.userId);
  const claim = await db.rpc("pr_begin_ai_call", {
    p_run_id: ctx.runId,
    p_user_id: ctx.userId,
    p_call_key: key,
    p_stage: opts.stage,
    p_model: selection.model,
    p_price_version: ctx.config.priceVersion,
    p_max_usd: maxUsd,
  });
  if (claim.error) throw new Error(claim.error.message);
  let call = claim.data.call;
  if (claim.data.existing) {
    if (call.state === "observed") {
      const settled = await db.rpc("pr_settle_ai_call", { p_id: call.id });
      if (settled.error) throw new Error(settled.error.message);
      call = settled.data;
    }
    if (call.state === "settled" && call.result)
      return call.result as NextCallResult;
    throw new Error(
      call.failure ||
        "This model attempt is running or needs reconciliation. It will not be purchased twice.",
    );
  }
  let outcome;
  try {
    outcome = await executeResponse(
      system,
      user,
      opts.stage,
      ctx.config,
      { ...opts, signal: opts.signal ?? ctx.signal },
      call.id,
      async (responseId, requestId) => {
        const saved = await db
          .from("pr_ai_calls")
          .update({ response_id: responseId, request_id: requestId })
          .eq("id", call.id);
        if (saved.error)
          throw new Error("Could not save provider response identifier");
      },
    );
  } catch (e) {
    // No terminal usage: keep the reservation and block a blind paid retry.
    const failure =
      "Provider transport interrupted; reconcile this attempt before retrying.";
    const marked = await db
      .from("pr_ai_calls")
      .update({ state: "reconciliation", failure })
      .eq("id", call.id);
    if (marked.error)
      throw new Error(
        "Provider attempt interrupted and reconciliation marker failed; reservation remains held.",
      );
    throw e;
  }
  const observed = await db.rpc("pr_observe_ai_call", {
    p_id: call.id,
    p_response_id: outcome.response.id,
    p_request_id: outcome.requestId,
    p_usd: outcome.cost,
    p_usage: outcome.response.usage ?? null,
    p_result: outcome.result,
    p_failure: outcome.error,
  });
  if (observed.error)
    throw new Error(
      "Could not persist provider usage; reservation remains held for reconciliation.",
    );
  if (outcome.cost !== null) {
    const settled = await db.rpc("pr_settle_ai_call", { p_id: call.id });
    if (settled.error)
      throw new Error(`Settlement pending: ${settled.error.message}`);
  }
  if (outcome.error || !outcome.result)
    throw new Error(outcome.error || "Provider output unavailable");
  return outcome.result;
}

/** Claim the paid stage before calling the vendor; never blindly replay a partial save. */
export async function withChapterStep<T>(
  userId: string,
  runId: string,
  chapterId: string,
  step: string,
  action: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return withRunProvider(
    userId,
    runId,
    async () => {
      if (!isProviderMetered()) return action();
      const db = createServerClient();
      const claim = await db.rpc("pr_claim_step", {
        p_run_id: runId,
        p_chapter_id: chapterId,
        p_step: step,
        p_user_id: userId,
      });
      if (claim.error) throw new Error(claim.error.message);
      if (claim.data.existing) {
        if (claim.data.job.state === "done") return claim.data.job.result as T;
        throw new Error(
          "This chapter step is already running or needs reconciliation. Refresh its saved progress.",
        );
      }
      try {
        const result = await action();
        const saved = await db
          .from("pr_step_jobs")
          .update({ state: "done", result })
          .eq("run_id", runId)
          .eq("chapter_id", chapterId)
          .eq("step", step);
        if (saved.error)
          throw new Error("Step completion needs reconciliation");
        return result;
      } catch (e) {
        await db
          .from("pr_step_jobs")
          .update({ state: "reconciliation" })
          .eq("run_id", runId)
          .eq("chapter_id", chapterId)
          .eq("step", step);
        throw e;
      }
    },
    signal,
  );
}
