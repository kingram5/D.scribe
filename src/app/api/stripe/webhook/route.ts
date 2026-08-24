import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, TIER_INK, TOPUP_GRANTS } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  applyTopupGrant,
  clawbackTopup,
  isTopupSku,
  renewalRefillPayload,
  type TopupSku,
} from "@/lib/topups";

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

  const { error } = await supabase
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
  if (error) throw new Error(`activateSubscription upsert failed: ${error.message}`);
}

// Zero spendable Ink but keep the tier — used when a payment fails and the
// subscription enters dunning. A later successful charge refills via
// invoice.payment_succeeded, so the tier stays the source of truth.
//
// Stripe does not guarantee delivery order: a stale past_due event can arrive
// after the payment that cured it. When the subscription is known, check its
// LIVE status and skip the freeze if it has since recovered.
async function freezeInk(customerId: string, subscriptionId?: string | null) {
  if (subscriptionId) {
    try {
      const live = await stripe.subscriptions.retrieve(subscriptionId);
      if (live.status === "active" || live.status === "trialing") {
        logger.warn("Skipping Ink freeze — subscription has recovered", {
          route: "/api/stripe/webhook",
          meta: { customer: customerId, subscription: subscriptionId },
        });
        return;
      }
    } catch { /* can't confirm recovery — freeze as before */ }
  }
  const supabase = createServerClient();
  const { data: balance } = await supabase
    .from("ink_balances").select("user_id").eq("stripe_customer_id", customerId).single();
  if (!balance) return;
  await supabase.from("ink_balances").update({ ink_balance: 0 }).eq("user_id", balance.user_id);
}

// Fully revoke paid entitlement (refund or chargeback): drop to free, zero Ink,
// unlink the subscription.
async function revokeEntitlement(customerId: string) {
  const supabase = createServerClient();
  const { data: balance } = await supabase
    .from("ink_balances").select("user_id").eq("stripe_customer_id", customerId).single();
  if (!balance) return;
  await supabase.from("ink_balances")
    .update({ tier: "free", ink_balance: 0, stripe_subscription_id: null })
    .eq("user_id", balance.user_id);
}

async function handleStripeEvent(event: Stripe.Event) {
  const supabase = createServerClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const kind = session.metadata?.kind;
    const sku = session.metadata?.sku;
    const tier = session.metadata?.tier;

    if (kind === "topup") {
      if (!userId || !isTopupSku(sku)) {
        logger.error("topup checkout.session.completed with unusable metadata — credits NOT granted", {
          route: "/api/stripe/webhook",
          meta: { event_id: event.id, session: session.id, user_id: userId ?? "(missing)", sku: sku ?? "(missing)" },
        });
      } else {
        await grantTopupPurchase({
          userId,
          sku,
          stripeSessionId: session.id,
          paymentIntent: typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
          amountCents: session.amount_total ?? 0,
        });
      }
    } else if (userId && tier && TIER_INK[tier] != null) {
      await activateSubscription(
        userId,
        tier,
        session.subscription as string,
        session.customer as string
      );
    } else {
      // Missing or unrecognised metadata can't heal on retry — do NOT write a
      // paid tier with 0 Ink; scream instead so the session can be repaired.
      logger.error("checkout.session.completed with unusable metadata — subscription NOT activated", {
        route: "/api/stripe/webhook",
        meta: { event_id: event.id, session: session.id, user_id: userId ?? "(missing)", tier: tier ?? "(missing)" },
      });
    }
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;
    const goodStanding =
      subscription.status === "active" || subscription.status === "trialing";

    if (!goodStanding) {
      // past_due / unpaid / canceled / incomplete_expired — freeze spendable Ink
      // so a lapsed subscriber can't keep burning AI spend during dunning.
      await freezeInk(customerId, subscription.id);
      logger.warn("Subscription not in good standing — froze Ink", {
        route: "/api/stripe/webhook",
        meta: { customer: customerId, status: subscription.status },
      });
    } else {
      const priceId = subscription.items.data[0]?.price.id;
      const PRICE_TO_TIER: Record<string, string> = {
        [process.env.STRIPE_PRICE_STARTER!]: "starter",
        [process.env.STRIPE_PRICE_PRO!]: "pro",
        [process.env.STRIPE_PRICE_PREMIUM!]: "premium",
      };
      const newTier = priceId ? PRICE_TO_TIER[priceId] : undefined;

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
      const { error } = await supabase
        .from("ink_balances")
        .update({
          tier: "free",
          ink_balance: 0,
          stripe_subscription_id: null,
          tts_chars_used: 0,
          tts_period_start: new Date().toISOString(),
        })
        .eq("user_id", balance.user_id);
      if (error) throw new Error(`subscription.deleted downgrade failed: ${error.message}`);
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
        const { error } = await supabase
          .from("ink_balances")
          .update(renewalRefillPayload(balance.tier))
          .eq("user_id", balance.user_id);
        if (error) throw new Error(`invoice refill failed: ${error.message}`);
      }
    }
  }

  // Failed renewal/charge — the subscription is now past_due and Stripe is in its
  // dunning retry window. Freeze spendable Ink so a non-paying account can't keep
  // burning AI spend; the tier is retained so a successful retry refills cleanly
  // via invoice.payment_succeeded.
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string | null;
    if (customerId) {
      const rawSub = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
      const subscriptionId = typeof rawSub === "string" ? rawSub : rawSub?.id ?? null;
      await freezeInk(customerId, subscriptionId);
      logger.warn("Invoice payment failed — froze Ink", {
        route: "/api/stripe/webhook",
        meta: { customer: customerId, invoice: invoice.id },
      });
    }
  }

  // Refund or chargeback. Top-up packs claw back their own bucket and leave
  // the subscription wallet alone. Subscription refunds still revoke access.
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    let customerId: string | null = null;
    let paymentIntent: string | null = null;
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const fullyRefunded = charge.refunded === true || charge.amount_refunded >= charge.amount;
      if (!fullyRefunded) {
        logger.warn("Partial refund — entitlement retained", {
          route: "/api/stripe/webhook",
          meta: { charge: charge.id, refunded: charge.amount_refunded, total: charge.amount },
        });
        return;
      }
      customerId = charge.customer as string | null;
      paymentIntent = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    } else {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      paymentIntent = typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : dispute.payment_intent?.id ?? null;
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        customerId = charge.customer as string | null;
        if (!paymentIntent) {
          paymentIntent = typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id ?? null;
        }
      }
    }
    if (paymentIntent) {
      const clawed = await clawbackTopupPurchase(paymentIntent);
      if (clawed) {
        logger.warn("Top-up refunded/disputed — clawed back credits", {
          route: "/api/stripe/webhook",
          meta: { payment_intent: paymentIntent, type: event.type },
        });
        return;
      }
    }
    if (customerId) {
      await revokeEntitlement(customerId);
      logger.warn("Charge refunded/disputed — revoked entitlement", {
        route: "/api/stripe/webhook",
        meta: { customer: customerId, type: event.type },
      });
    }
  }
}

