import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getInkBalance, getInkHistory } from "@/lib/ink";

// GET /api/ink — get current Ink balance + breakdown
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const includeHistory = searchParams.get("history") === "true";

  const balance = await getInkBalance(user.id);

  if (includeHistory) {
    const history = await getInkHistory(user.id);
    return NextResponse.json({ ...balance, history });
  }

  return NextResponse.json(balance);
}
