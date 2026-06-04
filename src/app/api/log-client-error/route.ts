import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

// POST /api/log-client-error — receives unhandled errors from client-side error boundaries.
// Deliberately unauthenticated; it only writes to the server log + Sentry.
//
// Hardened: rejects oversized payloads and truncates every field so this open endpoint
// can't be used to flood logs/Sentry or inject newlines into log lines.
// TODO(launch): add a per-IP rate limit (needs the limiter keyed by IP for anon routes).

const MAX_BODY_BYTES = 16 * 1024; // error reports are tiny; anything larger is abuse
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;
const MAX_ID = 200;

/** Truncate to at most `max` chars (or undefined if not a string). */
function clip(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.slice(0, max) : undefined;
}
/** Truncate and collapse newlines — for scalar/identifier fields (log-injection guard). */
function oneLine(v: unknown, max: number): string | undefined {
  return clip(v, max)?.replace(/[\r\n]+/g, " ");
}

export async function POST(req: NextRequest) {
  try {
    // Reject before buffering when Content-Length is present...
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
    }

    const raw = await req.text();
    // ...and after reading, for chunked uploads with no Content-Length (true byte length).
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const boundary = oneLine(body.boundary, MAX_ID) ?? "unknown";
    const digest = oneLine(body.digest, MAX_ID);
    const message = oneLine(body.message, MAX_MESSAGE) ?? "unknown";
    const stack = clip(body.stack, MAX_STACK); // keep newlines (it's a stack), just cap length

    logger.error("Client error boundary triggered", {
      route: `error-boundary:${boundary}`,
      meta: { digest },
      error: { message, stack } as Error,
    });

    // Forward to Sentry (no-ops when DSN is not configured).
    const err = new Error(message);
    if (stack) err.stack = stack;
    Sentry.captureException(err, { extra: { boundary, digest } });
  } catch {
    // Never fail on a logging endpoint.
  }

  return NextResponse.json({ ok: true });
}
