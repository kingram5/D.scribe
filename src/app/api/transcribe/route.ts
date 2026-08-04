import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { transcribeAudio } from "@/lib/deepgram";
import { requireAuth } from "@/lib/auth";
import { getDownloadUrl } from "@/lib/r2";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkInk, recordFlatInkUsage, INK_PER_AUDIO_MINUTE } from "@/lib/ink";

// POST /api/transcribe — transcribe an uploaded audio file
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "transcribe");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  // Cost-aware gate: without the operation argument this degraded to
  // balance > 0, and Deepgram minutes were never billed at all.
  const inkCheck = await checkInk(user.id, "transcribe");
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const { audio_upload_id } = await req.json();
  if (!audio_upload_id) {
    return NextResponse.json({ error: "audio_upload_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Get audio upload record
  const { data: upload, error: fetchError } = await supabase
    .from("audio_uploads")
    .select("*")
    .eq("id", audio_upload_id)
    .single();

  if (fetchError || !upload) {
    return NextResponse.json({ error: "Audio upload not found" }, { status: 404 });
  }

  // Verify the upload's project belongs to this user
  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", upload.project_id)
    .eq("user_id", user.id)
    .single();

  if (!projectOwner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // file_path is client-writable under the audio_uploads RLS policy, so a row
  // inserted directly via PostgREST can name ANY object key and this route
  // would presign a read for it. Server-written keys are always prefixed with
  // the project id — enforce that shape so the row can only point inside the
  // caller's own project.
  if (typeof upload.file_path !== "string" || !upload.file_path.startsWith(`${upload.project_id}/`)) {
    return NextResponse.json({ error: "Invalid audio reference" }, { status: 400 });
  }

  // Mark as transcribing
  await supabase
    .from("audio_uploads")
    .update({ status: "transcribing" })
    .eq("id", audio_upload_id);

  try {
    // Download from R2
    const downloadUrl = await getDownloadUrl(upload.file_path);
    const r2Res = await fetch(downloadUrl);
    if (!r2Res.ok) {
      throw new Error(`Failed to download audio file from R2: ${r2Res.status}`);
    }
    const buffer = Buffer.from(await r2Res.arrayBuffer());
    const mimeType = upload.file_name.endsWith(".mp3")
      ? "audio/mpeg"
      : upload.file_name.endsWith(".wav")
        ? "audio/wav"
        : "audio/mp4";

    // Transcribe with Deepgram
    const result = await transcribeAudio(buffer, mimeType);

    // Save transcript
    const { data: transcript, error: insertError } = await supabase
      .from("transcripts")
      .insert({
        audio_upload_id,
        project_id: upload.project_id,
        full_text: result.full_text,
        segments: result.segments,
        word_count: result.word_count,
        speaker_count: result.speaker_count,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Update audio upload status & duration
    await supabase
      .from("audio_uploads")
      .update({
        status: "transcribed",
        duration_seconds: result.duration_seconds,
      })
      .eq("id", audio_upload_id);

    // Bill the Deepgram minutes. The work is done and returned either way —
    // a billing failure is a loud log line, not a customer-facing error.
    const minutes = Math.max(1, Math.ceil((result.duration_seconds ?? 0) / 60));
    await recordFlatInkUsage(user.id, upload.project_id, "transcribe", "deepgram", minutes * INK_PER_AUDIO_MINUTE).catch(
      (billErr) =>
        logger.error("transcribe: Ink settle failed after successful transcription", {
          route: "/api/transcribe",
          userId: user.id,
          meta: { audio_upload_id, minutes },
          error: billErr,
        })
    );

    return NextResponse.json(transcript, { status: 201 });
  } catch (err) {
    await supabase
      .from("audio_uploads")
      .update({ status: "failed" })
      .eq("id", audio_upload_id);

    const message = err instanceof Error ? err.message : "Transcription failed";
    logger.error(message, {
      route: "/api/transcribe",
      userId: user.id,
      error: err,
      meta: { audio_upload_id },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
