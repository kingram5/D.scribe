import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkInk } from "@/lib/ink";
import { transcribeUtterance } from "@/lib/deepgram";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const maxDuration = 15;

const MAX_BYTES = 256 * 1024;
const ALLOWED_TYPES = new Set([
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
  "audio/wav",
  "application/octet-stream",
]);

function normalizeType(value: string | null): string {
  const raw = (value ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (raw === "audio/m4a" || raw === "audio/aac") return "audio/mp4";
  return raw || "application/octet-stream";
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm-stt", 180, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many speech requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  const inkCheck = await checkInk(user.id, "transcribe");
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  if (!process.env.DEEPGRAM_API_KEY?.trim()) {
    return NextResponse.json({ error: "Speech service is not configured." }, { status: 503 });
  }

  const declaredType = req.headers.get("content-type");
  const mimeType = normalizeType(declaredType);
  if (declaredType && !ALLOWED_TYPES.has(declaredType.split(";")[0].trim().toLowerCase()) && !ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "Unsupported audio type." }, { status: 415 });
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ transcript: "" });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Speech clip was too large." }, { status: 413 });
  }

  try {
    const transcript = await transcribeUtterance(buffer, mimeType === "application/octet-stream" ? "audio/mp4" : mimeType);
    return NextResponse.json({ transcript });
  } catch (err) {
    logger.error("brainstorm stt failed", {
      route: "/api/brainstorm/stt",
      userId: user.id,
      error: err,
    });
    return NextResponse.json(
      { error: "Hands-free could not transcribe that clip. Tap Speak to try again, or type your answer." },
      { status: 502 },
    );
  }
}
