const DEFAULT_NEXT = "/dashboard";
const VERCEL_SHARE_PARAM = "_vercel_share";
const MAX_SHARE_TOKEN_LENGTH = 4096;
const PRODUCTION_AUTH_HOSTS = new Set(["d-scribe.app", "www.d-scribe.app"]);

type RequestLocation = {
  headers: Headers;
  nextUrl: URL;
};

function firstForwardedValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

/**
 * Reconstruct the public origin that the visitor used. On Vercel, nextUrl can
 * describe the internal request while the forwarded headers retain the preview
 * hostname.
 */
export function requestOrigin(request: RequestLocation): string {
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? request.headers.get("host")?.trim() ?? request.nextUrl.host;
  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : request.nextUrl.protocol.replace(":", "");

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return request.nextUrl.origin;
  }
}

/** Only permit same-site paths, never absolute or protocol-relative URLs. */
export function safeNextPath(value: unknown, fallback = DEFAULT_NEXT): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : fallback;
}

export function safeVercelShareToken(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SHARE_TOKEN_LENGTH
    ? value
    : null;
}

export function urlOnRequestHost(
  request: RequestLocation,
  path: string,
  vercelShare?: string | null
): URL {
  const url = new URL(safeNextPath(path), requestOrigin(request));
  const share = safeVercelShareToken(vercelShare);
  if (share) url.searchParams.set(VERCEL_SHARE_PARAM, share);
  return url;
}

export function magicLinkRedirectUrl(
  request: RequestLocation,
  next: unknown,
  vercelShare?: unknown
): string {
  const url = new URL("/auth/confirm", requestOrigin(request));
  url.searchParams.set("next", safeNextPath(next));

  const share = safeVercelShareToken(vercelShare);
  if (share) url.searchParams.set(VERCEL_SHARE_PARAM, share);

  return url.toString();
}

/** Google OAuth must return to this host, never the live Site URL. */
export function oauthCallbackUrl(
  origin: string,
  next: unknown,
  vercelShare?: unknown
): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", safeNextPath(next));
  const share = safeVercelShareToken(vercelShare);
  if (share) url.searchParams.set(VERCEL_SHARE_PARAM, share);
  return url.toString();
}

export function isProductionAuthHost(hostname: string): boolean {
  return PRODUCTION_AUTH_HOSTS.has(hostname.toLowerCase());
}

/** True when an OAuth return URL would leave a staging/local host for production. */
export function oauthWouldLeaveStaging(origin: string, redirectTo: string): boolean {
  try {
    const from = new URL(origin).hostname;
    const to = new URL(redirectTo).hostname;
    return isProductionAuthHost(to) && !isProductionAuthHost(from);
  } catch {
    return false;
  }
}

/**
 * Supabase authorize URLs default redirect_to to Site URL (d-scribe.app).
 * Pin it back to the host the visitor is actually on before navigating.
 */
export function pinAuthorizeUrlToOrigin(
  authorizeUrl: string,
  origin: string,
  next: unknown,
  vercelShare?: unknown
): { url: string; redirectTo: string } {
  const u = new URL(authorizeUrl);
  const redirectTo = oauthCallbackUrl(origin, next, vercelShare);
  u.searchParams.set("redirect_to", redirectTo);
  return { url: u.toString(), redirectTo };
}
