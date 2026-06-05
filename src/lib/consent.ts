// Cookie-backed cookie/tracking consent. Read on both server and client (the
// cookie is sent with every request), written client-side by the consent banner.
// Marketing pixels (TikTok / LinkedIn) stay dormant until `marketing` is true.

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  v: number;
}

export const CONSENT_COOKIE = "dscribe_consent";
export const CONSENT_VERSION = 1;
// Dispatched on the window when consent changes, so pixel components react
// immediately instead of waiting for the next navigation.
export const CONSENT_EVENT = "dscribe-consent-change";

/** Read the current consent choice (client-side). Returns null if none recorded
 *  or the stored version is stale (so we re-ask after a policy change). */
export function readConsent(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(CONSENT_COOKIE + "="));
  if (!match) return null;
  try {
    const raw = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(raw);
    if (parsed && parsed.v === CONSENT_VERSION) return parsed as ConsentState;
    return null;
  } catch {
    return null;
  }
}

/** Persist a consent choice for a year and notify listeners. */
export function writeConsent(choice: { analytics: boolean; marketing: boolean }): ConsentState {
  const state: ConsentState = {
    necessary: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
    v: CONSENT_VERSION,
  };
  if (typeof document !== "undefined") {
    const maxAge = 60 * 60 * 24 * 365; // 1 year
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify(state)
    )}; path=/; max-age=${maxAge}; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
  }
  return state;
}
