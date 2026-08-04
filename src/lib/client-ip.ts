import type { NextRequest } from "next/server";

/**
 * Best-available client IP for rate-limit keying on anonymous routes.
 *
 * Platform-set header first (Vercel writes x-real-ip itself, clients can't).
 * The LEFTMOST x-forwarded-for entry is the attacker-controlled position —
 * anything the client sends lands there and proxies append after it — so when
 * we must fall back to XFF, take the RIGHTMOST entry, the hop closest to our
 * edge.
 */
export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",");
    const last = parts[parts.length - 1].trim();
    if (last) return last;
  }
  return "unknown";
}
