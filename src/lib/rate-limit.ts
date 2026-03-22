/**
 * Simple in-memory rate limiter — no external dependencies.
 * Stores per-key timestamps in a Map and evicts expired entries on each check.
 *
 * NOT suitable for multi-instance deployments (each instance has its own map).
 * Replace with @upstash/ratelimit if the app scales to multiple Vercel instances.
 */

const requests = new Map<string, number[]>();

/**
 * Returns true if the request is allowed, false if rate-limited.
 *
 * @param key      Unique key — e.g. `${userId}:analyze`
 * @param limit    Max requests allowed in the window
 * @param windowMs Window duration in milliseconds (default: 60_000 = 1 minute)
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): boolean {
  const now = Date.now();
  const timestamps = (requests.get(key) ?? []).filter(
    (t) => now - t < windowMs
  );

  if (timestamps.length >= limit) return false;

  timestamps.push(now);
  requests.set(key, timestamps);
  return true;
}

/** Convenience wrapper — returns a 429 NextResponse body string on failure, or null on success. */
export function checkRateLimit(
  userId: string,
  route: string,
  limit = 10,
  windowMs = 60_000
): { allowed: boolean; retryAfterMs: number } {
  const key = `${userId}:${route}`;
  const now = Date.now();
  const timestamps = (requests.get(key) ?? []).filter(
    (t) => now - t < windowMs
  );

  if (timestamps.length >= limit) {
    // Time until the oldest request falls out of the window
    const oldest = timestamps[0] ?? now;
    const retryAfterMs = windowMs - (now - oldest);
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  requests.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0 };
}
