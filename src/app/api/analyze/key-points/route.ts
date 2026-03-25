import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeLite, cleanJsonLite } from "@/lib/claude-lite";
import { chunkTranscript } from "@/lib/chunker";
import { KEY_POINTS_SYSTEM, keyPointsPrompt } from "@/lib/prompts/key-points";
import { requireAuth } from "@/lib/auth";

export const maxDuration = 60;

// POST /api/analyze/key-points — extract key points from transcript
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { project_id, transcript_id } = await req.json();
  if (!project_id || !transcript_id) {
    return NextResponse.json({ error: "project_id and transcript_id required" }, { status: 400 });
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

  const allKeyPoints: {
    title: string;
    summary: string;
    supporting_quotes: string[];
    tags: string[];
  }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const previousTitles = allKeyPoints.map((kp) => kp.title);
    const prompt = keyPointsPrompt(chunk.text, chunk.index, chunk.totalChunks, previousTitles);

    const raw = await askClaudeLite(KEY_POINTS_SYSTEM, prompt, { model: "fast", maxTokens: 4096 });
    try {
      const parsed = JSON.parse(cleanJsonLite(raw));
      allKeyPoints.push(...parsed);
    } catch {
      console.error("Failed to parse key points chunk:", i);
    }
  }

  if (allKeyPoints.length > 0) {
    await supabase.from("key_points").insert(
      allKeyPoints.map((kp) => ({
        project_id,
        transcript_id,
        title: kp.title,
        summary: kp.summary,
        supporting_quotes: kp.supporting_quotes,
        tags: kp.tags,
        relevance_score: 0.8,
      }))
    );
  }

  return NextResponse.json({ key_points_count: allKeyPoints.length });
}
