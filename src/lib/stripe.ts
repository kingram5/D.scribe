import Stripe from "stripe";
import { PLANS, PLAN_99_TIER, plan99 } from "@/lib/tiers";

export const STRIPE_PRICES: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "",
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  premium: process.env.STRIPE_PRICE_PREMIUM ?? "",
};

/** Env var holding the Stripe price id of the $99 plan (docs/plan-99-switch-day.md). */
export const PLAN_99_PRICE_ENV = "STRIPE_PRICE_PLAN_99";

/** Every plan price id that existed before plan 99: current and pre-swap legacy. */
function knownPlanPrices(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tier of ["starter", "pro", "premium"] as const) {
    const current = process.env[`STRIPE_PRICE_${tier.toUpperCase()}`];
    const legacy = process.env[`STRIPE_PRICE_${tier.toUpperCase()}_LEGACY`];
    if (current) map[current] = tier;
    if (legacy) map[legacy] = tier;
  }
  return map;
}

/**
 * The $99 plan's Stripe price id, or null when it is missing or unusable.
 *
 * Unusable = the same id as one of the old plan prices or a refill price. That
 * is a copy-paste slip on switch day, and honoring it would sell the $100
 * Premium price (or a $25 one) under a "$99" label.
 */
export function plan99PriceId(): string | null {
  const id = (process.env[PLAN_99_PRICE_ENV] ?? "").trim();
  if (!id) return null;
  if (knownPlanPrices()[id]) return null;
  if (id === process.env.STRIPE_PRICE_VOICE_PACK || id === process.env.STRIPE_PRICE_INK_PACK) return null;
  return id;
}

/**
 * Price id -> tier. Includes the pre-swap prices (STRIPE_PRICE_*_LEGACY) so a
 * subscriber still on an old price keeps their tier after the new prices go in.
 *
 * The $99 plan's price (STRIPE_PRICE_PLAN_99) always maps to its tier, flag or
 * no flag: turning NEXT_PUBLIC_PLAN_99 off (rollback) must not orphan anyone
 * who already subscribed at $99. It can never re-map an old price: the old
 * plan prices are looked up first, and a colliding id is ignored.
 */
export function tierForPrice(priceId: string | undefined | null): string | undefined {
  if (!priceId) return undefined;
  const known = knownPlanPrices()[priceId];
  if (known) return known;
  return priceId === plan99PriceId() ? PLAN_99_TIER : undefined;
}

export type PlanPrice =
  | { ok: true; price: string }
  | { ok: false; status: 400 | 503; error: string };

/**
 * The Stripe price a NEW checkout or an in-place plan switch to `tier` uses.
 *
 * Flag off: exactly today's behavior, STRIPE_PRICES[tier] (the routes validate
 * the tier name first). Flag on: only the $99 plan is sold. Any other tier is
 * refused, and a missing or colliding STRIPE_PRICE_PLAN_99 is a 503, never a
 * fall-back to the $100 Premium price.
 */
export function planPriceFor(tier: string): PlanPrice {
  if (!plan99()) return { ok: true, price: STRIPE_PRICES[tier] };
  if (tier !== PLAN_99_TIER) {
    return { ok: false, status: 400, error: "That plan is no longer offered." };
  }
  const price = plan99PriceId();
  if (!price) {
    return { ok: false, status: 503, error: "Checkout is not available right now. Please try again shortly." };
  }
  return { ok: true, price };
}

// Must match tier_ink_allotment() in SQL (012, and 030 once the v2 plans launch).
// Plan 99 keeps the v1 allotments (premium 1,500 = migration 012), so 030 must
// never be applied while NEXT_PUBLIC_PLAN_99 is on.
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
