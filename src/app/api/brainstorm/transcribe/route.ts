import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { transcribeAudio } from "@/lib/deepgram";
import { checkInk, INK_PER_AUDIO_MINUTE, recordFlatInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { createServerClient } from "@/lib/supabase";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

export const maxDuration = 30;

/**
 * Transcribe one short hands-free brainstorm answer.
 *
 * Unlike the long-form /api/transcribe route, this accepts the gesture-opened
 * browser recording directly. It never stores that recording or creates a
 * transcript row; the audio exists only for the duration of this request.
 */
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm-transcribe", 30);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many voice turns. Please wait a moment, then try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  if (!process.env.DEEPGRAM_API_KEY) {
    return NextResponse.json({ error: "Voice transcription is not configured." }, { status: 503 });
  }

  const declaredBytes = Number(req.headers.get("content-length") ?? 0);
  if (declaredBytes > MAX_AUDIO_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That voice answer is too large. Please try a shorter answer." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid voice recording." }, { status: 400 });
  }

  const audio = form.get("audio");
  const projectId = form.get("project_id");
  if (!(audio instanceof File) || typeof projectId !== "string" || !projectId) {
    return NextResponse.json({ error: "A voice recording and project are required." }, { status: 400 });
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES || !audio.type.toLowerCase().startsWith("audio/")) {
    return NextResponse.json({ error: "Invalid voice recording." }, { status: 400 });
  }

  const { data: project } = await createServerClient()
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // These clips are normally only a few seconds long. Requiring the generic
  // two-Ink long-file preflight on every turn would overstate their cost; the
  // exact audio duration is billed below.
  const ink = await checkInk(user.id);
  if (!ink.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: ink.reason }, { status: 402 });
  }

  try {
    const result = await transcribeAudio(Buffer.from(await audio.arrayBuffer()), audio.type);
    const transcript = result.full_text.trim();
    if (!transcript) {
      return NextResponse.json({ transcript: "", duration_seconds: result.duration_seconds });
    }

    const inkCost = Math.max(0.01, (result.duration_seconds / 60) * INK_PER_AUDIO_MINUTE);
    await recordFlatInkUsage(user.id, projectId, "transcribe", "deepgram", inkCost).catch((billingError) => {
      logger.error("brainstorm-transcribe: Ink settle failed after successful transcription", {
        route: "/api/brainstorm/transcribe",
        userId: user.id,
        meta: { projectId, durationSeconds: result.duration_seconds },
        error: billingError,
      });
    });

    return NextResponse.json({ transcript, duration_seconds: result.duration_seconds });
  } catch (error) {
    logger.error("Brainstorm voice transcription failed", {
      route: "/api/brainstorm/transcribe",
      userId: user.id,
      meta: { projectId, audioBytes: audio.size, mimeType: audio.type },
      error,
    });
    return NextResponse.json(
      { error: "T.H.E.O. could not transcribe that recording. Please try again." },
      { status: 502 },
    );
  }
}
