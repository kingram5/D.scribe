import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getInkBalance } from "@/lib/ink";

// Legacy endpoint — now a thin read over the Ink wallet (the only wallet after the
// job-system retire). Kept so the useCredits hook / CreditBadge keep working until
// the UI reads /api/ink directly. Returns the same { balance } shape as before.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { balance } = await getInkBalance(user.id);
  return NextResponse.json({ balance });
}