export async function grantTopupPurchase(input: {
  userId: string;
  sku: TopupSku;
  stripeSessionId: string;
  paymentIntent: string | null;
  amountCents: number;
}): Promise<{ granted: boolean; replayed: boolean }> {
  const supabase = createServerClient();
  const granted = TOPUP_GRANTS[input.sku];
  const { error: insertError } = await supabase.from("topup_purchases").insert({
    user_id: input.userId,
    sku: input.sku,
    stripe_session_id: input.stripeSessionId,
    stripe_payment_intent: input.paymentIntent,
    amount_cents: input.amountCents,
    granted,
    status: "granted",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { granted: false, replayed: true };
    }
    throw new Error(`topup insert failed: ${insertError.message}`);
  }

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("topup_ink, topup_tts_chars")
    .eq("user_id", input.userId)
    .single();

  const next = applyTopupGrant({
    topup_ink: Number(balance?.topup_ink ?? 0),
    topup_tts_chars: Number(balance?.topup_tts_chars ?? 0),
  }, input.sku);

  const { error } = await supabase
    .from("ink_balances")
    .update(next)
    .eq("user_id", input.userId);
  if (error) throw new Error(`topup grant failed: ${error.message}`);
  return { granted: true, replayed: false };
}

export async function clawbackTopupPurchase(paymentIntent: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data: purchase } = await supabase
    .from("topup_purchases")
    .select("id, user_id, sku, granted, status")
    .eq("stripe_payment_intent", paymentIntent)
    .maybeSingle();

  if (!purchase || purchase.status !== "granted") return false;

  const { error: markError } = await supabase
    .from("topup_purchases")
    .update({ status: "clawed_back" })
    .eq("id", purchase.id)
    .eq("status", "granted");
  if (markError) throw new Error(`topup clawback mark failed: ${markError.message}`);

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("topup_ink, topup_tts_chars")
    .eq("user_id", purchase.user_id)
    .single();

  const granted = (purchase.granted ?? {}) as { ink?: number; tts_chars?: number };
  const next = clawbackTopup({
    topup_ink: Number(balance?.topup_ink ?? 0),
    topup_tts_chars: Number(balance?.topup_tts_chars ?? 0),
  }, granted);

  const { error } = await supabase
    .from("ink_balances")
    .update(next)
    .eq("user_id", purchase.user_id);
  if (error) throw new Error(`topup clawback failed: ${error.message}`);
  return true;
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

  // Idempotency, two-phase: claim the event first (so concurrent deliveries
  // can't double-process), but only mark it processed AFTER the handler
  // succeeds. A handler failure leaves processed=false, so Stripe's retry
  // re-runs the work instead of short-circuiting into a no-op — the old
  // single-phase check permanently lost a paid upgrade on one transient error.
  const { error: insertError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });

  if (insertError) {
    if (insertError.code === "23505") {
      // Duplicate delivery. Only a no-op if the original attempt FINISHED.
      const { data: existing } = await supabase
        .from("stripe_events")
        .select("processed")
        .eq("id", event.id)
        .single();
      if (existing?.processed) {
        return NextResponse.json({ received: true });
      }
      // fall through: previous attempt died mid-handler — re-run it
    } else {
      logger.error("Failed to log Stripe event", { route: "/api/stripe/webhook", meta: { event_id: event.id }, error: insertError });
      return NextResponse.json({ error: "Event logging failed" }, { status: 500 });
    }
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    logger.error("Stripe event handler failed — leaving event unprocessed for retry", {
      route: "/api/stripe/webhook",
      meta: { event_id: event.id, type: event.type },
      error: err,
    });
    return NextResponse.json({ error: "Event handling failed" }, { status: 500 });
  }

  const { error: markError } = await supabase
    .from("stripe_events")
    .update({ processed: true })
    .eq("id", event.id);
  if (markError) {
    // Worst case here is a re-run of an idempotent handler, not lost work.
    logger.error("Failed to mark Stripe event processed", {
      route: "/api/stripe/webhook",
      meta: { event_id: event.id },
      error: markError,
    });
  }

  return NextResponse.json({ received: true });
}
