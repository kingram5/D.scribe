import { AIError } from "@/lib/ai/contracts";
import { NextResponse } from "next/server";
import type { requireAuth } from "@/lib/auth";
import { publisherReadyEnabled } from "@/lib/ink";
import { checkRateLimit } from "@/lib/rate-limit";
import { StepError } from "@/lib/publisher-ready/pipeline";
import { RefusalError } from "@/lib/claude-next";
import { logger } from "@/lib/logger";

/**
 * Feature flag + rate limit on top of the caller's requireAuth() result, shared by
 * every Publisher-Ready route. Each route calls requireAuth itself so the auth
 * guard is visible at the route (the edge-probe architecture test checks for it).
 */
export async function guard(auth: Awaited<ReturnType<typeof requireAuth>>, route: string, limit = 30) {
  if (!publisherReadyEnabled()) {
    return { user: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const { user, error } = auth;
  if (error) return { user: null, error };
  const { allowed, retryAfterMs } = await checkRateLimit(user.id, `pr-${route}`, limit);
  if (!allowed) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      ),
    };
  }
  return { user, error: null };
}

export function errorResponse(err: unknown, route: string, userId?: string) {
  if (err instanceof AIError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.code === "configuration" ? 503 : 409 });
  if (err instanceof StepError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof RefusalError) {
    return NextResponse.json({ error: "The editor couldn't work on this part of the book. Try again, or skip this chapter." }, { status: 422 });
  }
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (message.includes("Insufficient Ink")) return NextResponse.json({ error: "out_of_ink", message: "You're out of Ink." }, { status: 402 });
  logger.error(message, { route, userId, error: err });
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
