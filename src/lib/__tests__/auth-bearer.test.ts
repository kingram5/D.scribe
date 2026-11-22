import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// requireAuth() guards ~57 API routes whose service-role queries trust its user.
// These tests pin the cookie path's exact responses (written and run green on
// untouched master first), then cover the mobile app's bearer-token path.
// Supabase is mocked throughout: nothing here talks to a real project.

type FakeUser = { id: string; email?: string; email_confirmed_at?: string | null };

const state = vi.hoisted(() => ({
  headers: new Headers(),
  cookieUser: null as FakeUser | null,
  cookieCalls: 0,
  tokenCalls: [] as string[],
  tokenResult: (() => ({ data: { user: null }, error: { message: "invalid JWT" } })) as (jwt: string) => unknown,
  clientOpts: [] as unknown[],
  rate: { allowed: true, retryAfterMs: 0 },
  rateCalls: [] as unknown[][],
  headersThrows: false,
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (state.headersThrows) throw new Error("headers() called outside a request scope");
    return state.headers;
  },
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@/lib/supabase-auth", () => ({
  createAuthClient: async () => {
    state.cookieCalls++;
    return { auth: { getUser: async () => ({ data: { user: state.cookieUser } }) } };
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, opts?: unknown) => {
    state.clientOpts.push(opts);
    return {
      auth: {
        getUser: async (jwt?: string) => {
          state.tokenCalls.push(jwt ?? "");
          return state.tokenResult(jwt ?? "");
        },
      },
    };
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async (...args: unknown[]) => {
    state.rateCalls.push(args);
    return state.rate;
  },
}));

import { getUser, requireAuth } from "@/lib/auth";

