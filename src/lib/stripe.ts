import Stripe from "stripe";
import { PLANS } from "@/lib/tiers";

export const STRIPE_PRICES: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "",
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  premium: process.env.STRIPE_PRICE_PREMIUM ?? "",
};

/**
 * Price id -> tier. Includes the pre-swap prices (STRIPE_PRICE_*_LEGACY) so a
 * subscriber still on an old price keeps their tier after the new prices go in.
 */
export function tierForPrice(priceId: string | undefined | null): string | undefined {
  if (!priceId) return undefined;
  const map: Record<string, string> = {};
  for (const tier of ["starter", "pro", "premium"] as const) {
    const current = process.env[`STRIPE_PRICE_${tier.toUpperCase()}`];
    const legacy = process.env[`STRIPE_PRICE_${tier.toUpperCase()}_LEGACY`];
    if (current) map[current] = tier;
    if (legacy) map[legacy] = tier;
  }
  return map[priceId];
}

// Must match tier_ink_allotment() in SQL (012, and 030 once the v2 plans launch).
export const TIER_INK: Record<string, number> = {
  starter: PLANS.starter.ink,
  pro: PLANS.pro.ink,
  premium: PLANS.premium.ink,
};

export const TOPUP_PRICES: Record<string, string> = {
  voice_pack: process.env.STRIPE_PRICE_VOICE_PACK ?? "",
  ink_pack: process.env.STRIPE_PRICE_INK_PACK ?? "",
};

export const TOPUP_GRANTS = {
  voice_pack: { tts_chars: 20000 },
  ink_pack: { ink: 200 },
} as const;

// Lazy client — defers new Stripe() until first actual API call so missing
// STRIPE_SECRET_KEY doesn't crash the build during static page collection.
let _client: Stripe | undefined;
function getClient(): Stripe {
  if (!_client) {
    _client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia" as const,
    });
  }
  return _client;
}

export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return Reflect.get(getClient(), prop as string);
  },
});
