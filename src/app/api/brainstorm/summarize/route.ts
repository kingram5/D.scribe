import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";
import { logger } from "@/lib/logger";
import { askClaudeWithUsage, cleanJsonLite } from "@/lib/claude-lite";
import { sanitizeBrainstormMessages, userTurnCount } from "@/lib/brainstorm-session";
import { readNotes, stripPrivateTags } from "@/lib/theo/notes";
import { RECAP_SYSTEM, buildRecap, recapUserMessage } from "@/lib/theo/scribe";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const inkCheck = await checkInk(user.id, "brainstorm_summarize");
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const { messages: rawMessages, project_id } = await req.json();
  const messages = sanitizeBrainstormMessages(rawMessages)?.map((m) =>
    m.role === "user" ? { ...m, content: stripPrivateTags(m.content) } : m,
  );

  if (!messages || !project_id) {
    return NextResponse.json(
      { error: "messages array and project_id required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify project ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id, brainstorm_topic")
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

  // THE REAL ENDING. Until 2026-09 this route saved the transcript and the studio
  // showed a spinner that said "distilling" and then nothing. Now the author gets
  // a card: how much they said, what the book gained, their line of the day, and
  // one question to think about. The same card becomes the handoff that opens
  // their next session. None of this may block Finish: the transcript is already
  // safe, so every failure below degrades to a code-computed card.
  const { data: active } = await supabase
    .from("brainstorm_sessions").select("id, notes")
    .eq("project_id", project_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  const keeperLines = readNotes((active as { notes?: unknown } | null)?.notes).keeperLines;

  let modelCard: unknown = null;
  try {
    const { text, usage } = await askClaudeWithUsage(RECAP_SYSTEM, recapUserMessage(messages), {
      model: "fast", maxTokens: 900, temperature: 0.3,
    });
    recordInkUsage(user.id, project_id, "brainstorm_summarize", "fast", usage).catch((err) =>
      logger.error("recordInkUsage failed", { route: "/api/brainstorm/summarize", userId: user.id, error: err }));
    modelCard = JSON.parse(cleanJsonLite(text));
  } catch (err) {
    logger.error("Session recap failed; using the code-computed card", { route: "/api/brainstorm/summarize", userId: user.id, error: err });
  }
  const { recap, handoff, topic } = buildRecap(modelCard, messages, keeperLines);

  try {
    const now = new Date().toISOString();
    if (active?.id) {
      await supabase.from("brainstorm_sessions").update({ messages, turn_count: userTurnCount(messages), handoff, recap, updated_at: now }).eq("id", active.id).eq("user_id", user.id);
    } else {
      // No autosaved row (older client, blocked storage): record the finished
      // session anyway so the next one still opens on continuity.
      await supabase.from("brainstorm_sessions").insert({ project_id, user_id: user.id, messages, turn_count: userTurnCount(messages), status: "finished", handoff, recap, updated_at: now });
    }
    // Anchor the book's subject once, in the author's terms. Never overwritten
    // here: a later session about one chapter must not rename the book.
    if (topic && !String((project as { brainstorm_topic?: string | null }).brainstorm_topic || "").trim()) {
      await supabase.from("projects").update({ brainstorm_topic: topic }).eq("id", project_id).eq("user_id", user.id);
    }
  } catch (err) {
    logger.error("Saving the session handoff failed", { route: "/api/brainstorm/summarize", userId: user.id, error: err });
  }

  return NextResponse.json(
    {
      transcript_id: transcript.id,
      upload_id: upload.id,
      word_count: wordCount,
      recap,
    },
    { status: 201 }
  );
}
