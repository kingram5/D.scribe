import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJsonLite } from "@/lib/claude-lite";
import { VOICE_PROFILE_SYSTEM, voiceProfilePrompt } from "@/lib/prompts/voice-profile";
import { requireAuth } from "@/lib/auth";
import { releaseInkReservation, reserveInk, settleInkReservation } from "@/lib/ink";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// POST /api/analyze/voice-profile — build voice profile from transcript
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "analyze");
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
      status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    });
  }

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

  const inkCheck = await reserveInk(user.id, "voice_profile");
  if (!inkCheck.allowed || !inkCheck.reservationId) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }
  const reservationId = inkCheck.reservationId;
  let raw: string;
  let usage: { input_tokens: number; output_tokens: number };
  try {
    ({ text: raw, usage } = await askClaudeWithUsage(
      VOICE_PROFILE_SYSTEM,
      voiceProfilePrompt(samples, projectOwner.voice_profile),
      { model: "fast", maxTokens: 2048 }
    ));
  } catch (err) {
    await releaseInkReservation(reservationId);
    throw err;
  }

  // Parse BEFORE billing (edge-test 19/50) — a truncated response used to be
  // deducted and then return nothing.
  try {
    const profile = JSON.parse(cleanJsonLite(raw));
    await supabase.from("projects").update({ voice_profile: profile }).eq("id", project_id);
    await settleInkReservation(reservationId, project_id, "voice_profile", "fast", usage);
    return NextResponse.json({ voice_profile: profile });
  } catch {
    await releaseInkReservation(reservationId);
    return NextResponse.json({ voice_profile: null });
  }
}
