import Stripe from "stripe";

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  return new Stripe(key, {
    apiVersion: "2024-12-18.acacia" as const,
  });
}

export const STRIPE_PRICES: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  pro: process.env.STRIPE_PRICE_PRO!,
  premium: process.env.STRIPE_PRICE_PREMIUM!,
};

export const TIER_INK: Record<string, number> = {
  starter: 300,
  pro: 660,
  premium: 1500,
};
