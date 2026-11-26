import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireGrowthViewer } from "@/lib/growth-access";
import { PAYING_DEFINITION, isPaying, parseWindow, summarizeGrowth, windowStart, type SignupRow, type VisitRow } from "@/lib/growth";

export const dynamic = "force-dynamic";

// GET /api/admin/growth?days=7|30|90: the growth dashboard's numbers
// (Kyle 2026-11-25). Read-only, behind requireGrowthViewer (partner admins
// plus GROWTH_VIEWER_EMAILS; 404 for everyone else).
//
// FAIL SOFT: each source is read on its own. A missing table (migration 033
// not run) or a failed read marks that source unavailable and the rest still
// renders; the response is always 200 for a permitted caller.

const PAGE = 1000; // PostgREST caps a select at 1,000 rows; page past it
const MAX_ROWS = 50_000;
const VERCEL_ANALYTICS_URL = "https://vercel.com/kyles-projects-6adbe8c9/d-scribe/analytics";

type Sb = ReturnType<typeof createServerClient>;

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function payingIds(supabase: Sb, ids: string[]): Promise<Set<string> | null> {
  const paying = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    let res = await supabase.from("ink_balances").select("user_id, tier, stripe_subscription_id, comp_partner").in("user_id", chunk);
    // comp_partner arrived in 028; fall back rather than drop the paying column.
    if (res.error) res = (await supabase.from("ink_balances").select("user_id, tier, stripe_subscription_id").in("user_id", chunk)) as typeof res;
    if (res.error) return null;
    for (const b of (res.data ?? []) as { user_id: string; tier: string | null; stripe_subscription_id: string | null; comp_partner?: boolean | null }[]) {
      if (isPaying(b)) paying.add(b.user_id);
    }
  }
  return paying;
}

export async function GET(req: NextRequest) {
  const { caller, error } = await requireGrowthViewer();
  if (error) return error;

  const days = parseWindow(req.nextUrl.searchParams.get("days"));
  const now = new Date();
  const startDay = windowStart(days, now);

  try {
    const supabase = createServerClient();

    const visits = await readAll<VisitRow>((from, to) =>
      supabase.from("visit_channel_daily").select("day, channel, visits").gte("day", startDay).order("day", { ascending: true }).range(from, to));
    let countingSince: string | null = null;
    if (visits) {
      const first = await supabase.from("visit_channel_daily").select("day").order("day", { ascending: true }).limit(1);
      countingSince = (first.data as { day: string }[] | null)?.[0]?.day ?? null;
    }

    const signups = await readAll<SignupRow>((from, to) =>
      supabase
        .from("user_attribution")
        .select("user_id, attribution_source, referrer, null_referrer, utm_source, utm_medium, created_at")
        .gte("created_at", `${startDay}T00:00:00.000Z`)
        .order("created_at", { ascending: true })
        .range(from, to));

    const paying = signups ? await payingIds(supabase, signups.map((s) => s.user_id)) : null;

    if (!visits && !signups) {
      return NextResponse.json({
        available: false,
        reason: "The growth tables are missing or unreadable. Run migration 033_signup_attribution.sql in the Supabase SQL editor.",
      });
    }

    return NextResponse.json({
      available: true,
      generated_at: now.toISOString(),
      viewer: caller.role,
      sources: { visits: !!visits, signups: !!signups, paying: !!paying },
      paying_definition: PAYING_DEFINITION,
      vercel_analytics_url: process.env.GROWTH_VERCEL_ANALYTICS_URL?.trim() || VERCEL_ANALYTICS_URL,
      summary: summarizeGrowth({ visits: visits ?? [], signups: signups ?? [], paying: paying ?? new Set(), days, countingSince, now }),
    });
  } catch {
    return NextResponse.json({ available: false, reason: "Could not read the numbers right now. Try again in a minute." });
  }
}
