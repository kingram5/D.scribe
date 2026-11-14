import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requirePartnerAdmin } from "@/lib/partner-admin";
import { PAID_DEFINITION, summarizeAttribution, type AttributionRow } from "@/lib/attribution";

export const dynamic = "force-dynamic";

// GET /api/admin/attribution: aggregates behind the existing admin gate
// (Kyle's signed-in session; no machine key). Counts by self-reported source,
// by UTC week, self-reported vs passive channel, and conversion to paid.
//
// "Paid" = the account is on a paid plan right now: ink_balances.tier is not
// 'free' and it is not a comp partner account. Accounts that paid and later
// cancelled count as unpaid.

const PAGE = 1000; // PostgREST caps a select at 1,000 rows; page past it
const MAX_ROWS = 50_000;

export async function GET(req: NextRequest) {
  const { error } = await requirePartnerAdmin(req, false);
  if (error) return error;

  const supabase = createServerClient();
  const rows: AttributionRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error: qErr } = await supabase
      .from("user_attribution")
      .select("user_id, attribution_source, attribution_detail, landing_url, referrer, null_referrer, utm_source, ai_referrer, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (qErr) {
      return NextResponse.json({ available: false, reason: "The user_attribution table is missing or unreadable. Run migration 033_signup_attribution.sql." });
    }
    rows.push(...((data ?? []) as AttributionRow[]));
    if (!data || data.length < PAGE) break;
  }

  const paid = new Set<string>();
  const ids = rows.map((r) => r.user_id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let res = await supabase.from("ink_balances").select("user_id, tier, comp_partner").in("user_id", chunk);
    if (res.error) res = await supabase.from("ink_balances").select("user_id, tier").in("user_id", chunk) as typeof res;
    for (const b of (res.data ?? []) as { user_id: string; tier: string | null; comp_partner?: boolean | null }[]) {
      if (b.tier && b.tier !== "free" && !b.comp_partner) paid.add(b.user_id);
    }
  }

  return NextResponse.json({
    available: true,
    generated_at: new Date().toISOString(),
    paid_definition: PAID_DEFINITION,
    summary: summarizeAttribution(rows, paid),
  });
}
