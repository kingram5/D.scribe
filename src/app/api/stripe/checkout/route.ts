import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { tier } = await req.json();

  if (!["starter", "pro", "premium"].includes(tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  let customerId = balance?.stripe_customer_id as string | null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;

    await supabase
      .from("ink_balances")
      .upsert({ user_id: user.id, stripe_customer_id: customerId });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

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
