import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const supabase = createServerClient();

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  const customerId = balance?.stripe_customer_id as string | null;

  if (!customerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
