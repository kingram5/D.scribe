import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getTtsLimit } from "@/lib/tts";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });

  const supabase = createServerClient();

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("tier, tts_chars_used, tts_period_start")
    .eq("user_id", user.id)
    .single();

  const tier = balance?.tier ?? "free";

  if (tier === "free" || tier === "starter") {
    return NextResponse.json(
      { error: "tts_locked", message: "Voice is a Pro feature. Upgrade to unlock." },
      { status: 403 }
    );
  }

  const chars = text.length;

  const { data: ttsResult, error: ttsError } = await supabase.rpc("check_and_deduct_tts", {
    p_user_id: user.id,
    p_chars: chars,
  });

  if (ttsError) {
    logger.error("TTS metering error", {
      route: "/api/tts",
      userId: user.id,
      error: ttsError,
    });
    return NextResponse.json({ error: "TTS metering failed" }, { status: 500 });
  }

  if (!ttsResult.allowed) {
    const limit = getTtsLimit(tier);
    return NextResponse.json(
      {
        error: "tts_limit_reached",
        message: "Monthly voice limit reached. Upgrade to continue.",
        used: ttsResult.used,
        limit,
      },
      { status: 402 }
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "TTS not configured" }, { status: 503 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    logger.error("ElevenLabs TTS API error", {
      route: "/api/tts",
      userId: user.id,
      meta: { status: res.status, body: err.slice(0, 500) },
    });
    return NextResponse.json({ error: "TTS generation failed" }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
