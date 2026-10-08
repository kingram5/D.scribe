import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { guard, errorResponse } from "../_shared";
import { liveEnabled } from "@/lib/theo/live-session";
import { editorFinished, serveNext } from "@/lib/publisher-ready/interview";
export const maxDuration = 60;
export async function GET() {
  const { user, error } = await guard(
    await requireAuth(),
    "live-capability",
    30,
  );
  if (error) return error;
  return NextResponse.json({
    enabled:
      liveEnabled(user.id) &&
      Boolean(
        process.env.THEO_LIVE_SUPERVISOR_URL &&
          process.env.THEO_LIVE_CAPABILITY_VERIFICATION,
      ),
  });
}
export async function POST(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "live", 120);
  if (error) return error;
  try {
    const body = await req.json();
    if (
      !["start", "stop", "pulse", "status"].includes(body.action) ||
      typeof body.run_id !== "string"
    )
      return NextResponse.json(
        { error: "Invalid Live request" },
        { status: 400 },
      );
    const db = createServerClient();
    const { data: run } = await db
      .from("pr_runs")
      .select("id,models")
      .eq("id", body.run_id)
      .eq("user_id", user.id)
      .single();
    if (!run)
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    // Rollback disables new sessions, but authenticated termination/status remain available.
    if (body.action === "start") {
      if (!liveEnabled(user.id))
        return NextResponse.json(
          { error: "Live unavailable" },
          { status: 404 },
        );
      if (!(await editorFinished(user.id, run.id)))
        return NextResponse.json(
          { error: "Finish editor review first" },
          { status: 409 },
        );
      const state = await serveNext(user.id, run.id);
      if (!state.next)
        return NextResponse.json(
          { error: "No pending question" },
          { status: 409 },
        );
    }
    const endpoint = process.env.THEO_LIVE_SUPERVISOR_URL,
      token = process.env.THEO_LIVE_SUPERVISOR_TOKEN;
    if (!endpoint || !token)
      return NextResponse.json(
        { error: "Live supervisor unavailable" },
        { status: 503 },
      );
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )
    )
      throw new Error("Supervisor must use HTTPS");
    const response = await fetch(new URL(`/${body.action}`, url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        actorId: user.id,
        runId: run.id,
        id: body.id,
        sdp: body.sdp,
      }),
      signal: AbortSignal.timeout(25000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
    });
  } catch (error) {
    return errorResponse(error, "/api/publisher-ready/live", user.id);
  }
}
