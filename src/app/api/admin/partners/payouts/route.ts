import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { requirePartnerAdmin } from "@/lib/partner-admin";
import { stripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";
import { PAYOUT_MINIMUM_CENTS } from "@/lib/partner-rules";

export const dynamic = "force-dynamic";

type Row = { id: string; partner_id: string; commission_cents: number };
type PartnerRow = { id: string; name: string; status: string; stripe_connect_account_id: string | null };

async function payableRows(): Promise<{ partners: PartnerRow[]; byPartner: Map<string, Row[]> }> {
  const supabase = createServerClient();
  const { data: partners } = await supabase
    .from("partners").select("id, name, status, stripe_connect_account_id").in("status", ["active", "paused"]);
  const { data: rows } = await supabase
    .from("partner_commissions").select("id, partner_id, commission_cents")
    .eq("status", "held").is("payout_id", null).lte("available_at", new Date().toISOString());
  const byPartner = new Map<string, Row[]>();
  for (const r of (rows ?? []) as Row[]) byPartner.set(r.partner_id, [...(byPartner.get(r.partner_id) ?? []), r]);
  return { partners: (partners ?? []) as PartnerRow[], byPartner };
}

async function transfersReady(accountId: string | null): Promise<boolean> {
  if (!accountId) return false;
  try {
    const acct = await stripe.accounts.retrieve(accountId);
    return acct.capabilities?.transfers === "active";
  } catch {
    return false;
  }
}

// GET — what this month's release would pay, per creator. Moves nothing.
export async function GET(req: NextRequest) {
  const { error } = await requirePartnerAdmin(req, false);
  if (error) return error;
  const { partners, byPartner } = await payableRows();
  const lines = await Promise.all(partners.map(async (p) => {
    const rows = byPartner.get(p.id) ?? [];
    const cents = rows.reduce((s, r) => s + r.commission_cents, 0);
    const ready = cents > 0 ? await transfersReady(p.stripe_connect_account_id) : false;
    return { partner_id: p.id, name: p.name, cents, commissions: rows.length, payouts_ready: ready, eligible: ready && cents >= PAYOUT_MINIMUM_CENTS };
  }));
  return NextResponse.json({ minimum_cents: PAYOUT_MINIMUM_CENTS, lines: lines.filter((l) => l.cents > 0) });
}

// POST — Kyle's one-button release. Signed-in admin session ONLY (no machine
// key): no script or agent can move money. One Stripe transfer per creator,
// idempotent on the exact set of commissions it pays.
export async function POST(req: NextRequest) {
  const { caller, error } = await requirePartnerAdmin(req, false);
  if (error || caller?.kind !== "session") return error ?? NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createServerClient();
  const { partners, byPartner } = await payableRows();
  const results: { name: string; cents: number; status: string; error?: string }[] = [];

  for (const p of partners) {
    const rows = byPartner.get(p.id) ?? [];
    const cents = rows.reduce((s, r) => s + r.commission_cents, 0);
    if (cents < PAYOUT_MINIMUM_CENTS) continue;
    if (!(await transfersReady(p.stripe_connect_account_id))) {
      results.push({ name: p.name, cents, status: "skipped", error: "payouts not set up" });
      continue;
    }
    const ids = rows.map((r) => r.id).sort();
    const key = `partner-payout-${p.id}-${createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 32)}`;
    try {
      const transfer = await stripe.transfers.create(
        { amount: cents, currency: "usd", destination: p.stripe_connect_account_id!, description: `D.Scribe partner commission (${ids.length} payments)`, metadata: { partner_id: p.id } },
        { idempotencyKey: key },
      );
      const { data: payout } = await supabase.from("partner_payouts")
        .insert({ partner_id: p.id, amount_cents: cents, status: "released", stripe_transfer_id: transfer.id, released_by: caller.email })
        .select("id").single();
      await supabase.from("partner_commissions").update({ status: "paid", payout_id: payout?.id ?? null }).in("id", ids);
      results.push({ name: p.name, cents, status: "released" });
    } catch (err) {
      const message = (err as Error).message;
      logger.error("Partner payout transfer failed", { route: "/api/admin/partners/payouts", meta: { partner: p.id, cents }, error: err });
      await supabase.from("partner_payouts").insert({ partner_id: p.id, amount_cents: cents, status: "failed", error: message.slice(0, 500), released_by: caller.email });
      results.push({ name: p.name, cents, status: "failed", error: message });
    }
  }
  return NextResponse.json({ results });
}
