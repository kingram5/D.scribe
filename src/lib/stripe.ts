import Stripe from "stripe";

export const STRIPE_PRICES: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "",
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  premium: process.env.STRIPE_PRICE_PREMIUM ?? "",
};

export const TIER_INK: Record<string, number> = {
  starter: 300,
  pro: 660,
  premium: 1500,
};

// Lazy client — defers new Stripe() until first actual API call so missing
// STRIPE_SECRET_KEY doesn't crash the build during static page collection.
let _client: Stripe | undefined;
function getClient(): Stripe {
  if (!_client) {
    _client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2024-12-18.acacia" as const,
    });
  }
  return _client;
}

export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return Reflect.get(getClient(), prop as string);
  },
});
