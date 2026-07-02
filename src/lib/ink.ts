import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import type { ClaudeUsage } from "@/lib/claude-lite";

const FREE_TRIAL_INK = 10.0;

export type InkOperation =
  | "brainstorm"
  | "brainstorm_summarize"
  | "analyze"
  | "voice_profile"
  | "mind_map"
  | "outline"
  | "generate"
  | "foreword"
  | "rewrite"
  | "coherence"
  | "enrich";

// Conservative per-operation Ink floors for the PRE-flight cost check — lower
// bounds on what an op typically costs, so a near-empty wallet can't kick off an
// expensive call whose content streams back before the deduct settles. Real
// billing still uses actual token usage via deduct_ink.
const ESTIMATED_COST: Record<InkOperation, number> = {
  brainstorm: 2,
  brainstorm_summarize: 1,
  analyze: 3,
  voice_profile: 1,
  mind_map: 1,
  outline: 2,
  generate: 6,
  foreword: 2,
  rewrite: 2,
  coherence: 2,
  enrich: 1,
};

/** Estimated minimum Ink cost for an operation (used by the pre-flight gate). */
export function estimateInkCost(operation: InkOperation): number {
  return ESTIMATED_COST[operation] ?? 0;
}

export interface InkBalance {
  ink_balance: number;
  lifetime_used: number;
  tier: string;
}

export interface InkCheck {
  allowed: boolean;
  reason?: string;
  balance: number;
  tier: string;
}

/** Ensure an ink_balances row exists, creating one with free trial if needed */
async function ensureBalance(userId: string): Promise<InkBalance> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("ink_balances")
    .select("ink_balance, lifetime_used, tier")
    .eq("user_id", userId)
    .single();

  if (data) return data;

  // First wallet for this user — grant the free trial UNLESS this email
  // previously deleted an account (anti-farming: delete + re-signup used to
  // mint a fresh 10 Ink every time). Best-effort: any lookup failure falls
  // back to granting the trial, so a missing table can't lock out real users.
  let trialInk = FREE_TRIAL_INK;
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (email) {
      const emailHash = createHash("sha256").update(email.toLowerCase()).digest("hex");
      const { data: prior } = await supabase
        .from("deleted_account_emails")
        .select("email_hash")
        .eq("email_hash", emailHash)
        .maybeSingle();
      if (prior) trialInk = 0;
    }
  } catch { /* grant trial on any failure */ }

  const { data: created } = await supabase
    .from("ink_balances")
    .insert({ user_id: userId, ink_balance: trialInk })
    .select("ink_balance, lifetime_used, tier")
    .single();

  return created || { ink_balance: trialInk, lifetime_used: 0, tier: "free" };
}

/**
 * Check a user can afford an operation. With `operation`, requires
 * balance >= that operation's estimated floor (cost-aware pre-flight). Without
 * it, falls back to a presence check (balance > 0).
 */
export async function checkInk(userId: string, operation?: InkOperation): Promise<InkCheck> {
  const balance = await ensureBalance(userId);
  const required = operation ? estimateInkCost(operation) : 0;

  if (balance.ink_balance <= 0 || balance.ink_balance < required) {
    return {
      allowed: false,
      reason: required > 0
        ? `This needs about ${required} Ink and you have ${Number(balance.ink_balance.toFixed(2))}. Top up to continue.`
        : "No Ink remaining. Upgrade your plan to continue.",
      balance: balance.ink_balance,
      tier: balance.tier,
    };
  }

  return {
    allowed: true,
    balance: balance.ink_balance,
    tier: balance.tier,
  };
}

/** Get current balance and usage stats */
export async function getInkBalance(userId: string) {
  const supabase = createServerClient();
  const balance = await ensureBalance(userId);

  // Get usage breakdown by operation for current period
  const { data: usage } = await supabase
    .from("ink_usage")
    .select("operation, ink_cost")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  const breakdown: Record<string, number> = {};
  if (usage) {
    for (const row of usage) {
      breakdown[row.operation] = (breakdown[row.operation] || 0) + Number(row.ink_cost);
    }
  }

  return {
    balance: Number(balance.ink_balance),
    lifetime_used: Number(balance.lifetime_used),
    tier: balance.tier,
    breakdown,
  };
}

/** Record token usage and deduct Ink after a Claude API call */
export async function recordInkUsage(
  userId: string,
  projectId: string | null,
  operation: InkOperation,
  model: "fast" | "quality",
  usage: ClaudeUsage
): Promise<number> {
  const supabase = createServerClient();
  await ensureBalance(userId);

  const modelName = model === "fast" ? "haiku" : "sonnet";

  const { data, error } = await supabase.rpc("deduct_ink", {
    p_user_id: userId,
    p_project_id: projectId,
    p_operation: operation,
    p_model: modelName,
    p_input_tokens: usage.input_tokens,
    p_output_tokens: usage.output_tokens,
  });

  if (error) {
    if (error.message.includes("Insufficient Ink")) {
      throw new Error("Insufficient Ink balance");
    }
    throw error;
  }

  return Number(data);
}

/** Get recent usage history for a user */
export async function getInkHistory(userId: string, limit = 20) {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("ink_usage")
    .select("operation, model, input_tokens, output_tokens, ink_cost, created_at, project_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
