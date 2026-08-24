import { TIER_INK, TOPUP_GRANTS as STRIPE_TOPUP_GRANTS } from "@/lib/stripe";

export const TOPUP_SKUS = ["voice_pack", "ink_pack"] as const;
export type TopupSku = (typeof TOPUP_SKUS)[number];

export const TOPUP_GRANTS = STRIPE_TOPUP_GRANTS;

export const PAID_TIERS = new Set(["starter", "pro", "premium"]);
export const VOICE_PACK_TIERS = new Set(["pro", "premium"]);

export function isTopupSku(value: unknown): value is TopupSku {
  return value === "voice_pack" || value === "ink_pack";
}

export function canBuyInkPack(tier: string | null | undefined, hasStripeCustomer: boolean): boolean {
  return hasStripeCustomer || PAID_TIERS.has(tier ?? "");
}

export function canBuyVoicePack(tier: string | null | undefined, topupTtsChars: number): boolean {
  return VOICE_PACK_TIERS.has(tier ?? "") || topupTtsChars > 0;
}

/** Same-site path only — rejects protocol-relative and absolute URLs. */
export function safeReturnTo(value: unknown, fallback = "/dashboard?topup=success"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return fallback;
  }
  return value;
}

export function spendInk(monthly: number, topup: number, cost: number): {
  allowed: boolean;
  monthly: number;
  topup: number;
} {
  if (cost < 0) return { allowed: false, monthly, topup };
  if (monthly + topup < cost) return { allowed: false, monthly, topup };
  const fromMonthly = Math.min(monthly, cost);
  return { allowed: true, monthly: monthly - fromMonthly, topup: topup - (cost - fromMonthly) };
}

export function spendTts(used: number, limit: number, topup: number, chars: number): {
  allowed: boolean;
  used: number;
  topup_remaining: number;
  monthly_take: number;
  topup_take: number;
} {
  const monthlyLeft = Math.max(0, limit - used);
  if (monthlyLeft >= chars) {
    return {
      allowed: true,
      used: used + chars,
      topup_remaining: topup,
      monthly_take: chars,
      topup_take: 0,
    };
  }
  const fromTopup = chars - monthlyLeft;
  if (topup < fromTopup) {
    return {
      allowed: false,
      used,
      topup_remaining: topup,
      monthly_take: 0,
      topup_take: 0,
    };
  }
  return {
    allowed: true,
    used: used + monthlyLeft,
    topup_remaining: topup - fromTopup,
    monthly_take: monthlyLeft,
    topup_take: fromTopup,
  };
}

export function clawbackTopup(
  current: { topup_ink: number; topup_tts_chars: number },
  granted: { ink?: number; tts_chars?: number },
): { topup_ink: number; topup_tts_chars: number } {
  return {
    topup_ink: Math.max(0, current.topup_ink - (granted.ink ?? 0)),
    topup_tts_chars: Math.max(0, current.topup_tts_chars - (granted.tts_chars ?? 0)),
  };
}

export function applyTopupGrant(
  current: { topup_ink: number; topup_tts_chars: number },
  sku: TopupSku,
): { topup_ink: number; topup_tts_chars: number } {
  const grant = TOPUP_GRANTS[sku];
  return {
    topup_ink: current.topup_ink + ("ink" in grant ? grant.ink : 0),
    topup_tts_chars: current.topup_tts_chars + ("tts_chars" in grant ? grant.tts_chars : 0),
  };
}

/** Renewal refill writes ONLY these columns — never topup_*. */
export function renewalRefillPayload(tier: string, now = new Date()): {
  ink_balance: number;
  ink_period_start: string;
} {
  return {
    ink_balance: TIER_INK[tier],
    ink_period_start: now.toISOString(),
  };
}

export function ttsGateLocked(tier: string, topupTtsChars: number): boolean {
  return (tier === "free" || tier === "starter") && topupTtsChars <= 0;
}
