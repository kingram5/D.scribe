import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cleanJson } from "@/lib/claude";
import { VOICE_PROFILE_SYSTEM, voiceProfilePrompt } from "@/lib/prompts/voice-profile";
import { requireAuth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

// POST /api/analyze/voice-profile — build voice profile from transcript
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { project_id, transcript_id } = await req.json();
  if (!project_id || !transcript_id) {
    return NextResponse.json({ error: "project_id and transcript_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id, voice_profile")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();
  if (!projectOwner) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Only select full_text to minimize memory
  const { data: transcript } = await supabase
    .from("transcripts")
    .select("id, full_text")
    .eq("id", transcript_id)
    .eq("project_id", project_id)
    .single();
  if (!transcript) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });

  const words = transcript.full_text.split(/\s+/);
  const sampleSize = Math.min(1000, Math.floor(words.length / 3));
  const samples = [
    words.slice(0, sampleSize).join(" "),
    words.slice(Math.floor(words.length / 3), Math.floor(words.length / 3) + sampleSize).join(" "),
    words.slice(-sampleSize).join(" "),
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    temperature: 0.6,
    system: VOICE_PROFILE_SYSTEM,
    messages: [{ role: "user", content: voiceProfilePrompt(samples, projectOwner.voice_profile) }],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const profile = JSON.parse(cleanJson(raw));
    await supabase.from("projects").update({ voice_profile: profile }).eq("id", project_id);
    return NextResponse.json({ voice_profile: profile });
  } catch {
    return NextResponse.json({ voice_profile: null });
  }
}
