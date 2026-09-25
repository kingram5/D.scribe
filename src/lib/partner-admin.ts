import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getUser } from "@/lib/auth";
import { isPartnerAdmin } from "@/lib/partners";

export type AdminCaller = { kind: "session"; email: string } | { kind: "key" };

function keyMatches(given: string | null): boolean {
  const want = process.env.PARTNER_ADMIN_KEY ?? "";
  if (!given || want.length < 24) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Who may run partner admin actions. Kyle's signed-in session always; the
 * machine key (for BMO acting on Kyle's Telegram word) only where `allowKey`.
 * Money never moves on the key: payout release passes allowKey=false.
 */
export async function requirePartnerAdmin(req: NextRequest, allowKey: boolean):
  Promise<{ caller: AdminCaller; error: null } | { caller: null; error: NextResponse }> {
  if (allowKey && keyMatches(req.headers.get("x-partner-admin-key"))) return { caller: { kind: "key" }, error: null };
  const user = await getUser();
  if (user?.email && user.email_confirmed_at && isPartnerAdmin(user.email)) {
    return { caller: { kind: "session", email: user.email }, error: null };
  }
  return { caller: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
}
