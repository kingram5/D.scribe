import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkInk } from "@/lib/ink";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
const TOKEN_TTL_SECONDS = 180;

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm-stt-token", 40, 10 * 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many speech-token requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
    );
  }

  const inkCheck = await checkInk(user.id, "transcribe");
  if (!inkCheck.allowed) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Speech service is not configured." }, { status: 503 });
  }

  try {
    const grant = await fetch(DEEPGRAM_GRANT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    });
    const payload = await grant.json().catch(() => ({})) as {
      access_token?: unknown;
      expires_in?: unknown;
      message?: unknown;
      err_msg?: unknown;
    };
    if (!grant.ok || typeof payload.access_token !== "string" || !payload.access_token) {
      const detail = typeof payload.message === "string"
        ? payload.message
        : typeof payload.err_msg === "string" ? payload.err_msg : `HTTP ${grant.status}`;
      throw new Error(detail);
    }
    return NextResponse.json({
      access_token: payload.access_token,
      expires_in: typeof payload.expires_in === "number" ? payload.expires_in : TOKEN_TTL_SECONDS,
    });
  } catch (err) {
    logger.error("brainstorm stt-token grant failed", {
      route: "/api/brainstorm/stt-token",
      userId: user.id,
      error: err,
    });
    return NextResponse.json(
      { error: "Hands-free could not reach the speech service. Tap Speak to try again, or type your answer." },
      { status: 502 },
    );
  }
}
