// Shared Sentry `beforeSend` scrub.
//
// D.Scribe processes private user manuscripts. This strips user content + secrets from
// every error event before it leaves the app. Wired into all Sentry inits.
//
// Defense in depth (per code review + the 2026-08-02 edge test):
//   1. request:    drop bodies, cookies, auth headers — and the QUERY STRING.
//                  /auth/confirm?token_hash=… is the one place a live single-use
//                  credential exists in this app, and request.url carried it.
//   2. extra:      value-shape filter — drop long strings AND large objects that
//                  aren't on the safe key list. An object is not a string, and
//                  `extra.payload = { content: "<chapter>" }` sailed through the
//                  string-only check.
//   3. free text:  cap `message` and each `exception.values[].value` — this is the
//                  primary leak channel. Real error messages are short.
//   4. breadcrumbs + user: console/fetch/XHR breadcrumbs replay whatever was
//                  logged (including chapter text during generation) and Sentry
//                  can populate user with email + IP. Crumbs are capped and
//                  URL-stripped; user keeps only the id.
//
// Typed structurally (not via @sentry/nextjs's exported event type) so it stays valid
// across SDK versions and cannot break the build on a type-shape change.

type Breadcrumb = {
  message?: string;
  data?: Record<string, unknown>;
};

type ScrubbableEvent = {
  message?: string;
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown>;
  };
  extra?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Breadcrumb[];
  user?: Record<string, unknown>;
};

const SAFE_EXTRA_KEYS = new Set(["boundary", "digest"]);
const MAX_EXTRA_STR = 200; // strings longer than this in `extra` are likely user content, not ids/flags
const MAX_TEXT = 500; // cap on message / exception text — real errors are short; bounds any content leak

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…[truncated]" : s;
}

function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/** True when a non-string value would serialize small enough to be an id/flag bag. */
function isSmallValue(v: unknown): boolean {
  try {
    return JSON.stringify(v).length <= MAX_EXTRA_STR;
  } catch {
    return false; // unserializable = unknown shape = drop it
  }
}

/** Sentry `beforeSend` hook — returns the event with user content + secrets removed. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  // 1. Request — bodies/cookies/auth can carry manuscripts + session tokens,
  // and the query string can carry a live auth token (/auth/confirm?token_hash=…).
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (typeof event.request.url === "string") {
      event.request.url = stripQuery(event.request.url);
    }
    if (event.request.headers) {
      for (const h of ["authorization", "Authorization", "cookie", "Cookie"]) {
        delete event.request.headers[h];
      }
    }
  }

  // 2. Extra — drop long strings AND large/unserializable objects (likely
  // content); keep ids/flags + safe keys.
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const v = event.extra[key];
      if (SAFE_EXTRA_KEYS.has(key)) continue;
      if (typeof v === "string" && v.length > MAX_EXTRA_STR) {
        delete event.extra[key];
      } else if (v !== null && typeof v === "object" && !isSmallValue(v)) {
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

  // 4. Breadcrumbs — captured console calls and fetch/XHR metadata replay
  // whatever the page logged. Cap the text, strip URLs to their paths, and
  // drop any large data values.
  if (Array.isArray(event.breadcrumbs)) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.message === "string") crumb.message = truncate(crumb.message, MAX_TEXT);
      if (crumb.data) {
        for (const key of Object.keys(crumb.data)) {
          const v = crumb.data[key];
          if (typeof v === "string") {
            crumb.data[key] = key === "url" ? stripQuery(v) : truncate(v, MAX_EXTRA_STR);
          } else if (v !== null && typeof v === "object" && !isSmallValue(v)) {
            delete crumb.data[key];
          }
        }
      }
    }
  }

  // 5. User — Sentry can populate email + IP here. The id is all diagnosis needs.
  if (event.user) {
    const id = event.user.id;
    event.user = id != null ? { id } : {};
  }

  return event;
}
