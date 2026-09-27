import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { checkInk } from "@/lib/ink";
import { stepDraft, stepEdit, stepRevise, stepFinal } from "@/lib/publisher-ready/pipeline";
import { requireAuth } from "@/lib/auth";
import { guard, errorResponse } from "../_shared";

// One chapter, one step. Opus/Fable turns can run for minutes, so the reply is
// an SSE stream: heartbeats keep the connection alive, then one result event.
export const maxDuration = 300;

const RUN_STATUS: Record<string, string> = { draft: "drafting", edit: "editing", revise: "revising", final: "checking" };
const OP: Record<string, "pr_draft" | "pr_edit" | "pr_revise" | "pr_final"> = {
  draft: "pr_draft", edit: "pr_edit", revise: "pr_revise", final: "pr_final",
};

// POST /api/publisher-ready/step { run_id, chapter_id, step, creative_freedom? }
export async function POST(req: NextRequest) {
  const { user, error } = await guard(await requireAuth(), "step", 40);
  if (error) return error;

  const { run_id, chapter_id, step, creative_freedom } = await req.json();
  if (!run_id || !chapter_id || !RUN_STATUS[step]) {
    return NextResponse.json({ error: "run_id, chapter_id and step (draft|edit|revise|final) required" }, { status: 400 });
  }
  const db = createServerClient();
  const { data: run } = await db.from("pr_runs").select("id, status").eq("id", run_id).eq("user_id", user.id).single();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.status === "done" || run.status === "cancelled") return NextResponse.json({ error: "This run is finished." }, { status: 409 });

  const ink = await checkInk(user.id, OP[step]);
  if (!ink.allowed) return NextResponse.json({ error: "out_of_ink", message: ink.reason }, { status: 402 });
  await db.from("pr_runs").update({ status: RUN_STATUS[step], updated_at: new Date().toISOString() }).eq("id", run_id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone */ }
      };
      // Heartbeat every 10s: thinking-heavy steps can be silent for minutes.
      const beat = setInterval(() => send({ heartbeat: true }), 10_000);
      try {
        const base = { userId: user.id, runId: run_id, chapterId: chapter_id };
        let result: unknown;
        if (step === "draft") result = await stepDraft({ ...base, creativeFreedom: creative_freedom, onText: (chunk) => send({ chunk }) });
        else if (step === "edit") result = await stepEdit(base);
        else if (step === "revise") result = await stepRevise(base);
        else result = await stepFinal(base);
        send({ done: true, step, chapter_id, result });
      } catch (err) {
        const res = errorResponse(err, "/api/publisher-ready/step", user.id);
        const body = await res.json().catch(() => ({ error: "Something went wrong" }));
        send({ error: body.error ?? "Something went wrong", message: body.message, status: res.status, step, chapter_id });
      } finally {
        clearInterval(beat);
        try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); } catch { /* closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
