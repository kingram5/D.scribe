import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isPartnerAdmin } from "@/lib/partners";
import { isGrowthViewer } from "@/lib/growth-viewers";

// Who may open the growth dashboard (/admin/growth). Kyle 2026-11-25: he and
// Chiara both need it, Chiara without admin powers.
//
//   - partner admins (PARTNER_ADMIN_EMAILS): Kyle's signed-in session
//   - read-only viewers (GROWTH_VIEWER_EMAILS, see growth-viewers.ts): this
//     page and its read-only numbers, nothing else
//
// Both need a signed-in cookie session with a confirmed email (no machine key,
// no bearer token). Everyone else gets a 404, like the other admin pages, so
// the route's existence is not advertised.

export type GrowthCaller = { role: "admin" | "viewer"; email: string };

export async function requireGrowthViewer(): Promise<{ caller: GrowthCaller; error: null } | { caller: null; error: NextResponse }> {
  const user = await getUser();
  if (user?.email && user.email_confirmed_at) {
    if (isPartnerAdmin(user.email)) return { caller: { role: "admin", email: user.email }, error: null };
    if (isGrowthViewer(user.email)) return { caller: { role: "viewer", email: user.email }, error: null };
  }
  return { caller: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
}
