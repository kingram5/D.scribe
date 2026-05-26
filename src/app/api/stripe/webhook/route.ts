import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, TIER_INK } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function activateSubscription(
  userId: string,
  tier: string,
  subscriptionId: string,
  customerId: string
) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  // dahlia (2026-04-22): billing-period fields moved off the subscription onto its items.
  const item = subscription.items.data[0];
  if (!item) throw new Error(`Subscription ${subscriptionId} has no items`);
  const periodStart = new Date(item.current_period_start * 1000).toISOString();
  const periodEnd = new Date(item.current_period_end * 1000).toISOString();

  const supabase = createServerClient();

  await supabase
    .from("ink_balances")
    .upsert({
      user_id: userId,
      tier,
      ink_balance: TIER_INK[tier] ?? 0,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      tts_chars_used: 0,
      tts_period_start: new Date().toISOString(),
      ink_period_start: new Date().toISOString(),
    });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.error("Stripe webhook signature verification failed", {
      route: "/api/stripe/webhook",
      error: err,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Idempotency: ignore events already processed
  const { error: insertError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });

  if (insertError) {
    // PK conflict = duplicate delivery; treat as success
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true });
    }
    logger.error("Failed to log Stripe event", { event_id: event.id, error: insertError });
    return NextResponse.json({ error: "Event logging failed" }, { status: 500 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const tier = session.metadata?.tier;

    if (userId && tier) {
      await activateSubscription(
        userId,
        tier,
        session.subscription as string,
        session.customer as string
      );
    }
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const priceId = subscription.items.data[0]?.price.id;
    const PRICE_TO_TIER: Record<string, string> = {
      [process.env.STRIPE_PRICE_STARTER!]: "starter",
      [process.env.STRIPE_PRICE_PRO!]: "pro",
      [process.env.STRIPE_PRICE_PREMIUM!]: "premium",
    };
    const newTier = PRICE_TO_TIER[priceId];

    if (newTier) {
      const { data: balance } = await supabase
        .from("ink_balances")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (balance) {
        await activateSubscription(
          balance.user_id,
          newTier,
          subscription.id,
          customerId
        );
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const { data: balance } = await supabase
      .from("ink_balances")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (balance) {
      await supabase
        .from("ink_balances")
        .update({
          tier: "free",
          ink_balance: 0,
          stripe_subscription_id: null,
          tts_chars_used: 0,
          tts_period_start: new Date().toISOString(),
        })
        .eq("user_id", balance.user_id);
    }
  }

  // Plan A: billing-aligned Ink reset. On each subscription invoice (initial +
  // renewals), refill Ink to the tier allotment with NO rollover, and advance
  // the Ink period. Keyed off invoice.customer (stable across API versions) +
  // billing_reason, so we avoid the dahlia invoice-shape churn.
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string | null;
    const reason = invoice.billing_reason; // 'subscription_create' | 'subscription_cycle' | ...
    const isSubscriptionInvoice =
      reason === "subscription_create" ||
      reason === "subscription_cycle" ||
      reason === "subscription_update";

    if (customerId && isSubscriptionInvoice) {
      const { data: balance } = await supabase
        .from("ink_balances")
        .select("user_id, tier")
        .eq("stripe_customer_id", customerId)
        .single();

      if (balance && TIER_INK[balance.tier] != null) {
        await supabase
          .from("ink_balances")
          .update({
            ink_balance: TIER_INK[balance.tier],
            ink_period_start: new Date().toISOString(),
          })
          .eq("user_id", balance.user_id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
