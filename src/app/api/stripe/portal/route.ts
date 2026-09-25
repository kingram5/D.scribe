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
    .select("stripe_customer_id, comp_partner, stripe_subscription_id")
    .eq("user_id", user.id)
    .single();

  const customerId = balance?.stripe_customer_id as string | null;

  // creator partners get Premium on the house; there's no bill to manage
  if (balance?.comp_partner && !balance?.stripe_subscription_id) {
    return NextResponse.json({ error: "Your Premium is on the house as a D.Scribe partner. There's no bill to manage." }, { status: 409 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    // Most common cause: the Stripe Customer Portal hasn't been configured/saved
    // in the Stripe dashboard for this mode (test vs live). Surface it instead of 500ing blind.
    const message = e instanceof Error ? e.message : "Stripe billing portal error";
    console.error("[stripe/portal] billingPortal.sessions.create failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
