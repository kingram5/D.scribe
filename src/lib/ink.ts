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

  const { data: created } = await supabase
    .from("ink_balances")
    .insert({ user_id: userId, ink_balance: FREE_TRIAL_INK })
    .select("ink_balance, lifetime_used, tier")
    .single();

  return created || { ink_balance: FREE_TRIAL_INK, lifetime_used: 0, tier: "free" };
}

/** Check if a user has enough Ink to proceed */
export async function checkInk(userId: string): Promise<InkCheck> {
  const balance = await ensureBalance(userId);

  if (balance.ink_balance <= 0) {
    return {
      allowed: false,
      reason: "No Ink remaining. Upgrade your plan to continue.",
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
