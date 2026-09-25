import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { findActivePartnerBySlug } from "@/lib/partners";
import { normalizeSlug, REF_COOKIE } from "@/lib/partner-rules";
import { setReferralCookies } from "@/lib/partner-cookies";

export const dynamic = "force-dynamic";

// d-scribe.app/r/<slug>: a creator's share link. Remembers the creator for 60
// days, counts the click, and lands the visitor on the site. `?to=pricing` sends
// them straight to the plans. An unknown or paused creator still lands them on
// the site, just without the offer.
const TARGETS: Record<string, string> = { home: "/", pricing: "/pricing" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const to = TARGETS[req.nextUrl.searchParams.get("to") ?? "home"] ?? "/";
  const dest = new URL(to, req.nextUrl.origin);
  const slug = normalizeSlug(raw);
  if (!slug) return NextResponse.redirect(dest);

  const partner = await findActivePartnerBySlug(slug).catch(() => null);
  if (!partner) return NextResponse.redirect(dest);

  // count a visitor once, not every reload
  if (req.cookies.get(REF_COOKIE)?.value !== slug) {
    await createServerClient().rpc("bump_partner_click", { p_partner_id: partner.id }).then(() => undefined, () => undefined);
  }
  return setReferralCookies(NextResponse.redirect(dest), partner);
}
