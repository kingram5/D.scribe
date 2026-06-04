import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJsonLite } from "@/lib/claude-lite";
import { chunkTranscript } from "@/lib/chunker";
import { KEY_POINTS_SYSTEM, keyPointsPrompt } from "@/lib/prompts/key-points";
import { requireAuth } from "@/lib/auth";
import { checkInk, recordInkUsage } from "@/lib/ink";

export const maxDuration = 60;

// POST /api/analyze/key-points — extract key points from ONE chunk
// Client calls this once per chunk, passing chunk_index
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const inkCheck = await checkInk(user.id);
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const { project_id, transcript_id, chunk_index, previous_titles } = await req.json();
  if (!project_id || !transcript_id || chunk_index === undefined) {
    return NextResponse.json({ error: "project_id, transcript_id, and chunk_index required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("id, full_text")
    .eq("id", transcript_id)
    .eq("project_id", project_id)
    .single();
  if (!transcript) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });

  const chunks = chunkTranscript(transcript.full_text);
  const totalChunks = chunks.length;

  // If chunk_index is out of range, return empty
  if (chunk_index >= totalChunks) {
    return NextResponse.json({ key_points: [], total_chunks: totalChunks, done: true });
  }

  const chunk = chunks[chunk_index];
  const prompt = keyPointsPrompt(chunk.text, chunk.index, chunk.totalChunks, previous_titles || []);

  let raw: string;
  try {
    const result = await askClaudeWithUsage(KEY_POINTS_SYSTEM, prompt, { model: "fast", maxTokens: 4096 });
    raw = result.text;
    // Meter the call — key-points was gate-only (checked balance > 0 but never deducted).
    await recordInkUsage(user.id, project_id, "analyze", "fast", result.usage);
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    console.error("Claude API error for key points:", msg);
    return NextResponse.json({ error: "Key points extraction failed: " + msg }, { status: 500 });
  }

  let keyPoints: { title: string; summary: string; supporting_quotes: string[]; tags: string[] }[] = [];
  try {
    const cleaned = cleanJsonLite(raw);
    keyPoints = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("Failed to parse key points chunk:", chunk_index);
    console.error("Raw response (first 500 chars):", raw.slice(0, 500));
    console.error("Parse error:", parseErr instanceof Error ? parseErr.message : parseErr);
  }

  // Save this chunk's key points to DB
  if (keyPoints.length > 0) {
    const { error: insertError } = await supabase.from("key_points").insert(
      keyPoints.map((kp) => ({
        project_id,
        transcript_id,
        title: kp.title,
        summary: kp.summary,
        supporting_quotes: kp.supporting_quotes || [],
        tags: kp.tags || [],
        relevance_score: 0.8,
      }))
    );
    if (insertError) {
      console.error("key_points insert failed:", insertError.message, insertError.details);
      return NextResponse.json({ error: "Failed to save key points: " + insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    key_points: keyPoints,
    total_chunks: totalChunks,
    chunk_index,
    done: chunk_index >= totalChunks - 1,
  });
}
