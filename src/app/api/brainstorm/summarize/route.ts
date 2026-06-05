import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { checkInk } from "@/lib/ink";

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const inkCheck = await checkInk(user.id, "brainstorm_summarize");
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const { messages, project_id } = await req.json();

  if (!messages || !Array.isArray(messages) || !project_id) {
    return NextResponse.json(
      { error: "messages array and project_id required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify project ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Format conversation as labeled transcript — no summarization, preserve full context
  const fullTranscript = messages
    .map((m: { role: string; content: string }) =>
      `${m.role === "user" ? "AUTHOR" : "INTERVIEWER"}: ${m.content}`
    )
    .join("\n\n");

  const wordCount = fullTranscript.split(/\s+/).filter(Boolean).length;

  // Create stub audio_upload (same pattern as YouTube)
  const { data: upload, error: uploadError } = await supabase
    .from("audio_uploads")
    .insert({
      project_id,
      file_path: "",
      file_name: `brainstorm-${new Date().toISOString().slice(0, 19)}`,
      file_size_bytes: 0,
      status: "transcribed",
    })
    .select()
    .single();

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Save as transcript with labeled segments
  const segments = messages.map((m: { role: string; content: string }, i: number) => ({
    start: i,
    end: i + 1,
    text: m.content,
    speaker: m.role === "user" ? "Author" : "Interviewer",
  }));

  const { data: transcript, error: txError } = await supabase
    .from("transcripts")
    .insert({
      audio_upload_id: upload.id,
      project_id,
      full_text: fullTranscript,
      segments,
      word_count: wordCount,
      speaker_count: 2,
    })
    .select()
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      transcript_id: transcript.id,
      upload_id: upload.id,
      word_count: wordCount,
    },
    { status: 201 }
  );
}
