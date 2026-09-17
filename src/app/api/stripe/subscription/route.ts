import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { logger } from "@/lib/logger";

// POST /api/stripe/subscription — change or cancel the plan the user already has.
//
// Checkout is for people with no subscription. Sending an existing subscriber
// through checkout again would open a SECOND subscription and bill them twice,
// so a plan switch edits the subscription in place instead. Stripe then emits
// customer.subscription.updated and the webhook moves the tier and the Ink.
//
//   { tier: "starter" | "pro" | "premium" }  → switch, prorated
//   { action: "cancel" }                     → stop at the end of the paid period
//   { action: "resume" }                     → undo a pending cancellation
//
// A user with no active subscription gets 409 { needsCheckout: true } so the
// caller can fall back to /api/stripe/checkout.

const TIERS = ["starter", "pro", "premium"] as const;
type Tier = (typeof TIERS)[number];
const isTier = (v: unknown): v is Tier => typeof v === "string" && (TIERS as readonly string[]).includes(v);

/** Stripe reports period end in seconds; the UI wants a plain ISO day. */
function periodEndISO(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { tier, action } = body as { tier?: unknown; action?: unknown };

  const supabase = createServerClient();
  const { data: balance } = await supabase
    .from("ink_balances")
    .select("stripe_subscription_id, tier")
    .eq("user_id", user.id)
    .single();

  const subscriptionId = (balance?.stripe_subscription_id as string | null) ?? null;
  if (!subscriptionId) {
    return NextResponse.json({ needsCheckout: true, error: "No active subscription" }, { status: 409 });
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
      return NextResponse.json({ needsCheckout: true, error: "No active subscription" }, { status: 409 });
    }

    if (action === "cancel") {
      const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
      return NextResponse.json({
        canceled: true,
        // Access runs to the end of the period already paid for.
        activeUntil: periodEndISO((updated as unknown as { current_period_end?: number }).current_period_end),
      });
    }

    if (action === "resume") {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
      return NextResponse.json({ resumed: true });
    }

    if (!isTier(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    if (balance?.tier === tier && !subscription.cancel_at_period_end) {
      return NextResponse.json({ error: "That is already your plan" }, { status: 400 });
    }

    const item = subscription.items.data[0];
    if (!item) {
      logger.error("subscription has no items — cannot switch plan", {
        route: "/api/stripe/subscription",
        meta: { subscription: subscriptionId },
      });
      return NextResponse.json({ error: "Could not change plan" }, { status: 502 });
    }

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: STRIPE_PRICES[tier] }],
      // Bill the difference now rather than silently at renewal.
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
    });

    // The tier and Ink move on the customer.subscription.updated webhook, which
    // is the single place a paid tier is ever written.
    return NextResponse.json({ switched: true, tier });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe subscription error";
    logger.error("subscription change failed", {
      route: "/api/stripe/subscription",
      meta: { subscription: subscriptionId, message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
