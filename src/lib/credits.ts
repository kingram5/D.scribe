import { createServerClient } from "@/lib/supabase";

const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_FREE_CREDITS = 10;

interface CreditCheck {
  allowed: boolean;
  reason?: string;
  balance: number;
}

/** Ensure a user_credits row exists, creating one with free credits if needed */
async function ensureCredits(userId: string) {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (data) return data;

  // New user — create with free credits
  const { data: created } = await supabase
    .from("user_credits")
    .insert({ user_id: userId, balance: DEFAULT_FREE_CREDITS })
    .select()
    .single();

  return created;
}

/** Check if a user can run a job. Returns allowed + reason if blocked. */
export async function checkCredits(userId: string): Promise<CreditCheck> {
  const supabase = createServerClient();

  const credits = await ensureCredits(userId);
  if (!credits) {
    return { allowed: false, reason: "Could not load credits", balance: 0 };
  }

  // Check balance (includes any bonus credits from overrides)
  const { data: override } = await supabase
    .from("usage_overrides")
    .select("bonus_credits, daily_job_limit")
    .eq("user_id", userId)
    .single();

  const totalBalance = credits.balance + (override?.bonus_credits || 0);

  if (totalBalance <= 0) {
    return {
      allowed: false,
      reason: "No credits remaining. Purchase more to continue.",
      balance: totalBalance,
    };
  }

  // Check daily limit
  const dailyLimit = override?.daily_job_limit || DEFAULT_DAILY_LIMIT;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .gte("created_at", today.toISOString());

  if ((count || 0) >= dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${dailyLimit} jobs/day). Try again tomorrow.`,
      balance: totalBalance,
    };
  }

  return { allowed: true, balance: totalBalance };
}

/** Deduct 1 credit after a job is created */
export async function deductCredit(userId: string) {
  const supabase = createServerClient();

  // Use bonus credits first (from overrides), then balance
  const { data: override } = await supabase
    .from("usage_overrides")
    .select("bonus_credits")
    .eq("user_id", userId)
    .single();

  if (override && override.bonus_credits > 0) {
    await supabase
      .from("usage_overrides")
      .update({ bonus_credits: override.bonus_credits - 1 })
      .eq("user_id", userId);
  } else {
    await supabase.rpc("decrement_credit", { uid: userId });
  }
}

/** Grant credits to a user (for purchases or manual top-ups) */
export async function grantCredits(userId: string, amount: number) {
  const supabase = createServerClient();
  await ensureCredits(userId);

  const { data } = await supabase
    .from("user_credits")
    .select("balance, lifetime_purchased")
    .eq("user_id", userId)
    .single();

  if (data) {
    await supabase
      .from("user_credits")
      .update({
        balance: data.balance + amount,
        lifetime_purchased: data.lifetime_purchased + amount,
      })
      .eq("user_id", userId);
  }
}
