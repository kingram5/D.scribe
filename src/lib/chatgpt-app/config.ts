/**
 * ChatGPT app configuration. Every switch defaults OFF, because pushed branches
 * get Vercel previews that run on the production database and live Stripe.
 *
 *   CHATGPT_APP_MCP=true             /mcp answers at all (otherwise 404)
 *   CHATGPT_APP_ANON_PREVIEW=true    unlinked users may create previews from a
 *                                    plan ChatGPT drafted (no D.scribe model spend)
 *   CHATGPT_APP_PAID_GENERATION=true linked users may ask D.scribe's own model to
 *                                    build/refine a plan, billed in Ink
 *   CHATGPT_APP_WRITES=true          save_book_plan may create projects
 *
 *   CHATGPT_APP_RESOURCE_URL         canonical MCP resource URL, e.g.
 *                                    https://www.d-scribe.app/mcp (must match what
 *                                    ChatGPT sends as `resource`)
 *   CHATGPT_APP_AUTH_ISSUER          OAuth authorization server issuer. Defaults to
 *                                    `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1`.
 *   CHATGPT_APP_EXPECTED_AUDIENCE    if set, the token `aud` must include it
 *                                    (Supabase issues aud=authenticated unless a
 *                                    custom access-token hook rewrites it)
 *   CHATGPT_APP_ALLOWED_CLIENT_IDS   optional comma list; when set, only tokens
 *                                    minted for these OAuth clients are accepted
 */

function on(name: string): boolean {
  return (process.env[name] ?? "").trim().toLowerCase() === "true";
}

export const chatgptFlags = {
  mcp: () => on("CHATGPT_APP_MCP"),
  anonPreview: () => on("CHATGPT_APP_ANON_PREVIEW"),
  paidGeneration: () => on("CHATGPT_APP_PAID_GENERATION"),
  writes: () => on("CHATGPT_APP_WRITES"),
};

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.d-scribe.app").replace(/\/+$/, "");
}

export function resourceUrl(): string {
  return (process.env.CHATGPT_APP_RESOURCE_URL ?? `${siteUrl()}/mcp`).replace(/\/+$/, "");
}

export function authIssuer(): string {
  return (process.env.CHATGPT_APP_AUTH_ISSUER ?? `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")}/auth/v1`).replace(/\/+$/, "");
}

export function protectedResourceMetadataUrl(): string {
  return `${siteUrl()}/.well-known/oauth-protected-resource`;
}

/** Scopes this server asks for. Supabase's OAuth server issues standard OIDC scopes. */
export const REQUIRED_SCOPES = ["openid", "email"] as const;

export function allowedClientIds(): string[] {
  return (process.env.CHATGPT_APP_ALLOWED_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
