import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { transcribeUtterance } from "@/lib/deepgram";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/brainstorm/stt — transcribe one hands-free spoken answer.
//
// iOS Safari cannot run SpeechRecognition and the TTS <audio> element in the
// same audio session (proven live across PRs #18–#24: whichever side yields
// kills the other on the next turn). The studio therefore records the answer
// itself from a persistent getUserMedia stream and sends the clip here, where
// Deepgram — already used by /api/transcribe — turns it into text.

export const maxDuration = 60;

// A hands-free answer is a short spoken turn. The client caps segments at
// three minutes; 20 MB comfortably covers that in any allowed container while
// still bounding what one request can push at Deepgram.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  // Vendor-spend route: same posture as /api/tts. One answer per few seconds
  // is the legitimate ceiling of the hands-free loop.
  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm-stt", 30);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("audio/")) {
    return NextResponse.json({ error: "Send recorded audio with an audio/* content type." }, { status: 400 });
  }

  // Reject before buffering when Content-Length is present, and re-check the
  // true byte length afterwards for chunked uploads.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio clip too large." }, { status: 413 });
  }

  const audio = Buffer.from(await req.arrayBuffer());
  if (audio.byteLength === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio clip too large." }, { status: 413 });
  }

  try {
    const transcript = await transcribeUtterance(audio, contentType);
    // An empty transcript is a valid outcome (breath, rustle, a cough). The
    // client owns the user-facing explanation; this route reports honestly.
    return NextResponse.json({ transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    logger.error("Hands-free STT failed", {
      route: "/api/brainstorm/stt",
      userId: user.id,
      error: err,
      meta: { bytes: audio.byteLength, contentType, detail: message.slice(0, 300) },
    });
    return NextResponse.json({ error: "T.H.E.O. couldn't transcribe that answer." }, { status: 502 });
  }
}
