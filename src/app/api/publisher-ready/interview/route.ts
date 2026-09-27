import { NextRequest, NextResponse } from "next/server";
import { checkInk } from "@/lib/ink";
import { serveNext, submitAnswer, skipQuestion, finishChapter, finishInterview } from "@/lib/publisher-ready/interview";
import { requireAuth } from "@/lib/auth";
import { guard, errorResponse } from "../_shared";

export const maxDuration = 60;

// POST /api/publisher-ready/interview
//   { run_id, action: "next" }
//   { run_id, action: "answer", question_id, transcript, source?, follow_up_of? }
//   { run_id, action: "skip", question_id }
//   { run_id, action: "finish_chapter", chapter_id }
//   { run_id, action: "finish" }
export async function POST(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "interview", 60);
  if (error) return error;
  try {
    const body = await req.json();
    const runId = body.run_id;
    if (!runId) return NextResponse.json({ error: "run_id required" }, { status: 400 });

    switch (body.action) {
      case "next": {
        const ink = await checkInk(user.id, "pr_interview");
        if (!ink.allowed) return NextResponse.json({ error: "out_of_ink", message: ink.reason }, { status: 402 });
        return NextResponse.json(await serveNext(user.id, runId));
      }
      case "answer": {
        const out = await submitAnswer({
          userId: user.id, runId, questionId: body.question_id, transcript: String(body.transcript ?? ""),
          source: body.source === "voice" ? "voice" : "typed", followUpOf: body.follow_up_of ?? null,
        });
        return NextResponse.json(out);
      }
      case "skip":
        await skipQuestion(user.id, runId, body.question_id);
        return NextResponse.json({ ok: true });
      case "finish_chapter":
        await finishChapter(user.id, runId, body.chapter_id);
        return NextResponse.json({ ok: true });
      case "finish":
        await finishInterview(user.id, runId);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, "/api/publisher-ready/interview", user.id);
  }
}
