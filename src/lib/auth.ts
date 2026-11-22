import { createAuthClient } from "@/lib/supabase-auth";
import { isAllowedEmail } from "@/lib/allowlist";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

/** Get the authenticated user from the request cookie. Returns null if not logged in. */
export async function getUser() {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Get the authenticated user ID, or throw 401 */
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

// ── Bearer tokens (the D.Scribe iPhone app) ─────────────────────────────────
// The app signs in with an emailed code and sends `Authorization: Bearer
// <Supabase access token>`. Only requireAuth() reads it, so every bearer caller
// also passes checkUserAccess() below (confirmed email, beta allowlist, baseline
// rate limit), exactly like a cookie caller. getUser()/requireUser() stay
// cookie-only on purpose: partner-admin (payout release) calls getUser().

type JwtClaims = { sub?: unknown; exp?: unknown; role?: unknown; client_id?: unknown };

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * undefined = no Bearer header (the cookie decides, as before this change).
 * null      = a Bearer header that is not a usable token (401, never the cookie).
 * string    = a JWT-shaped token to verify.
 */
async function bearerTokenFromRequest(): Promise<string | null | undefined> {
  let header: string | null;
  try {
    header = (await headers()).get("authorization");
  } catch {
    return undefined; // outside a request scope: leave it to the cookie read, as before
  }
  if (!header) return undefined;
  const m = /^\s*bearer(?:\s+(.*))?$/i.exec(header);
  if (!m) return undefined; // another scheme (e.g. Basic) is not ours: cookie path, unchanged
  const token = (m[1] ?? "").trim();
  return JWT_SHAPE.test(token) ? token : null;
}

/** Decode (NOT verify) a JWT payload. Verification is the Auth server's job. */
function decodeJwtClaims(token: string): JwtClaims | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(part + "=".repeat((4 - (part.length % 4)) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as JwtClaims) : null;
  } catch {
    return null;
  }
}

/**
 * Verify a Supabase access token. Cheap local checks first (shape, subject,
 * expiry, a user-session role, not an OAuth grant), then the Auth server
 * (signature, expiry, revoked session) via auth.getUser(token), and the user it
 * returns must be the token's subject. Any failure is null, never an exception.
 */
async function verifyAccessToken(token: string): Promise<User | null> {
  const claims = decodeJwtClaims(token);
  if (!claims) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  // The anon and service-role keys are JWTs too, with role anon / service_role.
  if (claims.role !== "authenticated") return null;
  // OAuth grants (the ChatGPT app's consent flow) carry client_id and are scoped
  // to their own endpoint. They must never reach the full API through here.
  if (claims.client_id !== undefined) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user || data.user.id !== claims.sub) return null;
    return data.user;
  } catch {
    return null;
  }
}

/** requireAuth()'s identity: a Bearer token when the request carries one, else the cookie session. */
async function getRequestUser(): Promise<User | null> {
  const token = await bearerTokenFromRequest();
  if (token === undefined) return getUser();
  if (token === null) return null;
  return verifyAccessToken(token);
}

/**
 * Auth guard for API route handlers.
 * Returns { user, error: null } on success, or { user: null, error: NextResponse(401) } if not authenticated.
 *
 * Usage:
 *   const { user, error } = await requireAuth();
 *   if (error) return error;
 */
export type AccessDenial =
  | { code: "email_not_confirmed"; status: 403; message: string }
  | { code: "access_revoked"; status: 403; message: string }
  | { code: "rate_limited"; status: 429; message: string; retryAfterMs: number };

/**
 * The checks every identity must pass AFTER it is established, whether it came
 * from a browser session cookie or a ChatGPT OAuth token. Shared so the token
 * path can never skip the beta gate. Returns null when the user may proceed.
 */
export async function checkUserAccess(user: Pick<User, "id" | "email" | "email_confirmed_at">): Promise<AccessDenial | null> {
  // Require a confirmed email — an unconfirmed Supabase session still returns a user.
  if (!user.email_confirmed_at) {
    return { code: "email_not_confirmed", status: 403, message: "Email not confirmed" };
  }
  // Re-check the beta allowlist on every request, not just at login — a
  // session minted before an email was removed from ALLOWED_EMAILS used to
  // keep working until it expired naturally. Cheap: it's an env-var lookup.
  if (!isAllowedEmail(user.email)) {
    return { code: "access_revoked", status: 403, message: "Access revoked" };
  }
  // A baseline limit makes every protected route bounded, including routine
  // CRUD routes that do not need a bespoke spend limit. Expensive routes layer
  // stricter route-specific buckets on top.
  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "authenticated-api", 120);
  if (!allowed) {
    return { code: "rate_limited", status: 429, message: "Too many requests. Please wait before trying again.", retryAfterMs };
  }
  return null;
}

export async function requireAuth(): Promise<
  | { user: User; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getRequestUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const denial = await checkUserAccess(user);
  if (denial) {
    return {
      user: null,
      error: NextResponse.json(
        { error: denial.message },
        denial.code === "rate_limited"
          ? { status: 429, headers: { "Retry-After": String(Math.ceil(denial.retryAfterMs / 1000)) } }
          : { status: denial.status }
      ),
    };
  }
  return { user, error: null };
}
