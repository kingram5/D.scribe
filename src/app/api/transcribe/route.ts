import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { transcribeAudio } from "@/lib/deepgram";
import { requireAuth } from "@/lib/auth";

// POST /api/transcribe — transcribe an uploaded audio file
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

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

  // Mark as transcribing
  await supabase
    .from("audio_uploads")
    .update({ status: "transcribing" })
    .eq("id", audio_upload_id);

  try {
    // Download from storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from("audio")
      .download(upload.file_path);

    if (dlError || !fileData) {
      throw new Error("Failed to download audio file");
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
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

    return NextResponse.json(transcript, { status: 201 });
  } catch (err) {
    await supabase
      .from("audio_uploads")
      .update({ status: "failed" })
      .eq("id", audio_upload_id);

    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
