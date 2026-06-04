// Shared Sentry `beforeSend` scrub.
//
// D.Scribe processes private user manuscripts. This strips user content + secrets from
// every error event before it leaves the app. Wired into all Sentry inits.
//
// Defense in depth (per code review):
//   1. request:    drop bodies, cookies, auth headers.
//   2. extra:      value-shape filter — drop long strings that aren't on the safe key
//                  list (ids/flags are short and kept; content dumps are long and dropped).
//   3. free text:  cap `message` and each `exception.values[].value` — this is the primary
//                  leak channel (captureException(new Error(userText)) puts text here).
//                  Real error messages are short; the cap bounds any accidental content leak.
//
// Typed structurally (not via @sentry/nextjs's exported event type) so it stays valid
// across SDK versions and cannot break the build on a type-shape change.

type ScrubbableEvent = {
  message?: string;
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown>;
  };
  extra?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string }> };
};

const SAFE_EXTRA_KEYS = new Set(["boundary", "digest"]);
const MAX_EXTRA_STR = 200; // strings longer than this in `extra` are likely user content, not ids/flags
const MAX_TEXT = 500; // cap on message / exception text — real errors are short; bounds any content leak

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}

/** Sentry `beforeSend` hook — returns the event with user content + secrets removed. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  // 1. Request — bodies/cookies/auth can carry manuscripts + session tokens.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const h of ["authorization", "Authorization", "cookie", "Cookie"]) {
        delete event.request.headers[h];
      }
    }
  }

  // 2. Extra — drop long non-safe strings (likely content); keep ids/flags + safe keys.
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const v = event.extra[key];
      if (typeof v === "string" && !SAFE_EXTRA_KEYS.has(key) && v.length > MAX_EXTRA_STR) {
        delete event.extra[key];
      }
    }
  }

  // 3. Free text — the real leak channel. Cap message + every exception value.
  if (typeof event.message === "string") event.message = truncate(event.message, MAX_TEXT);
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (typeof ex.value === "string") ex.value = truncate(ex.value, MAX_TEXT);
    }
  }

  return event;
}
