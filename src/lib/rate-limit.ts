/**
 * Distributed rate limiter backed by Supabase (Postgres).
 *
 * Uses check_rate_limit() — a single atomic upsert function defined in
 * migration 010. Works across multiple Next.js instances (Vercel, etc.).
 *
 * Falls back to in-memory if the RPC call fails (e.g., local dev without
 * the migration applied) — logs a warning so it doesn't fail silently.
 */

import { createServerClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Fallback: in-memory (single-instance only, used if DB is unavailable)
// ---------------------------------------------------------------------------

const _local = new Map<string, { count: number; expires: number }>();

function localCheck(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
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
  windowMs = 60_000
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
    return {
      allowed: row.allowed as boolean,
      retryAfterMs: Number(row.retry_after_ms ?? 0),
    };
  } catch (err) {
    // Migration not yet applied or DB unreachable — fall back to in-memory
    console.warn("[rate-limit] Falling back to in-memory limiter:", (err as Error).message);
    return localCheck(key, limit, windowMs);
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
