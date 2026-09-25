import { NextRequest, NextResponse } from "next/server";
import { findActivePartnerByCode } from "@/lib/partners";
import { normalizeCode } from "@/lib/partner-rules";
import { setReferralCookies } from "@/lib/partner-cookies";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";

// POST /api/partners/code { code } — someone typed a creator's code instead of
// using their link. Same effect as the link: remember the creator so the free
// Ink lands at sign-in and the 50% is pre-applied at checkout.
export async function POST(req: NextRequest) {
  const { allowed } = await checkRateLimit(`ip:${clientIp(req)}`, "partners/code", 10, 60_000, "local");
  if (!allowed) return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode((body as { code?: unknown }).code);
  if (!code) return NextResponse.json({ error: "That code doesn't look right." }, { status: 400 });

  const partner = await findActivePartnerByCode(code).catch(() => null);
  if (!partner || !partner.slug) return NextResponse.json({ error: "We don't recognise that code." }, { status: 404 });

  return setReferralCookies(NextResponse.json({ ok: true, name: partner.name }), partner);
}
