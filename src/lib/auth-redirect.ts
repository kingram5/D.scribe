const DEFAULT_NEXT = "/dashboard";
const VERCEL_SHARE_PARAM = "_vercel_share";
const MAX_SHARE_TOKEN_LENGTH = 4096;

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
