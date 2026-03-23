import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkCredits } from "@/lib/credits";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { balance } = await checkCredits(user.id);
  return NextResponse.json({ balance });
}
