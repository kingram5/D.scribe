import { readLiveTranscripts } from "@/lib/theo/live-events";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { ensureBalance } from "@/lib/ink";
import { editorFinished, submitAnswer } from "@/lib/publisher-ready/interview";
import { guard, errorResponse } from "../../publisher-ready/_shared";
import { liveConfig } from "@/lib/theo/live-config";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;
  try {
    const db = createServerClient();
    const sid = req.nextUrl.searchParams.get("session_id");
    if (!sid) {
      const config = liveConfig(user.id);
      const { data: worker } = config
        ? await db
            .from("theo_live_workers")
            .select("id")
            .gt("heartbeat_at", new Date(Date.now() - 15000).toISOString())
            .limit(1)
            .maybeSingle()
        : { data: null };
      const balance = config ? await ensureBalance(user.id) : null;
      return NextResponse.json({
        available:
          !!config &&
          !!worker &&
          ["pro", "premium"].includes(balance?.tier ?? ""),
      });
    }
    const { data: session } = await db
      .from("theo_live_sessions")
      .select(
        "id,run_id,state,answer,reserved_seconds,used_seconds,failure,last_answer_ms",
      )
      .eq("id", sid)
      .eq("user_id", user.id)
      .single();
    if (!session)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const events = await readLiveTranscripts(sid);
    const { data: answers } = await db
      .from("pr_answers")
      .select("id,transcript")
      .eq("run_id", session.run_id)
      .eq("user_id", user.id)
      .like("source_event_key", `${sid}:%`)
      .order("created_at");
    return NextResponse.json({
      ...session,
      events: events ?? [],
      answers: answers ?? [],
    });
  } catch (e) {
    return errorResponse(e, "/api/theo/live", user.id);
  }
}
export async function POST(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "live-create", 10);
  if (error) return error;
  try {
    const config = liveConfig(user.id);
    if (!config)
      return NextResponse.json(
        { error: "Live voice is unavailable. You can continue typing." },
        { status: 404 },
      );
    const body = await req.json();
    if (
      typeof body.run_id !== "string" ||
      typeof body.sdp !== "string" ||
      body.sdp.length > 64000 ||
      !body.sdp.startsWith("v=")
    )
      return NextResponse.json(
        { error: "Invalid voice connection" },
        { status: 400 },
      );
    if (!(await editorFinished(user.id, body.run_id)))
      return NextResponse.json(
        { error: "Finish the editor review first" },
        { status: 409 },
      );
    await ensureBalance(user.id);
    const { data, error: reserveError } = await createServerClient().rpc(
      "theo_live_reserve",
      {
        p_user_id: user.id,
        p_run_id: body.run_id,
        p_offer: body.sdp,
        p_caps: config.caps,
        p_rate: config.rate,
      },
    );
    if (reserveError)
      return NextResponse.json(
        {
          error:
            "Live voice is busy or unavailable for this allowance. Continue typing.",
        },
        { status: 409 },
      );
    return NextResponse.json({ session_id: data }, { status: 202 });
  } catch (e) {
    return errorResponse(e, "/api/theo/live", user.id);
  }
}
export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;
  try {
    const { session_id, action, answer_id, transcript } = await req.json();
    if (action === "confirm") {
      if (
        typeof transcript !== "string" ||
        !transcript.trim() ||
        transcript.length > 8000
      )
        return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
      const db = createServerClient();
      const { data: s } = await db
        .from("theo_live_sessions")
        .select("run_id,state,follow_up_of")
        .eq("id", session_id)
        .eq("user_id", user.id)
        .single();
      if (!s || s.state !== "closed")
        return NextResponse.json({ error: "End voice first" }, { status: 409 });
      const { data: existing } = await db
        .from("pr_answers")
        .select("id")
        .eq("run_id", s.run_id)
        .eq("source_event_key", `${session_id}:confirmed-remainder`)
        .maybeSingle();
      if (existing) return NextResponse.json({ ok: true });
      const { data: q } = await db
        .from("pr_questions")
        .select("id")
        .eq("run_id", s.run_id)
        .eq("status", "asked")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!q)
        return NextResponse.json(
          { error: "No pending question. Continue in the interview." },
          { status: 409 },
        );
      await submitAnswer({
        userId: user.id,
        runId: s.run_id,
        questionId: q.id,
        transcript,
        source: "voice",
        followUpOf: s.follow_up_of,
        sourceEventKey: `${session_id}:confirmed-remainder`,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "correct") {
      if (
        typeof session_id !== "string" ||
        typeof answer_id !== "string" ||
        typeof transcript !== "string" ||
        !transcript.trim() ||
        transcript.length > 8000
      )
        return NextResponse.json(
          { error: "Invalid correction" },
          { status: 400 },
        );
      const corrected = await createServerClient().rpc("theo_correct_answer", {
        p_session: session_id,
        p_user: user.id,
        p_answer: answer_id,
        p_text: transcript.trim(),
      });
      return corrected.error
        ? NextResponse.json(
            {
              error: "End voice before correcting an answer in this interview.",
            },
            { status: 409 },
          )
        : NextResponse.json({ ok: true });
    }
    if (
      !["heartbeat", "end"].includes(action) ||
      typeof session_id !== "string"
    )
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    // Ending remains available after feature flags are disabled.
    const { data, error: updateError } = await createServerClient()
      .from("theo_live_sessions")
      .update({
        client_seen_at: new Date().toISOString(),
        ...(action === "end" ? { end_requested: true } : {}),
      })
      .eq("id", session_id)
      .eq("user_id", user.id)
      .select("id")
      .single();
    if (updateError || !data)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "/api/theo/live", user.id);
  }
}
