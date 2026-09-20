import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { canonicalizeEmail } from "@/lib/email";
import type { ClaudeUsage } from "@/lib/claude-lite";

export type InkOperation =
  | "brainstorm"
  | "brainstorm_summarize"
  | "brainstorm_notes"
  | "analyze"
  | "voice_profile"
  | "mind_map"
  | "outline"
  | "generate"
  | "foreword"
  | "rewrite"
  | "coherence"
  | "enrich"
  | "style_distill"
  | "transcribe"
  | "youtube_import"
  | "research";

// Flat vendor-cost rates for the non-token operations. Rough cost parity with
// the 1-Ink-per-1000-token convention (1 Ink ≈ $0.006-0.009 of vendor spend):
// Deepgram ≈ $0.0043/audio-minute, Supadata a few cents per video.
export const INK_PER_AUDIO_MINUTE = 0.5;
export const INK_PER_YOUTUBE_IMPORT = 2;

/**
 * Ink meter v2 (migration 027): Ink = real vendor dollars x one multiplier, with
 * input, output and cached tokens each priced at what they cost. OFF unless
 * INK_METER_V2=true, which is set on Preview first. With the flag off every
 * call below takes exactly the path it took before.
 */
export function inkMeterV2(): boolean {
  return process.env.INK_METER_V2 === "true";
}

/** Deepgram is ~$0.0043 per audio minute; at 102 Ink per vendor dollar that is 0.44. */
export const INK_PER_AUDIO_MINUTE_V2 = 0.44;

/** The per-minute transcription rate for whichever meter is live. */
export function inkPerAudioMinute(): number {
  return inkMeterV2() ? INK_PER_AUDIO_MINUTE_V2 : INK_PER_AUDIO_MINUTE;
}

// Conservative per-operation Ink floors for the PRE-flight cost check — lower
// bounds on what an op typically costs, so a near-empty wallet can't kick off an
// expensive call whose content streams back before the deduct settles. Real
// billing still uses actual token usage via deduct_ink.
const ESTIMATED_COST: Record<InkOperation, number> = {
  brainstorm: 2,
  brainstorm_summarize: 1,
  brainstorm_notes: 0.2,
  analyze: 3,
  voice_profile: 1,
  mind_map: 1,
  outline: 2,
  generate: 6,
  foreword: 2,
  rewrite: 2,
  coherence: 2,
  enrich: 1,
  style_distill: 1,
  transcribe: 2,
  youtube_import: 2,
  research: 3,
};

/** Estimated minimum Ink cost for an operation (used by the pre-flight gate). */
export function estimateInkCost(operation: InkOperation): number {
  return ESTIMATED_COST[operation] ?? 0;
}

export interface InkBalance {
  ink_balance: number;
  lifetime_used: number;
  tier: string;
  topup_ink: number;
}

export interface InkCheck {
  allowed: boolean;
  reason?: string;
  balance: number;
  tier: string;
  reservationId?: string;
}

/** sha256 hex of an email string. */
function hashEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

/**
 * Ensure an ink_balances row exists (creating one with the free trial behind
 * the anti-farming check) and apply the lazy period refill for paid tiers.
 * All policy lives in the ensure_ink_balance RPC so the SQL and TS paths can't
 * disagree. Throws on failure — a fabricated in-memory wallet here used to let
 * checkInk approve work that deduct_ink could never settle.
 */
async function ensureBalance(userId: string): Promise<InkBalance> {
  const supabase = createServerClient();

  // Hash both the raw-lowercase and canonical forms: the ledger holds legacy
  // raw hashes, and canonicalisation is what stops kyle+1@ minting a trial
  // kyle@ already burned.
  let emailHashes: string[] | null = null;
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (email) {
      emailHashes = [...new Set([hashEmail(email.toLowerCase()), hashEmail(canonicalizeEmail(email))])];
    }
  } catch { /* hash lookup is best-effort; the RPC grants the trial without it */ }

  const { data, error } = await supabase.rpc("ensure_ink_balance", {
    p_user_id: userId,
    p_email_hashes: emailHashes,
  });

  if (error) {
    throw new Error(`ensure_ink_balance failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("ensure_ink_balance returned no row");
  }
  return {
    ink_balance: Number(row.ink_balance),
    lifetime_used: Number(row.lifetime_used),
    tier: row.tier,
    topup_ink: Number(row.topup_ink ?? 0),
  };
}

/**
 * Check a user can afford an operation. With `operation`, requires
 * balance >= that operation's estimated floor (cost-aware pre-flight). Without
 * it, falls back to a presence check (balance > 0).
 */
export async function checkInk(userId: string, operation?: InkOperation): Promise<InkCheck> {
  const balance = await ensureBalance(userId);
  const required = operation ? estimateInkCost(operation) : 0;
  const spendable = Number(balance.ink_balance) + Number(balance.topup_ink ?? 0);

  if (spendable <= 0 || spendable < required) {
    return {
      allowed: false,
      reason: required > 0
        ? `This needs about ${required} Ink and you have ${Number(Number(spendable).toFixed(2))}. Top up to continue.`
        : "No Ink remaining. Upgrade your plan to continue.",
      balance: spendable,
      tier: balance.tier,
    };
  }

  return {
    allowed: true,
    balance: spendable,
    tier: balance.tier,
  };
}

/**
 * Atomically hold an operation's minimum Ink before calling a vendor. Unlike
 * checkInk(), concurrent calls cannot approve the same balance. Call
 * releaseInkReservation if no vendor work is started.
 */
export async function reserveInk(userId: string, operation: InkOperation): Promise<InkCheck> {
  const balance = await ensureBalance(userId);
  const required = estimateInkCost(operation);
  const spendable = Number(balance.ink_balance) + Number(balance.topup_ink ?? 0);
  if (spendable < required) {
    return {
      allowed: false,
      reason: `This needs about ${required} Ink and you have ${Number(spendable.toFixed(2))}. Top up to continue.`,
      balance: spendable,
      tier: balance.tier,
    };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("reserve_ink", {
    p_user_id: userId,
    p_operation: operation,
    p_ink_amount: required,
  });
  if (error?.message.includes("Insufficient Ink")) {
    return {
      allowed: false,
      reason: `This needs about ${required} Ink and your balance is reserved by another request. Please try again shortly.`,
      balance: balance.ink_balance,
      tier: balance.tier,
    };
  }
  if (error) throw new Error(`reserve_ink failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.reservation_id) throw new Error("reserve_ink returned no reservation");
  return {
    allowed: true,
    balance: Number(row.ink_balance),
    tier: row.tier,
    reservationId: row.reservation_id,
  };
}

