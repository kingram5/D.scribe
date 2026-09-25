import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { findPartnerForUser } from "@/lib/partners";
import { stripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";

// POST /api/partners/connect — sends a creator to Stripe to set up payouts.
// Their bank and tax details go to Stripe, never to us.
export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const partner = await findPartnerForUser(user.id, user.email);
  if (!partner || partner.status !== "active") {
    return NextResponse.json({ error: "Payouts are for active partners." }, { status: 403 });
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.d-scribe.app").replace(/\/$/, "");
  try {
    let accountId = partner.stripe_connect_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: partner.email,
        capabilities: { transfers: { requested: true } },
        metadata: { partner_id: partner.id },
      });
      accountId = account.id;
      await createServerClient().from("partners").update({ stripe_connect_account_id: accountId }).eq("id", partner.id);
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${site}/partner?payouts=retry`,
      return_url: `${site}/partner?payouts=done`,
    });
    return NextResponse.json({ url: link.url });
  } catch (err) {
    logger.error("Partner payout setup failed", { route: "/api/partners/connect", meta: { partner: partner.id }, error: err });
    return NextResponse.json({ error: "Payout setup isn't available yet. We'll let you know when it is." }, { status: 503 });
  }
}
