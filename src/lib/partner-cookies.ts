import type { NextResponse } from "next/server";
import { REF_COOKIE, REF_COOKIE_DAYS, REF_NAME_COOKIE } from "@/lib/partner-rules";

/** Remember which creator sent this visitor (slug for the claim, name for the banner). */
export function setReferralCookies(res: NextResponse, partner: { slug: string | null; name: string }) {
  if (!partner.slug) return res;
  const maxAge = REF_COOKIE_DAYS * 86_400;
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(REF_COOKIE, partner.slug, { path: "/", maxAge, sameSite: "lax", secure, httpOnly: true });
  // readable by the page so the "invited by" banner can show without a server round-trip
  res.cookies.set(REF_NAME_COOKIE, encodeURIComponent(partner.name.slice(0, 60)), { path: "/", maxAge, sameSite: "lax", secure, httpOnly: false });
  return res;
}

export function clearReferralCookies(res: NextResponse) {
  res.cookies.set(REF_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REF_NAME_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
