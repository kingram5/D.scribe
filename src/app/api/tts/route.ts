import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getTtsLimit } from "@/lib/tts";
import { stripFormatMarkers } from "@/lib/export/format-markers";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { ttsGateLocked } from "@/lib/topups";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "tts", 30);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
      status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    });
  }

  const { text: rawText } = await req.json();
  if (!rawText?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });
  // Chapter text carries formatting markers (##, >, **); never speak them aloud,
  // and never charge voice characters for them either.
  const text = stripFormatMarkers(rawText);

  const supabase = createServerClient();

  const { data: balance } = await supabase
    .from("ink_balances")
    .select("tier, tts_chars_used, tts_period_start, topup_tts_chars")
    .eq("user_id", user.id)
    .single();

  const tier = balance?.tier ?? "free";
  const topupTtsChars = Number(balance?.topup_tts_chars ?? 0);

  if (ttsGateLocked(tier, topupTtsChars)) {
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
    const topupRemaining = Number(ttsResult.topup_remaining ?? topupTtsChars);
    return NextResponse.json(
      {
        error: "tts_limit_reached",
        message: "Monthly voice limit reached. Upgrade to continue.",
        used: ttsResult.used,
        limit,
        topup_available: true,
        topup_remaining: topupRemaining,
      },
      { status: 402 }
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "TTS not configured" }, { status: 503 });

  // T.H.E.O speaks as ElevenLabs "Finley" — one voice for the studio and every
  // T.H.E.O video, per Kyle's standing directive. Deliberately NOT env-driven:
  // this is brand identity, not configuration. The env var used to win here and
  // held a stale id in prod, so the studio kept answering in a different voice
  // after the code default was already correct.
  const voiceId = "fnYMz3F5gMEDGMWcH1ex";

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
