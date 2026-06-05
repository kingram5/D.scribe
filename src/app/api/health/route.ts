import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Lightweight liveness/readiness probe for uptime monitors. No auth (middleware
// exempts /api/*). Returns 200 when the app + DB are reachable, 503 if the DB
// round-trip fails. Keep this cheap — it gets polled frequently.
export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = createServerClient();
    // Cheapest round-trip that proves the DB connection is alive.
    const { error } = await supabase.from("ink_balances").select("user_id").limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok", db: "up", ms: Date.now() - startedAt });
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "down", ms: Date.now() - startedAt },
      { status: 503 }
    );
  }
}