const CONFIRMED: FakeUser = { id: "u-1", email: "writer@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const UNCONFIRMED: FakeUser = { id: "u-2", email: "new@example.com", email_confirmed_at: null };
const OUTSIDER: FakeUser = { id: "u-3", email: "stranger@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
/** A JWT-shaped string. The signature is fake: verification is the (mocked) Auth server's job. */
function jwt(claims: Record<string, unknown>): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.c2lnbmF0dXJl`;
}
const nowSec = () => Math.floor(Date.now() / 1000);
function sessionToken(sub: string, extra: Record<string, unknown> = {}): string {
  return jwt({ sub, role: "authenticated", aud: "authenticated", exp: nowSec() + 3600, iat: nowSec(), session_id: "s-1", ...extra });
}
function bearer(token: string) {
  state.headers = new Headers({ authorization: `Bearer ${token}` });
}
/** Make the mocked Auth server accept exactly this token as this user. */
function authServerAccepts(token: string, user: FakeUser) {
  state.tokenResult = (got) => (got === token ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } });
}

async function snapshot(res: { user: unknown; error: Response | null }) {
  if (!res.error) return { ok: true, user: res.user };
  return { ok: false, status: res.error.status, body: await res.error.json(), retryAfter: res.error.headers.get("Retry-After") };
}

beforeEach(() => {
  state.headers = new Headers();
  state.cookieUser = null;
  state.cookieCalls = 0;
  state.tokenCalls = [];
  state.tokenResult = () => ({ data: { user: null }, error: { message: "invalid JWT" } });
  state.clientOpts = [];
  state.rate = { allowed: true, retryAfterMs: 0 };
  state.rateCalls = [];
  state.headersThrows = false;
  vi.stubEnv("ALLOWED_EMAILS", "writer@example.com,new@example.com");
  vi.stubEnv("PUBLIC_SIGNUP", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireAuth cookie path (no Authorization header) is unchanged", () => {
  it("no session -> 401 Unauthorized", async () => {
    const res = await requireAuth();
    expect(await snapshot(res)).toEqual({ ok: false, status: 401, body: { error: "Unauthorized" }, retryAfter: null });
    expect(state.cookieCalls).toBe(1);
    expect(state.rateCalls).toEqual([]);
  });

  it("unconfirmed email -> 403 Email not confirmed", async () => {
    state.cookieUser = UNCONFIRMED;
    expect(await snapshot(await requireAuth())).toEqual({ ok: false, status: 403, body: { error: "Email not confirmed" }, retryAfter: null });
  });

  it("email off the beta allowlist -> 403 Access revoked", async () => {
    state.cookieUser = OUTSIDER;
    expect(await snapshot(await requireAuth())).toEqual({ ok: false, status: 403, body: { error: "Access revoked" }, retryAfter: null });
  });

  it("empty allowlist denies everyone in beta mode", async () => {
    vi.stubEnv("ALLOWED_EMAILS", "");
    state.cookieUser = CONFIRMED;
    expect(await snapshot(await requireAuth())).toEqual({ ok: false, status: 403, body: { error: "Access revoked" }, retryAfter: null });
  });

  it("over the baseline limit -> 429 with Retry-After in whole seconds", async () => {
    state.cookieUser = CONFIRMED;
    state.rate = { allowed: false, retryAfterMs: 2500 };
    expect(await snapshot(await requireAuth())).toEqual({
      ok: false,
      status: 429,
      body: { error: "Too many requests. Please wait before trying again." },
      retryAfter: "3",
    });
  });

  it("good session -> user, with the shared authenticated-api bucket", async () => {
    state.cookieUser = CONFIRMED;
    const res = await requireAuth();
    expect(res.error).toBeNull();
    expect(res.user).toEqual(CONFIRMED);
    expect(state.rateCalls).toEqual([["u-1", "authenticated-api", 120]]);
    expect(state.cookieCalls).toBe(1);
  });

  it("PUBLIC_SIGNUP=true admits any confirmed address", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    state.cookieUser = OUTSIDER;
    expect((await requireAuth()).user).toEqual(OUTSIDER);
  });

  it("never asks the Auth server to verify a token when there is no header", async () => {
    state.cookieUser = CONFIRMED;
    await requireAuth();
    expect(state.tokenCalls).toEqual([]);
  });

  it("a non-Bearer Authorization scheme is ignored and the cookie decides", async () => {
    state.headers = new Headers({ authorization: "Basic dXNlcjpwYXNz" });
    state.cookieUser = CONFIRMED;
    expect((await requireAuth()).user).toEqual(CONFIRMED);
    expect(state.tokenCalls).toEqual([]);
  });

  it("getUser() stays cookie-only", async () => {
    state.cookieUser = CONFIRMED;
    expect(await getUser()).toEqual(CONFIRMED);
  });
});

describe("requireAuth bearer path (iPhone app)", () => {
  it("valid token -> that user, verified at the Auth server with a non-persisting anon client", async () => {
    const token = sessionToken("u-1");
    bearer(token);
    authServerAccepts(token, CONFIRMED);
    const res = await requireAuth();
    expect(res.error).toBeNull();
    expect(res.user).toEqual(CONFIRMED);
    expect(state.tokenCalls).toEqual([token]);
    expect(state.clientOpts[0]).toEqual({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(state.rateCalls).toEqual([["u-1", "authenticated-api", 120]]);
    expect(state.cookieCalls).toBe(0);
  });

  it("bad token (Auth server rejects it) -> 401 and the cookie is never read", async () => {
    bearer(sessionToken("u-1"));
    state.cookieUser = CONFIRMED; // a valid browser session must NOT rescue a bad token
    expect(await snapshot(await requireAuth())).toEqual({ ok: false, status: 401, body: { error: "Unauthorized" }, retryAfter: null });
    expect(state.cookieCalls).toBe(0);
    expect(state.rateCalls).toEqual([]);
  });

  it("expired token -> 401 without a network call", async () => {
    bearer(sessionToken("u-1", { exp: nowSec() - 5 }));
    state.cookieUser = CONFIRMED;
    expect((await snapshot(await requireAuth())).status).toBe(401);
    expect(state.tokenCalls).toEqual([]);
    expect(state.cookieCalls).toBe(0);
  });

  it.each([
    ["empty", "Bearer "],
    ["bare scheme", "Bearer"],
    ["not a JWT", "Bearer not-a-jwt"],
    ["literal undefined", "Bearer undefined"],
    ["two parts", "Bearer aaa.bbb"],
    ["garbage payload", "Bearer aaa.%%%.ccc"],
  ])("malformed bearer (%s) -> 401, no fall-through", async (_name, value) => {
    state.headers = new Headers({ authorization: value });
    state.cookieUser = CONFIRMED;
    expect((await snapshot(await requireAuth())).status).toBe(401);
    expect(state.cookieCalls).toBe(0);
  });

  it("payload that is not valid base64url JSON -> 401", async () => {
    bearer(`${b64url({ alg: "HS256" })}.${Buffer.from("not json").toString("base64url")}.c2ln`);
    expect((await snapshot(await requireAuth())).status).toBe(401);
    expect(state.tokenCalls).toEqual([]);
  });

  it("scheme is case-insensitive", async () => {
    const token = sessionToken("u-1");
    state.headers = new Headers({ authorization: `bearer ${token}` });
    authServerAccepts(token, CONFIRMED);
    expect((await requireAuth()).user).toEqual(CONFIRMED);
  });

  it("an OAuth grant (client_id claim, e.g. the ChatGPT app) is refused even if the Auth server would accept it", async () => {
    const token = sessionToken("u-1", { client_id: "chatgpt-client", scope: "dscribe:read" });
    bearer(token);
    authServerAccepts(token, CONFIRMED);
    expect((await snapshot(await requireAuth())).status).toBe(401);
    expect(state.tokenCalls).toEqual([]);
  });

  it.each(["anon", "service_role", undefined])("a token with role=%s is not a user session -> 401", async (role) => {
    const token = sessionToken("u-1", { role });
    bearer(token);
    authServerAccepts(token, CONFIRMED);
    expect((await snapshot(await requireAuth())).status).toBe(401);
    expect(state.tokenCalls).toEqual([]);
  });

  it("token without a subject -> 401", async () => {
    bearer(jwt({ role: "authenticated", exp: nowSec() + 60 }));
    expect((await snapshot(await requireAuth())).status).toBe(401);
  });

  it("Auth server returns a different user than the token's subject -> 401", async () => {
    const token = sessionToken("u-1");
    bearer(token);
    authServerAccepts(token, OUTSIDER);
    expect((await snapshot(await requireAuth())).status).toBe(401);
  });

  it("Auth server unreachable (throws) -> 401, not a 500 and not the cookie", async () => {
    bearer(sessionToken("u-1"));
    state.cookieUser = CONFIRMED;
    state.tokenResult = () => {
      throw new Error("fetch failed");
    };
    expect((await snapshot(await requireAuth())).status).toBe(401);
    expect(state.cookieCalls).toBe(0);
  });

  it("missing Supabase env -> 401", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const token = sessionToken("u-1");
    bearer(token);
    authServerAccepts(token, CONFIRMED);
    expect((await snapshot(await requireAuth())).status).toBe(401);
  });

  it("headers() unavailable -> behaves exactly as the cookie path", async () => {
    state.headersThrows = true;
    state.cookieUser = CONFIRMED;
    expect((await requireAuth()).user).toEqual(CONFIRMED);
  });

  it("getUser() ignores a bearer token (partner-admin stays cookie-only)", async () => {
    const token = sessionToken("u-1");
    bearer(token);
    authServerAccepts(token, CONFIRMED);
    expect(await getUser()).toBeNull();
    expect(state.tokenCalls).toEqual([]);
  });

  describe("access rules are identical to the cookie path", () => {
    async function viaCookie(user: FakeUser) {
      state.headers = new Headers();
      state.cookieUser = user;
      return snapshot(await requireAuth());
    }
    async function viaBearer(user: FakeUser) {
      state.cookieUser = null;
      const token = sessionToken(user.id);
      bearer(token);
      authServerAccepts(token, user);
      return snapshot(await requireAuth());
    }

    it("unconfirmed email: refused the same (403 Email not confirmed)", async () => {
      const cookie = await viaCookie(UNCONFIRMED);
      const tok = await viaBearer(UNCONFIRMED);
      expect(tok).toEqual(cookie);
      expect(tok).toMatchObject({ status: 403, body: { error: "Email not confirmed" } });
    });

    it("email off the allowlist: refused the same (403 Access revoked)", async () => {
      const cookie = await viaCookie(OUTSIDER);
      const tok = await viaBearer(OUTSIDER);
      expect(tok).toEqual(cookie);
      expect(tok).toMatchObject({ status: 403, body: { error: "Access revoked" } });
    });

    it("empty allowlist: refused the same", async () => {
      vi.stubEnv("ALLOWED_EMAILS", "");
      expect(await viaBearer(CONFIRMED)).toEqual(await viaCookie(CONFIRMED));
      expect((await viaBearer(CONFIRMED)).status).toBe(403);
    });

    it("anonymous Supabase user (no email): refused the same", async () => {
      const anon: FakeUser = { id: "u-anon", email: undefined, email_confirmed_at: null };
      expect(await viaBearer(anon)).toEqual(await viaCookie(anon));
    });

    it("rate limited: same 429 and Retry-After, same bucket", async () => {
      state.rate = { allowed: false, retryAfterMs: 61_001 };
      const cookie = await viaCookie(CONFIRMED);
      const tok = await viaBearer(CONFIRMED);
      expect(tok).toEqual(cookie);
      expect(tok).toMatchObject({ status: 429, retryAfter: "62" });
      expect(state.rateCalls).toEqual([
        ["u-1", "authenticated-api", 120],
        ["u-1", "authenticated-api", 120],
      ]);
    });

    it("PUBLIC_SIGNUP=true: admitted the same", async () => {
      vi.stubEnv("PUBLIC_SIGNUP", "true");
      expect(await viaBearer(OUTSIDER)).toEqual(await viaCookie(OUTSIDER));
      expect((await viaBearer(OUTSIDER)).ok).toBe(true);
    });
  });
});
