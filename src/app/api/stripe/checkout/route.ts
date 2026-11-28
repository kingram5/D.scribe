import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import {
  claimReferral,
  findActivePartnerBySlug,
  hadSubscriptionBefore,
  referralFor,
} from "@/lib/partners";
import { REF_COOKIE } from "@/lib/partner-rules";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { planPriceFor, stripe, TOPUP_PRICES } from "@/lib/stripe";
import { foundingStatus } from "@/lib/founding";
import { PLAN_99_TIER, plan99 } from "@/lib/tiers";
import {
  canBuyInkPack,
  canBuyVoicePack,
  isTopupSku,
  safeReturnTo,
  type TopupSku,
} from "@/lib/topups";

async function ensureStripeCustomer(
  userId: string,
  email: string | undefined,
  existingId: string | null,
) {
  if (existingId) return existingId;
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });
  const supabase = createServerClient();
  await supabase
    .from("ink_balances")
    .upsert({ user_id: userId, stripe_customer_id: customer.id });
  return customer.id;
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { tier, topup, return_to } = body as {
    tier?: unknown;
    topup?: unknown;
    return_to?: unknown;
  };

  const supabase = createServerClient();

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("stripe_customer_id, tier, topup_tts_chars")
    .eq("user_id", user.id)
    .single();

  const existingCustomerId = (balance?.stripe_customer_id as string | null) ?? null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (isTopupSku(topup)) {
    const sku: TopupSku = topup;
    const price = TOPUP_PRICES[sku];
    if (!price) {
      return NextResponse.json({ error: "Top-up is not configured" }, { status: 503 });
    }

    const tierName = (balance?.tier as string | undefined) ?? "free";
    const topupTts = Number(balance?.topup_tts_chars ?? 0);
    const allowed = sku === "voice_pack"
      ? canBuyVoicePack(tierName, topupTts)
      : canBuyInkPack(tierName, !!existingCustomerId);
    if (!allowed) {
      return NextResponse.json({ error: "This refill is not available on your plan." }, { status: 403 });
    }

    const customerId = await ensureStripeCustomer(user.id, user.email, existingCustomerId);
    const successPath = safeReturnTo(return_to);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${siteUrl}${successPath}`,
      cancel_url: `${siteUrl}/dashboard`,
      metadata: { user_id: user.id, kind: "topup", sku },
    });

    return NextResponse.json({ url: session.url });
  }

  if (typeof tier !== "string" || !["starter", "pro", "premium"].includes(tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  // Plan 99 on: only the $99 plan is sold, and never at a fallback price.
  const plan = planPriceFor(tier);
  if (!plan.ok) {
    if (plan.status === 503) {
      logger.error("Plan 99 is on but STRIPE_PRICE_PLAN_99 is missing or reuses another price id; checkout refused", {
        route: "/api/stripe/checkout",
        meta: { user_id: user.id },
      });
    }
    return NextResponse.json({ error: plan.error }, { status: plan.status });
  }

  const customerId = await ensureStripeCustomer(user.id, user.email, existingCustomerId);

  // Creator program. The pricing buttons go sign-in -> checkout without ever
  // loading the dashboard, so a creator link's cookie is claimed here too. A
  // first-time subscriber referred by an active creator gets the creator's 50%
  // pre-applied; everyone else gets the code box. None of this may block a sale.
  let promotionCode: string | null = null;
  try {
    let ref = await referralFor(user.id);
    const slug = req.cookies.get(REF_COOKIE)?.value;
    if (!ref && slug) {
      const partner = await findActivePartnerBySlug(slug);
      if (partner) {
        await claimReferral({ userId: user.id, email: user.email, userCreatedAt: user.created_at, partner, source: "link" });
        ref = await referralFor(user.id);
      }
    }
    if (ref?.partner.status === "active" && ref.partner.stripe_promotion_code_id && !(await hadSubscriptionBefore(customerId))) {
      promotionCode = ref.partner.stripe_promotion_code_id;
    }
  } catch (err) {
    logger.warn("Creator discount lookup failed; checkout continues with the code box", {
      route: "/api/stripe/checkout",
      meta: { user_id: user.id },
      error: err,
    });
  }

  // Founding 100 (src/lib/founding.ts): while seats remain, a first-time
  // subscriber to the $99 plan gets $49/month for life, applied automatically.
  // It beats a creator's first-month 50%; the referral above is still claimed,
  // so the creator keeps their commission on what the buyer pays. Off unless
  // FOUNDING_OFFER=true and the capped code is live in Stripe.
  try {
    if (tier === PLAN_99_TIER && plan99()) {
      const founding = await foundingStatus();
      if (founding && founding.remaining > 0 && !(await hadSubscriptionBefore(customerId))) {
        promotionCode = founding.promoId;
      }
    }
  } catch (err) {
    logger.warn("Founding offer check failed; checkout continues without it", {
      route: "/api/stripe/checkout",
      meta: { user_id: user.id },
      error: err,
    });
  }

  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.price, quantity: 1 }],
    // `plan` lets the dashboard emit HeyCatch subscription_started client-side
    // (src/components/analytics/CheckoutOutcome.tsx); nothing reads `upgraded`.
    success_url: `${siteUrl}/dashboard?upgraded=true&plan=${tier}`,
    cancel_url: `${siteUrl}/dashboard`,
    metadata: { user_id: user.id, tier },
  };

  let session: Stripe.Checkout.Session;
  if (promotionCode) {
    try {
      session = await stripe.checkout.sessions.create({ ...base, discounts: [{ promotion_code: promotionCode }] });
    } catch (err) {
      // an expired, used-up or switched-off creator or founding code must never cost the sale
      logger.warn("Discount code could not be applied; falling back to the code box", {
        route: "/api/stripe/checkout",
        meta: { user_id: user.id, promotion_code: promotionCode },
        error: err,
      });
      session = await stripe.checkout.sessions.create({ ...base, allow_promotion_codes: true });
    }
  } else {
    session = await stripe.checkout.sessions.create({ ...base, allow_promotion_codes: true });
  }

  return NextResponse.json({ url: session.url });
}
