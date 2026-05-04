import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

// POST /api/log-client-error — receives unhandled errors from client-side error boundaries
// This endpoint deliberately has no auth requirement; it only writes to the server log.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { boundary, message, digest, stack } = body as {
      boundary?: string;
      message?: string;
      digest?: string;
      stack?: string;
    };

    logger.error("Client error boundary triggered", {
      route: `error-boundary:${boundary ?? "unknown"}`,
      meta: { digest },
      error: { message: message ?? "unknown", stack } as Error,
    });

    // Forward to Sentry with full context (no-ops when DSN is not configured)
    const err = new Error(message ?? "Client error boundary triggered");
    if (stack) err.stack = stack;
    Sentry.captureException(err, {
      extra: { boundary: boundary ?? "unknown", digest },
    });
  } catch {
    // Never fail on a logging endpoint
  }

  return NextResponse.json({ ok: true });
}
