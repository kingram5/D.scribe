import { NextRequest, NextResponse } from "next/server";
import { transcribeUtterance } from "@/lib/deepgram";
import { recordFlatInkUsage, inkPerAudioMinute } from "@/lib/ink";
import { createServerClient } from "@/lib/supabase";
import { guard, errorResponse } from "../_shared";

export const maxDuration = 60;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
/** One spoken answer is capped at 10 minutes by the client; bill within that. */
const MAX_BILLED_MINUTES = 10;

// POST /api/publisher-ready/stt?run_id=…&seconds=… (body: recorded audio)
// Same Deepgram path as the brainstorm studio, but metered: the brainstorm STT
// route never charged Ink, which the Theo v2 handoff flagged as unbilled spend.
export async function POST(req: NextRequest) {
  const { user, error } = await guard("stt", 30);
  if (error) return error;
  try {
    const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("audio/")) return NextResponse.json({ error: "Send recorded audio." }, { status: 400 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio clip too large." }, { status: 413 });
    }
    const runId = req.nextUrl.searchParams.get("run_id");
    const db = createServerClient();
    const { data: run } = await db.from("pr_runs").select("project_id").eq("id", runId ?? "").eq("user_id", user.id).single();
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const audio = Buffer.from(await req.arrayBuffer());
    if (audio.byteLength === 0) return NextResponse.json({ error: "No audio received." }, { status: 400 });
    if (audio.byteLength > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio clip too large." }, { status: 413 });

    const transcript = await transcribeUtterance(audio, contentType);
    // Duration comes from the recorder; clamp it (minimum a quarter minute).
    const seconds = Number(req.nextUrl.searchParams.get("seconds") ?? 0);
    const minutes = Math.min(MAX_BILLED_MINUTES, Math.max(0.25, (Number.isFinite(seconds) ? seconds : 0) / 60));
    await recordFlatInkUsage(user.id, run.project_id, "transcribe", "deepgram", minutes * inkPerAudioMinute());
    return NextResponse.json({ transcript });
  } catch (err) {
    return errorResponse(err, "/api/publisher-ready/stt", user.id);
  }
}
