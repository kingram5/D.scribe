import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";
import { allowedClientIds, authIssuer, REQUIRED_SCOPES } from "./config";

/**
 * Bearer-token verification for the MCP endpoint.
 *
 * Identity comes ONLY from a verified token. A user id supplied in tool
 * arguments is never trusted (tool schemas do not even accept one).
 *
 * The Supabase verifier asks the Auth server to validate the token
 * (auth.getUser(jwt)): that checks signature, expiry and whether the session or
 * grant was revoked, independent of whether the project signs with the legacy
 * shared secret or asymmetric keys. Local claim checks then pin issuer,
 * audience, OAuth client and scopes.
 */

export interface VerifiedIdentity {
  user: Pick<User, "id" | "email" | "email_confirmed_at">;
  clientId: string | null;
  scopes: string[];
}

export type TokenFailure = "missing" | "malformed" | "invalid" | "expired" | "wrong_issuer" | "wrong_audience" | "wrong_client" | "insufficient_scope";

export class TokenError extends Error {
  constructor(public readonly reason: TokenFailure) {
    super(`token ${reason}`);
    this.name = "TokenError";
  }
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/);
  return m ? m[1] : null;
}

export interface JwtClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  sub?: string;
  client_id?: string;
  scope?: string;
  role?: string;
}

/** Decode (NOT verify) a JWT payload. Verification happens at the Auth server. */
export function decodeClaims(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TokenError("malformed");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as JwtClaims;
  } catch {
    throw new TokenError("malformed");
  }
}

/**
 * Pure claim policy, unit-tested. Runs before the network check so obviously
 * wrong tokens are rejected cheaply, and after it for defence in depth.
 */
export function checkClaims(
  claims: JwtClaims,
  opts: { issuer: string; expectedAudience?: string; allowedClients: string[]; requiredScopes: readonly string[]; now?: number }
): { clientId: string | null; scopes: string[] } {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!claims.sub) throw new TokenError("malformed");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new TokenError("expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) throw new TokenError("invalid");
  if ((claims.iss ?? "").replace(/\/+$/, "") !== opts.issuer) throw new TokenError("wrong_issuer");
  if (opts.expectedAudience) {
    const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (!aud.map((a) => a.replace(/\/+$/, "")).includes(opts.expectedAudience.replace(/\/+$/, ""))) {
      throw new TokenError("wrong_audience");
    }
  }
  // An OAuth-issued token carries client_id; a plain browser session token
  // does not. Only grants made through the consent flow are accepted here.
  const clientId = claims.client_id ?? null;
  if (!clientId) throw new TokenError("wrong_client");
  if (opts.allowedClients.length && !opts.allowedClients.includes(clientId)) throw new TokenError("wrong_client");
  const scopes = (claims.scope ?? "").split(/\s+/).filter(Boolean);
  if (scopes.length && !opts.requiredScopes.every((s) => scopes.includes(s))) throw new TokenError("insufficient_scope");
  return { clientId, scopes };
}

export class SupabaseTokenVerifier implements TokenVerifier {
  async verify(token: string): Promise<VerifiedIdentity> {
    const claims = decodeClaims(token);
    const policy = {
      issuer: authIssuer(),
      expectedAudience: process.env.CHATGPT_APP_EXPECTED_AUDIENCE || undefined,
      allowedClients: allowedClientIds(),
      requiredScopes: REQUIRED_SCOPES,
    };
    const { clientId, scopes } = checkClaims(claims, policy);
    const { data, error } = await createServerClient().auth.getUser(token);
    if (error || !data?.user) throw new TokenError("invalid");
    if (data.user.id !== claims.sub) throw new TokenError("invalid");
    return { user: data.user, clientId, scopes };
  }
}
