import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { recordFlatInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";
import { createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { inkLiveSessionCost, liveDurationSeconds } from "@/lib/brainstorm-live";

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm-live-usage", 20);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, session_id, usage, duration_seconds } = (body ?? {}) as {
    project_id?: unknown;
    session_id?: unknown;
    usage?: unknown;
    duration_seconds?: unknown;
  };

  if (typeof project_id !== "string" || !project_id) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  if (typeof session_id !== "string" || !session_id.startsWith("live_")) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const seconds = liveDurationSeconds(
    usage,
    typeof duration_seconds === "number" ? duration_seconds : 0,
  );
  const inkCost = inkLiveSessionCost(seconds);
  if (inkCost <= 0) {
    return NextResponse.json({ ok: true, ink: 0, seconds: 0 });
  }

  try {
    await recordFlatInkUsage(user.id, project.id, "brainstorm_live", "gpt-live-1", inkCost);
  } catch (error) {
    logger.error("Live Ink settle failed", {
      route: "/api/brainstorm/live/usage",
      userId: user.id,
      error,
      meta: { session_id, seconds, inkCost },
    });
    if (error instanceof Error && /Insufficient Ink/i.test(error.message)) {
      return NextResponse.json({ error: "out_of_ink", message: error.message }, { status: 402 });
    }
    return NextResponse.json({ error: "Could not record Live usage" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ink: inkCost, seconds });
}
