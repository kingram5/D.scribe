import { NextResponse } from "next/server";
import { FOUNDING_MONTHLY, foundingStatus } from "@/lib/founding";
import { PLAN_99, plan99 } from "@/lib/tiers";

// Public seat count for the Founding 100 banner (src/lib/founding.ts).
// Never exposes the promotion code id; only the numbers the banner prints.
export const dynamic = "force-dynamic";

export async function GET() {
  const status = plan99() ? await foundingStatus() : null;
  const body = status && status.remaining > 0
    ? { on: true, remaining: status.remaining, total: status.total, price: FOUNDING_MONTHLY, regular: PLAN_99.price }
    : { on: false };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
