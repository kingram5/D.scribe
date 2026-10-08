import { createServerClient } from "@/lib/supabase";
import { ensureBalance } from "@/lib/ink";
import { AIError, type Schema, type TextResult } from "./contracts";
import { readSnapshot, validateRoute } from "./publisher-ready-routing";
import { databaseAttempts, durableText } from "./usage/ledger";
import { digest, FIDELITY } from "@/lib/publisher-ready/source-ledger";
export async function mixedAuxiliary(opts: {
  actorId: string;
  runId: string;
  liveSessionId?: string;
  key: string;
  workload: "interview" | "coverage";
  system: string;
  user: string;
  maxTokens: number;
  schema?: Schema;
}): Promise<TextResult | null> {
  const db = createServerClient();
  const { data: run, error } = await db
    .from("pr_runs")
    .select("models")
    .eq("id", opts.runId)
    .eq("user_id", opts.actorId)
    .single();
  if (error || !run) throw new AIError("configuration", "Run unavailable");
  let snapshot:
    | import("./contracts").RoutingSnapshot
    | import("@/lib/theo/live-session").LiveBackendSnapshot
    | null = readSnapshot(run.models);
  if (opts.liveSessionId) {
    if (
      opts.workload !== "interview" ||
      !opts.key.startsWith(`live:${opts.liveSessionId}:`)
    )
      throw new AIError("configuration", "Invalid Live delegation scope");
    const { data: live, error } = await db
      .from("theo_live_sessions")
      .select("backend_snapshot")
      .eq("id", opts.liveSessionId)
      .eq("user_id", opts.actorId)
      .eq("run_id", opts.runId)
      .neq("state", "closed")
      .single();
    if (error || !live)
      throw new AIError("configuration", "Live session unavailable");
    snapshot =
      live.backend_snapshot as import("@/lib/theo/live-session").LiveBackendSnapshot;
    validateRoute(snapshot.routes.interview);
  }
  if (!snapshot) return null;
  await ensureBalance(opts.actorId);
  const { data: op, error: beginError } = await db.rpc(
    "begin_mixed_operation",
    {
      p_user_id: opts.actorId,
      p_run_id: opts.runId,
      p_chapter_id: null,
      p_key: opts.key,
      p_input_hash: digest([opts.system, opts.user]),
      p_context: { prompt_version: snapshot.promptVersion },
    },
  );
  if (beginError || !op)
    throw new AIError(
      "review_needed",
      "Interview operation needs reconciliation or is already running",
    );
  if (op.state === "complete") return op.result;
  try {
    const result = await durableText(
      databaseAttempts(db, op.id),
      opts.workload,
      (
        snapshot.routes as Partial<
          Record<"interview" | "coverage", import("./contracts").Route>
        >
      )[opts.workload]!,
      {
        system: opts.system + "\n" + FIDELITY,
        user: opts.user,
        maxTokens: opts.maxTokens,
        schema: opts.schema,
      },
      snapshot.maxOperationUsd,
    );
    const { error } = await db.rpc("finish_mixed_aux", {
      p_user_id: opts.actorId,
      p_operation_id: op.id,
      p_result: result,
    });
    if (error)
      throw new AIError(
        "reconcile",
        "Interview settlement needs reconciliation",
      );
    return result;
  } catch (error) {
    const { error: markError } = await db
      .from("ai_operations")
      .update({ state: "review_needed" })
      .eq("id", op.id)
      .eq("state", "running");
    if (markError)
      throw new AIError(
        "reconcile",
        "Interview recovery marker could not be saved",
      );
    throw error;
  }
}
