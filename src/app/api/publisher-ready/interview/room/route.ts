import { NextRequest, NextResponse } from "next/server";
import { checkInk } from "@/lib/ink";
import { createServerClient } from "@/lib/supabase";
import { serveNext, submitAnswer, skipQuestion, finishChapter, type InterviewState } from "@/lib/publisher-ready/interview";
import { welcomeLine, nextLine } from "@/lib/publisher-ready/room-lines";
import { requireAuth } from "@/lib/auth";
import { guard, errorResponse } from "../../_shared";

export const maxDuration = 60;

/**
 * The second interview room (flow v2): the same studio as the first interview,
 * speaking the brainstorm stream format (`data: {"text"}` ... `data: [DONE]`)
 * so the studio's voice, dictation and hands-free code is reused as is.
 * Everything the author says answers the question currently on the table.
 *
 * POST { run_id, action: "start" | "answer" | "skip" | "next_chapter", text?, follow_up_of? }
 * Extra event: data: {"review_state": { follow_up_of, done, remaining, answered }}
 */
export async function POST(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "interview-room", 60);
  if (error) return error;
  try {
    const body = await req.json();
    const runId = String(body.run_id ?? "");
    if (!runId) return NextResponse.json({ error: "run_id required" }, { status: 400 });
    const ink = await checkInk(user.id, "pr_interview");
    if (!ink.allowed) return NextResponse.json({ error: "out_of_ink", message: ink.reason }, { status: 402 });

    const db = createServerClient();
    const { data: run } = await db.from("pr_runs").select("id").eq("id", runId).eq("user_id", user.id).maybeSingle();
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    // The question currently on the table (served, not yet answered or skipped).
    const { data: current } = await db.from("pr_questions").select("id, chapter_id")
      .eq("run_id", runId).eq("status", "asked").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const { count: answeredBefore } = await db.from("pr_answers").select("id", { count: "exact", head: true }).eq("run_id", runId);

    let line = "";
    let followUpOf: string | null = null;
    let state: InterviewState | null = null;
    const action = String(body.action ?? "start");

    if (action === "answer") {
      const text = String(body.text ?? "").trim();
      if (!text) return NextResponse.json({ error: "Say something first." }, { status: 400 });
      if (current) {
        const out = await submitAnswer({
          userId: user.id, runId, questionId: current.id, transcript: text, source: "voice",
          followUpOf: typeof body.follow_up_of === "string" ? body.follow_up_of : null,
        });
        if (out.followUp) { line = out.followUp; followUpOf = out.answerId; }
      }
      if (!line) { state = await serveNext(user.id, runId); line = nextLine(state.next, answeredBefore ?? 0); }
    } else if (action === "skip" || action === "next_chapter") {
      if (current) {
        if (action === "skip") await skipQuestion(user.id, runId, current.id);
        else await finishChapter(user.id, runId, current.chapter_id);
      }
      state = await serveNext(user.id, runId);
      line = nextLine(state.next, answeredBefore ?? 0, true);
    } else {
      state = await serveNext(user.id, runId);
      line = welcomeLine(state.next, answeredBefore ?? 0);
    }

    const reviewState = {
      follow_up_of: followUpOf,
      done: !followUpOf && !!state && !state.next,
      remaining: state?.progress.remaining ?? null,
      answered: state?.progress.answered ?? null,
    };
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: line })}\n\n`));
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ review_state: reviewState })}\n\n`));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (err) {
    return errorResponse(err, "/api/publisher-ready/interview/room", user.id);
  }
}
