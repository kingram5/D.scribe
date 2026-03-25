import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cleanJson } from "@/lib/claude";
import { chunkTranscript } from "@/lib/chunker";
import { KEY_POINTS_SYSTEM, keyPointsPrompt } from "@/lib/prompts/key-points";
import { requireAuth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

// Lightweight Claude call — creates a fresh client each time to avoid memory buildup
async function askClaudeLite(system: string, userMessage: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    temperature: 0.6,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  // Explicitly null out to help GC
  (response as unknown as Record<string, unknown>).content = null;
  return text;
}

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

  // Only select full_text — skip segments and other large fields
  const { data: transcript } = await supabase
    .from("transcripts")
    .select("id, full_text")
    .eq("id", transcript_id)
    .eq("project_id", project_id)
    .single();
  if (!transcript) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });

  const chunks = chunkTranscript(transcript.full_text);
  // Free the full transcript text from memory after chunking
  (transcript as Record<string, unknown>).full_text = null;

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
    // Free chunk text after building prompt
    chunk.text = "";

    const raw = await askClaudeLite(KEY_POINTS_SYSTEM, prompt);
    try {
      const parsed = JSON.parse(cleanJson(raw));
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