/** Release an unused pre-vendor reservation. Safe to call more than once. */
export async function releaseInkReservation(reservationId?: string): Promise<void> {
  if (!reservationId) return;
  const { error } = await createServerClient().rpc("release_ink_reservation", {
    p_reservation_id: reservationId,
  });
  if (error) throw new Error(`release_ink_reservation failed: ${error.message}`);
}

/** Settle a reservation with the actual vendor cost and release its hold. */
export async function settleInkReservation(
  reservationId: string,
  projectId: string | null,
  operation: InkOperation,
  model: "fast" | "quality" | string,
  usage: ClaudeUsage | null,
  flatInkCost?: number
): Promise<number> {
  const v2 = inkMeterV2();
  const { data, error } = await createServerClient().rpc(v2 ? "settle_ink_reservation_v2" : "settle_ink_reservation", {
    p_reservation_id: reservationId,
    p_project_id: projectId,
    p_operation: operation,
    p_model: model === "fast" ? "haiku" : model === "quality" ? "sonnet" : model,
    p_input_tokens: usage?.input_tokens ?? 0,
    p_output_tokens: usage?.output_tokens ?? 0,
    p_flat_ink_cost: flatInkCost == null ? null : Math.max(0, Number(flatInkCost.toFixed(4))),
    ...(v2 ? { p_cache_read_tokens: usage?.cache_read_input_tokens ?? 0, p_cache_write_tokens: usage?.cache_creation_input_tokens ?? 0 } : {}),
  });
  if (error) {
    if (error.message.includes("Insufficient Ink")) throw new Error("Insufficient Ink balance");
    throw new Error(`settle_ink_reservation failed: ${error.message}`);
  }
  return Number(data);
}

/** Get current balance and usage stats */
export async function getInkBalance(userId: string) {
  const supabase = createServerClient();
  const balance = await ensureBalance(userId);

  // Get usage breakdown by operation for current period
  const { data: usage } = await supabase
    .from("ink_usage")
    .select("operation, ink_cost, flat_ink_cost, billed_ink")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  const breakdown: Record<string, number> = {};
  if (usage) {
    for (const row of usage) {
      // v2 rows carry what was actually charged; flat vendors carry flat_ink_cost; v1 token rows the generated column.
      const r = row as { operation: string; ink_cost: number | null; flat_ink_cost?: number | null; billed_ink?: number | null };
      breakdown[r.operation] = (breakdown[r.operation] || 0) + Number(r.billed_ink ?? r.flat_ink_cost ?? r.ink_cost ?? 0);
    }
  }

  return {
    balance: Number(balance.ink_balance),
    lifetime_used: Number(balance.lifetime_used),
    tier: balance.tier,
    topup_ink: Number(balance.topup_ink ?? 0),
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

  const v2 = inkMeterV2();
  const { data, error } = await supabase.rpc(v2 ? "deduct_ink_v2" : "deduct_ink", {
    p_user_id: userId,
    p_project_id: projectId,
    p_operation: operation,
    p_model: modelName,
    p_input_tokens: usage.input_tokens,
    p_output_tokens: usage.output_tokens,
    ...(v2 ? { p_cache_read_tokens: usage.cache_read_input_tokens ?? 0, p_cache_write_tokens: usage.cache_creation_input_tokens ?? 0 } : {}),
  });

  if (error) {
    if (error.message.includes("Insufficient Ink")) {
      throw new Error("Insufficient Ink balance");
    }
    throw error;
  }

  return Number(data);
}

/**
 * Deduct a flat Ink amount for non-token vendor costs (Deepgram audio-minutes,
 * Supadata video imports). Settles through the same locked SQL path as token
 * usage so it shows up in ink_usage and can't race the balance.
 */
export async function recordFlatInkUsage(
  userId: string,
  projectId: string | null,
  operation: InkOperation,
  vendor: string,
  inkCost: number
): Promise<number> {
  const supabase = createServerClient();
  await ensureBalance(userId);

  const { data, error } = await supabase.rpc("deduct_ink_flat", {
    p_user_id: userId,
    p_project_id: projectId,
    p_operation: operation,
    p_model: vendor,
    p_ink_cost: Math.max(0, Number(inkCost.toFixed(4))),
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
