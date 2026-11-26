import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// /auth/confirm — a GET must never spend the one-time token, because work-email
// link scanners open every link before the person does (2026-11-25: Kyle's
// Greentech address burned 2 s before his click). Only the button's POST verifies.

const state = vi.hoisted(() => ({
  verifyCalls: [] as { token_hash: string; type: string }[],
  verifyError: null as null | { message: string },
  email: "reader@example.com" as string | undefined,
  allowed: true,
  signOutCalls: 0,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      verifyOtp: async (args: { token_hash: string; type: string }) => {
        state.verifyCalls.push(args);
        return { error: state.verifyError };
      },
      getUser: async () => ({ data: { user: state.email ? { email: state.email } : null } }),
      signOut: async () => {
        state.signOutCalls++;
        return { error: null };
      },
    },
  }),
}));

vi.mock("@/lib/allowlist", () => ({
  isAllowedEmail: () => state.allowed,
}));

import { GET, POST } from "@/app/auth/confirm/route";

const ORIGIN = "https://www.d-scribe.app";

function getReq(query: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/auth/confirm?${query}`, { headers });
}

function postReq(fields: Record<string, string>, headers: Record<string, string> = { origin: ORIGIN }) {
  const body = new URLSearchParams(fields);
  return new NextRequest(`${ORIGIN}/auth/confirm`, {
    method: "POST",
    body: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}

function hiddenValue(html: string, name: string): string | null {
  const m = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
  return m ? m[1] : null;
}

beforeEach(() => {
  state.verifyCalls = [];
  state.verifyError = null;
  state.email = "reader@example.com";
  state.allowed = true;
  state.signOutCalls = 0;
});

describe("GET /auth/confirm", () => {
  it("shows a button page and does not spend the token", async () => {
    const res = await GET(getReq("token_hash=abc123&type=email&next=%2Fdashboard"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post" action="/auth/confirm">');
    expect(html).toContain("Continue to D.Scribe");
    expect(hiddenValue(html, "token_hash")).toBe("abc123");
    expect(hiddenValue(html, "type")).toBe("email");
    expect(state.verifyCalls).toHaveLength(0);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("survives a scanner opening the link first: the human's tap still signs in", async () => {
    // Scanner fetches the link (twice, as some do), then the person opens it.
    await GET(getReq("token_hash=tok-1&type=email"));
    await GET(getReq("token_hash=tok-1&type=email"));
    const page = await (await GET(getReq("token_hash=tok-1&type=email"))).text();
    expect(state.verifyCalls).toHaveLength(0);

    const res = await POST(
      postReq({
        token_hash: hiddenValue(page, "token_hash")!,
        type: hiddenValue(page, "type")!,
        next: hiddenValue(page, "next")!,
      })
    );
    expect(state.verifyCalls).toEqual([{ token_hash: "tok-1", type: "email" }]);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("reads next from the template's redirect_to (the original emailRedirectTo)", async () => {
    const redirectTo = encodeURIComponent(`${ORIGIN}/auth/confirm?next=%2Fupgrade%2Fstarter`);
    const html = await (await GET(getReq(`token_hash=t&type=signup&redirect_to=${redirectTo}`))).text();
    expect(hiddenValue(html, "next")).toBe("/upgrade/starter");
    expect(hiddenValue(html, "type")).toBe("signup");
  });

  it("also reads redirect_to when the template leaves it unescaped", async () => {
    const html = await (
      await GET(getReq(`token_hash=t&type=email&redirect_to=${ORIGIN}/auth/confirm?next=%2Fpricing`))
    ).text();
    expect(hiddenValue(html, "next")).toBe("/pricing");
  });

  it("never follows a foreign next out of redirect_to", async () => {
    const redirectTo = encodeURIComponent("https://evil.example/auth/confirm?next=%2F%2Fevil.example");
    const html = await (await GET(getReq(`token_hash=t&type=email&redirect_to=${redirectTo}`))).text();
    expect(hiddenValue(html, "next")).toBe("/dashboard");
  });

  it("escapes values that land in the page", async () => {
    const html = await (await GET(getReq(`token_hash=${encodeURIComponent('a"><script>x</script>')}&type=email`))).text();
    expect(html).not.toContain("<script>x</script>");
    expect(hiddenValue(html, "token_hash")).toBe("a&quot;&gt;&lt;script&gt;x&lt;/script&gt;");
  });

  it("sends an unknown type back to login", async () => {
    const res = await GET(getReq("token_hash=t&type=recovery"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?error=auth");
    expect(state.verifyCalls).toHaveLength(0);
  });

  it("keeps the hash fallback for older {{ .ConfirmationURL }} emails", async () => {
    const res = await GET(getReq("next=%2Fdashboard"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("/api/auth/hash-session");
    expect(state.verifyCalls).toHaveLength(0);
  });
});

describe("POST /auth/confirm", () => {
  it("rejects a cross-site post without verifying (login CSRF)", async () => {
    const res = await POST(postReq({ token_hash: "t", type: "email" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login?error=auth");
    expect(state.verifyCalls).toHaveLength(0);
  });

  it("rejects a cross-site post flagged only by Sec-Fetch-Site", async () => {
    const res = await POST(postReq({ token_hash: "t", type: "email" }, { "sec-fetch-site": "cross-site" }));
    expect(res.headers.get("location")).toContain("/login?error=auth");
    expect(state.verifyCalls).toHaveLength(0);
  });

  it("sends an already-used link to login with a plain message", async () => {
    state.verifyError = { message: "Email link is invalid or has expired" };
    const res = await POST(postReq({ token_hash: "used", type: "email", next: "/dashboard" }));
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("message")).toMatch(/expired or was already used/);
  });

  it("signs out and blocks an email the allowlist refuses", async () => {
    state.allowed = false;
    const res = await POST(postReq({ token_hash: "t", type: "email" }));
    expect(state.signOutCalls).toBe(1);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/unauthorized`);
  });

  it("drops an unsafe next and lands on the dashboard", async () => {
    const res = await POST(postReq({ token_hash: "t", type: "email", next: "//evil.example" }));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("refuses a missing token without calling Supabase", async () => {
    const res = await POST(postReq({ type: "email" }));
    expect(res.headers.get("location")).toContain("/login?error=auth");
    expect(state.verifyCalls).toHaveLength(0);
  });
});
