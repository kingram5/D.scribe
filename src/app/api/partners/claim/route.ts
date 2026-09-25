import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { claimReferral, findActivePartnerBySlug, findPartnerForUser } from "@/lib/partners";
import { REF_COOKIE } from "@/lib/partner-rules";
import { clearReferralCookies } from "@/lib/partner-cookies";

// POST /api/partners/claim — runs once after sign-in when a creator's cookie is
// present: attaches the account to that creator and adds the free Ink if the
// account qualifies. Also links an approved creator's own account to their
// partner record. Always clears the cookie so it fires once.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // an approved creator signing in for the first time gets linked (and comp Premium)
  await findPartnerForUser(user.id, user.email).catch(() => null);

  const slug = req.cookies.get(REF_COOKIE)?.value;
  if (!slug) return clearReferralCookies(NextResponse.json({ claimed: false, bonus: 0 }));

  const partner = await findActivePartnerBySlug(slug).catch(() => null);
  if (!partner) return clearReferralCookies(NextResponse.json({ claimed: false, bonus: 0 }));

  const result = await claimReferral({
    userId: user.id,
    email: user.email,
    userCreatedAt: user.created_at,
    partner,
    source: "link",
  });
  return clearReferralCookies(NextResponse.json(result));
}
