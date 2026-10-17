import { createServerClient } from "@/lib/supabase";
import {
  AIError,
  type Route,
  type TextRequest,
  type TextResult,
} from "../contracts";
import { generateText } from "../providers/text";
import { digest } from "@/lib/publisher-ready/source-ledger";
type Db = ReturnType<typeof createServerClient>;
export interface AttemptRow {
  id: string;
  state: string;
  input_hash: string;
  result: TextResult | null;
  vendor_cost_usd: number | null;
}
export interface AttemptStore {
  list(callKey: string): Promise<AttemptRow[]>;
  spent(): Promise<number>;
  start(
    callKey: string,
    ordinal: number,
    route: Route,
    hash: string,
  ): Promise<string>;
  finish(
    id: string,
    state: string,
    result?: TextResult,
    error?: AIError,
  ): Promise<void>;
}
export function databaseAttempts(db: Db, operationId: string): AttemptStore {
  return {
    async list(callKey) {
      const { data, error } = await db
        .from("ai_attempts")
        .select("*")
        .eq("operation_id", operationId)
        .eq("call_key", callKey)
        .order("ordinal");
      if (error) throw error;
      return data ?? [];
    },
    async spent() {
      const { data, error } = await db
        .from("ai_attempts")
        .select("vendor_cost_usd,state,usage")
        .eq("operation_id", operationId);
      if (error) throw error;
      if (
        data?.some(
          (a) =>
            a.state !== "retryable" &&
            (a.usage?.usageStatus !== "reported" || a.vendor_cost_usd == null),
        )
      )
        throw new AIError(
          "reconcile",
          "Unknown vendor usage needs reconciliation",
        );
      return (data ?? []).reduce(
        (n, a) => n + Number(a.vendor_cost_usd ?? 0),
        0,
      );
    },
    async start(callKey, ordinal, route, hash) {
      const { data, error } = await db
        .from("ai_attempts")
        .insert({
          operation_id: operationId,
          call_key: callKey,
          ordinal,
          provider: route.provider,
          model: route.model,
          route,
          input_hash: hash,
        })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Attempt not saved");
      return data.id;
    },
    async finish(id, state, result, error) {
      const usage = result?.usage ?? error?.usage;
      const { error: failure } = await db
        .from("ai_attempts")
        .update({
          state,
          result: result ?? null,
          usage: usage ?? null,
          vendor_cost_usd: usage?.vendorCostUsd ?? null,
          provider_request_id:
            result?.providerRequestId ?? error?.providerRequestId ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("operation_id", operationId);
      if (failure) throw failure;
    },
  };
}
export async function durableText(
  store: AttemptStore,
  key: string,
  route: Route,
  req: TextRequest,
  budget: number,
  send = generateText,
): Promise<TextResult> {
  const hash = digest([route, req.system, req.user, req.schema, req.maxTokens]);
  const previous = await store.list(key);
  if (previous.some((a) => a.input_hash !== hash))
    throw new AIError("review_needed", "Pinned operation input changed");
  const completed = previous.find((a) => a.state === "complete");
  if (completed?.result) return completed.result;
  if (previous.some((a) => a.state !== "retryable"))
    throw new AIError(
      "reconcile",
      "Interrupted or paid attempt requires review before retry",
    );
  for (
    let ordinal = previous.length + 1;
    ordinal <= route.maximumAttempts;
    ordinal++
  ) {
    req.signal?.throwIfAborted();
    const spent = await store.spent();
    // Conservative output exposure + UTF-8 input byte upper bound (not a token count or invoice).
    const exposure =
      (req.maxTokens *
        route.price.output *
        (route.price.longContext?.outputMultiplier ?? 1) +
        new TextEncoder().encode(
          req.system + req.user + JSON.stringify(req.schema ?? {}),
        ).length *
          Math.max(
            route.price.input,
            route.price.cacheWrite,
            route.price.cacheWrite1h ?? 0,
          ) *
          (route.price.longContext?.inputMultiplier ?? 1)) /
      1e6;
    if (spent + exposure > budget)
      throw new AIError(
        "review_needed",
        "Operation budget needs review before the next provider call",
      );
    const id = await store.start(key, ordinal, route, hash);
    let paidResult: TextResult | undefined;
    try {
      const result = await send(route, req);
      paidResult = result;
      if (result.usage.usageStatus !== "reported")
        throw new AIError(
          "reconcile",
          "Provider did not report billable usage",
          result.usage,
          result.providerRequestId,
        );
      await store.finish(id, "complete", result);
      return result;
    } catch (err) {
      const failure =
        err instanceof AIError
          ? err
          : new AIError(
              "reconcile",
              "Attempt persistence/transport needs reconciliation",
            );
      failure.usage ??= paidResult?.usage;
      failure.providerRequestId ??= paidResult?.providerRequestId;
      await store.finish(id, failure.code, paidResult, failure);
      if (failure.code !== "retryable" || ordinal === route.maximumAttempts)
        throw failure;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(250 * 2 ** (ordinal - 1), 2000)),
      );
    }
  }
  throw new AIError("review_needed", "Maximum attempts reached");
}
