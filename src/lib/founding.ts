// Founding 100 intro offer (Kyle 2026-11-27: "Let's go founding offer 1").
// The first 100 subscribers to the $99 plan pay $49/month for as long as their
// subscription stays active.
//
// Stripe holds the whole offer:
//   - coupon "Founding 100": $50 off, duration forever, limited to the D.scribe
//     Premium product (the $99 plan). $99 - $50 = $49.
//   - public promotion code (STRIPE_FOUNDING_PROMO_CODE, e.g. FOUNDING100) with
//     max_redemptions = 100. Stripe enforces the cap, so the seat count is real.
//
// Two switches, both needed, both Kyle's word on launch day:
//   1. FOUNDING_OFFER=true in the server environment;
//   2. the public promotion code exists and is active in Stripe.
// Either one missing = no banner, no automatic discount, checkout unchanged.
//
// Stripe counts a seat when a checkout completes and never gives it back on a
// cancel, so "first 100" means the first 100 people who actually subscribed.

import { logger } from "@/lib/logger";
import { stripe } from "@/lib/stripe";

/** What founding members pay per month ($99 plan minus the $50-off coupon). */
export const FOUNDING_MONTHLY = 49;

export function foundingOn(): boolean {
  return (process.env.FOUNDING_OFFER ?? "").trim().toLowerCase() === "true";
}

export function foundingCode(): string {
  return (process.env.STRIPE_FOUNDING_PROMO_CODE ?? "").trim();
}

export type FoundingStatus = {
  promoId: string;
  total: number;
  remaining: number;
};

type PromoLike = {
  id: string;
  active: boolean;
  max_redemptions: number | null;
  times_redeemed: number;
};

/** Seats from a Stripe promotion code. No cap or inactive = not a founding offer. */
export function seatsFrom(promo: PromoLike | undefined | null): FoundingStatus | null {
  if (!promo || !promo.active) return null;
  const total = promo.max_redemptions;
  if (!total || total <= 0) return null;
  const remaining = Math.max(0, total - (promo.times_redeemed ?? 0));
  return { promoId: promo.id, total, remaining };
}

const CACHE_MS = 60_000;
let cache: { at: number; key: string; value: FoundingStatus | null } | null = null;

/** Test hook. */
export function resetFoundingCache() {
  cache = null;
}

/**
 * Live seat count, cached for a minute per server instance. Any failure
 * returns null, which hides the banner and leaves checkout exactly as it was:
 * the offer must never cost a sale or show a made-up number.
 */
export async function foundingStatus(now: number = Date.now()): Promise<FoundingStatus | null> {
  if (!foundingOn()) return null;
  const code = foundingCode();
  if (!code) return null;
  if (cache && cache.key === code && now - cache.at < CACHE_MS) return cache.value;

  let value: FoundingStatus | null = null;
  try {
    const list = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    value = seatsFrom(list.data[0] as unknown as PromoLike | undefined);
  } catch (err) {
    logger.warn("Founding offer lookup failed; banner hidden, checkout unchanged", {
      route: "founding",
      meta: { code },
      error: err,
    });
    value = null;
  }
  cache = { at: now, key: code, value };
  return value;
}
