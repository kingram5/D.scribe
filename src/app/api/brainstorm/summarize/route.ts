import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { askClaudeWithUsage } from "@/lib/claude-lite";
import { checkInk, recordInkUsage } from "@/lib/ink";

export const maxDuration = 60;

const SUMMARIZE_SYSTEM = `You are summarizing a brainstorming conversation between a user and an AI assistant. The user was developing ideas for a manuscript.

Your job:
1. Extract ALL substantive ideas, opinions, examples, stories, and arguments the user expressed.
2. Weight HEAVILY toward the user's own words and voice. The AI's questions and prompts should be invisible in the output — they were just scaffolding.
3. Preserve the user's natural language, phrasing, and tone. If they said something memorably, keep their exact words.
4. Organize loosely by topic/theme, but don't impose rigid structure.
5. Write in first person as if the user is speaking.
6. Include specific details, examples, and anecdotes the user mentioned — these are gold for chapter generation.
7. Do NOT add ideas the user didn't express. Do NOT editorialize or expand.

Output a flowing narrative of the user's ideas, written in their voice, as if they'd dictated it all in one go. This will be used as source material for their manuscript, just like a transcribed audio recording would be.`;

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

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

  // Check Ink balance
  const inkCheck = await checkInk(user.id);
  if (!inkCheck.allowed) {
    return NextResponse.json(
      { error: inkCheck.reason, ink_remaining: inkCheck.balance },
      { status: 402 }
    );
  }

  // Format conversation for summarization
  const conversationText = messages
    .map((m: { role: string; content: string }) =>
      `${m.role === "user" ? "USER" : "AI"}: ${m.content}`
    )
    .join("\n\n");

  // Summarize with user-voice weighting
  const result = await askClaudeWithUsage(
    SUMMARIZE_SYSTEM,
    conversationText,
    { model: "quality", maxTokens: 4096, temperature: 0.4 }
  );
  const summary = result.text;

  // Record Ink usage
  await recordInkUsage(user.id, project_id, "brainstorm_summarize", "quality", result.usage);

  const wordCount = summary.split(/\s+/).filter(Boolean).length;

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

  // Save as transcript
  const { data: transcript, error: txError } = await supabase
    .from("transcripts")
    .insert({
      audio_upload_id: upload.id,
      project_id,
      full_text: summary,
      segments: [{ start: 0, end: 0, text: summary, speaker: "Author" }],
      word_count: wordCount,
      speaker_count: 1,
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
      summary_preview: summary.slice(0, 200),
    },
    { status: 201 }
  );
}
