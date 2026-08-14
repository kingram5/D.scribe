import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/brainstorm/stt-token — mint a short-lived Deepgram token so the
// studio can stream the author's speech and show words AS they are spoken.
//
// The browser must never hold the real DEEPGRAM_API_KEY. Deepgram's grant
// endpoint issues a 30-second JWT that is only needed for the WebSocket
// handshake; the connection stays open after the token expires, so one token
// per spoken turn is enough.

export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;

  // One token per turn plus idle re-arms lands well under this; anything
  // hotter is a loop or abuse.
  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "brainstorm-stt-token", 30);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Speech-to-text is not configured." }, { status: 503 });
  }

  try {
    // trim(): the Preview ELEVENLABS_API_KEY once carried a trailing newline
    // and 502'd every request. Never let the same paste bite this key.
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 30 }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error("Deepgram token grant failed", {
        route: "/api/brainstorm/stt-token",
        userId: user.id,
        meta: { status: res.status, body: body.slice(0, 300) },
      });
      // Kyle debugs on a phone with no devtools: the client surfaces this
      // message on screen, so say exactly what to do. Grant needs an API key
      // with Member (or higher) permissions — plain transcription does not,
      // which is why clips can work while this fails.
      const detail = res.status === 403 || res.status === 401
        ? "Deepgram refused (HTTP " + res.status + "). The DEEPGRAM_API_KEY needs 'Member' permissions — in the Deepgram console, create a new key with Advanced → Member, then update the key in Vercel."
        : `Deepgram returned HTTP ${res.status}.`;
      return NextResponse.json({ error: detail }, { status: 502 });
    }
    const payload = await res.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== "string" || !payload.access_token) {
      throw new Error("grant returned no access_token");
    }
    return NextResponse.json({
      access_token: payload.access_token,
      expires_in: typeof payload.expires_in === "number" ? payload.expires_in : 30,
    });
  } catch (err) {
    logger.error("Deepgram token grant threw", {
      route: "/api/brainstorm/stt-token",
      userId: user.id,
      error: err,
    });
    return NextResponse.json({ error: "Could not authorize live transcription." }, { status: 502 });
  }
}
