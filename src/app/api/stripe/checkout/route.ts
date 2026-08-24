import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { stripe, STRIPE_PRICES, TOPUP_PRICES } from "@/lib/stripe";
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

  const customerId = await ensureStripeCustomer(user.id, user.email, existingCustomerId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PRICES[tier], quantity: 1 }],
    success_url: `${siteUrl}/dashboard?upgraded=true`,
    cancel_url: `${siteUrl}/dashboard`,
    metadata: { user_id: user.id, tier },
  });

  return NextResponse.json({ url: session.url });
}
