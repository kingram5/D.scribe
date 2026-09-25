import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { findPartnerForUser } from "@/lib/partners";
import { stripe } from "@/lib/stripe";
import { payableCents } from "@/lib/partner-rules";

export const dynamic = "force-dynamic";

// GET /api/partners/me — the signed-in creator's own numbers.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const partner = await findPartnerForUser(user.id, user.email);
  if (!partner || (partner.status !== "active" && partner.status !== "paused")) {
    return NextResponse.json({ partner: null });
  }

  const supabase = createServerClient();
  const [{ data: clicks }, { data: refs }, { data: commissions }, { data: payouts }] = await Promise.all([
    supabase.from("partner_clicks").select("clicks").eq("partner_id", partner.id),
    supabase.from("referrals").select("first_paid_at, bonus_ink").eq("partner_id", partner.id),
    supabase.from("partner_commissions").select("commission_cents, status, available_at, payout_id").eq("partner_id", partner.id),
    supabase.from("partner_payouts").select("amount_cents, status, created_at").eq("partner_id", partner.id).order("created_at", { ascending: false }).limit(12),
  ]);

  const rows = commissions ?? [];
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + r.commission_cents, 0);

  let payoutsReady = false;
  if (partner.stripe_connect_account_id) {
    try {
      const acct = await stripe.accounts.retrieve(partner.stripe_connect_account_id);
      payoutsReady = acct.capabilities?.transfers === "active";
    } catch { /* treat as not ready */ }
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.d-scribe.app";
  return NextResponse.json({
    partner: {
      name: partner.name,
      status: partner.status,
      code: partner.code,
      link: partner.slug ? `${site.replace(/\/$/, "")}/r/${partner.slug}` : null,
      commission_rate: Number(partner.commission_rate),
      commission_months: partner.commission_months,
    },
    stats: {
      clicks: (clicks ?? []).reduce((s, r) => s + (r.clicks as number), 0),
      signups: (refs ?? []).length,
      paying: (refs ?? []).filter((r) => r.first_paid_at).length,
      held_cents: sum((r) => r.status === "held" && !r.payout_id) - payableCents(rows),
      payable_cents: payableCents(rows),
      paid_cents: sum((r) => r.status === "paid"),
    },
    payouts: payouts ?? [],
    payouts_ready: payoutsReady,
    payouts_started: !!partner.stripe_connect_account_id,
  });
}
