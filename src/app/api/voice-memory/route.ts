import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkInk } from "@/lib/ink";
import { distillStyleMemory, loadStyleMemory } from "@/lib/style-memory";
import { logger } from "@/lib/logger";

// GET /api/voice-memory — the user's current distilled style memory
export async function GET() {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const memory = await loadStyleMemory(user.id);
  return NextResponse.json({ memory });
}

// POST /api/voice-memory — distill recent edits into updated style memory.
// Fired by the editor after a save when enough edits have accumulated;
// one Haiku call, Ink-metered.
export async function POST() {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const inkCheck = await checkInk(user.id, "style_distill");
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  try {
    const memory = await distillStyleMemory(user.id);
    return NextResponse.json({ memory, distilled: memory !== null });
  } catch (err) {
    logger.error("Style memory distillation failed", {
      route: "/api/voice-memory",
      userId: user.id,
      error: err,
    });
    return NextResponse.json({ error: "Distillation failed" }, { status: 500 });
  }
}
