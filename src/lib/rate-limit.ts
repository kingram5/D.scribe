/**
 * Distributed rate limiter backed by Supabase (Postgres).
 *
 * Uses check_rate_limit() — a single atomic upsert function defined in
 * migration 010. Works across multiple Next.js instances (Vercel, etc.).
 *
 * Database failures deny by default. A per-process fallback cannot enforce a
 * distributed limit and must never be used to authorize spend-bearing work.
 */

import { createServerClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Fallback: in-memory (single-instance only, used if DB is unavailable)
// ---------------------------------------------------------------------------

const _local = new Map<string, { count: number; expires: number }>();

// Entries were only ever overwritten on key recurrence — a long-lived instance
// accumulated one entry per unique key forever. Sweep expired entries once the
// map gets large.
const LOCAL_SWEEP_THRESHOLD = 5_000;

function evictExpired(now: number): void {
  for (const [k, v] of _local) {
    if (v.expires <= now) _local.delete(k);
  }
}

function localCheck(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (_local.size >= LOCAL_SWEEP_THRESHOLD) evictExpired(now);
  const entry = _local.get(key);

  if (!entry || entry.expires <= now) {
    _local.set(key, { count: 1, expires: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterMs: entry.expires - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

// ---------------------------------------------------------------------------
// Primary: Postgres via Supabase RPC
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  userId: string,
  route: string,
  limit = 10,
  windowMs = 60_000,
  failureMode: "closed" | "local" = "closed"
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const key = `${userId}:${route}`;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") {
      throw new Error("check_rate_limit returned no row");
    }
    return {
      allowed: row.allowed,
      retryAfterMs: Number(row.retry_after_ms ?? 0),
    };
  } catch (err) {
    console.error("[rate-limit] Distributed limiter unavailable:", (err as Error).message);
    // Local limiting is only an explicit availability choice for routes that
    // cannot cause vendor spend. It is intentionally never the default.
    if (failureMode === "local") return localCheck(key, limit, windowMs);
    return { allowed: false, retryAfterMs: windowMs };
  }
}

/**
 * Legacy synchronous shim — kept for any callers that haven't migrated yet.
 * Prefer checkRateLimit() (async) in new code.
 * @deprecated Use checkRateLimit() instead.
 */
export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  return localCheck(key, limit, windowMs).allowed;
}
