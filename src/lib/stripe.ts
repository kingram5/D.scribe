import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as const,
});

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
