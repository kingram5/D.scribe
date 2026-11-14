import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// /api/attribution: required answer, server-side AI tagging, and FAIL SOFT when
// migration 033 has not run (signup must never break).

const state = vi.hoisted(() => ({
  attrRow: null as unknown,
  attrError: null as null | { code?: string; message: string },
  projectCount: 0,
  projectError: null as null | { message: string },
  writeError: null as null | { code?: string; message: string },
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: async () => ({ user: { id: "user-1", email: "a@b.co" }, error: null }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "user_attribution") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: state.attrRow, error: state.attrError }),
          upsert: async (row: unknown, opts: unknown) => { state.upsert(row, opts); return { error: state.writeError }; },
        };
        return chain;
      }
      if (table === "projects") {
        const chain = { select: () => chain, eq: async () => ({ count: state.projectCount, error: state.projectError }) };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
  createBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

import { GET, POST } from "@/app/api/attribution/route";
import { AttributionGate } from "@/components/attribution/AttributionGate";

const post = (body: unknown) => POST(new NextRequest("https://www.d-scribe.app/api/attribution", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  state.attrRow = null; state.attrError = null; state.projectCount = 0; state.projectError = null; state.writeError = null; state.upsert.mockClear();
});

describe("GET /api/attribution (show the question?)", () => {
  it("asks a new account with no answer and no project", async () => {
    expect(await (await GET()).json()).toEqual({ needed: true });
  });
  it("does not ask once answered, or once a book exists", async () => {
    state.attrRow = { user_id: "user-1" };
    expect(await (await GET()).json()).toEqual({ needed: false });
    state.attrRow = null; state.projectCount = 2;
    expect(await (await GET()).json()).toEqual({ needed: false });
  });
  it("fails soft when the table is missing (migration not run yet)", async () => {
    state.attrError = { code: "42P01", message: 'relation "user_attribution" does not exist' };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ needed: false });
  });
});

describe("POST /api/attribution", () => {
  it("requires an answer: missing or unknown source is a 400 and nothing is written", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ source: "myspace" })).status).toBe(400);
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("stores the answer for the signed-in user (never a user id from the body) with server-side AI tagging", async () => {
    const passive = JSON.stringify({
      landing_url: "/pricing?utm_source=chatgpt.com", referrer: "https://chatgpt.com/c/abc?x=1", null_referrer: false,
      utm: { utm_source: "chatgpt.com" }, captured_at: "2026-11-14T15:00:00.000Z",
    });
    const res = await post({ source: "chatgpt", user_id: "someone-else", ai_referrer: "claude", passive });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: true, ai_referrer: "chatgpt" });
    const [row, opts] = state.upsert.mock.calls[0];
    expect(row).toMatchObject({
      user_id: "user-1", attribution_source: "chatgpt", attribution_detail: null,
      landing_url: "/pricing?utm_source=chatgpt.com", referrer: "https://chatgpt.com/c/abc",
      null_referrer: false, utm_source: "chatgpt.com", ai_referrer: "chatgpt", first_seen_at: "2026-11-14T15:00:00.000Z",
    });
    expect(opts).toEqual({ onConflict: "user_id", ignoreDuplicates: true });
  });

  it("records 'nothing captured' as null, distinct from 'no referrer'", async () => {
    await post({ source: "friend" });
    expect(state.upsert.mock.calls[0][0]).toMatchObject({ null_referrer: null, referrer: null, landing_url: null, ai_referrer: null });
  });

  it("keeps Other's free text, capped", async () => {
    await post({ source: "other", detail: "my pastor's newsletter" });
    expect(state.upsert.mock.calls[0][0]).toMatchObject({ attribution_source: "other", attribution_detail: "my pastor's newsletter" });
  });

  it("fails soft when the table is missing: 200, stored false, never an error page", async () => {
    state.writeError = { code: "42P01", message: 'relation "user_attribution" does not exist' };
    const res = await post({ source: "google" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: false });
  });
});

describe("first-run dialog", () => {
  const html = renderToStaticMarkup(React.createElement(AttributionGate, { forceOpen: true }));

  it("shows all 13 options with Other last", () => {
    const labels = [...html.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    expect(labels).toHaveLength(13);
    expect(labels[12]).toBe("Other");
  });

  it("is required: no skip or close control, and Continue starts disabled", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toMatch(/skip|not now|close|dismiss|later/i);
    expect(html).toMatch(/aria-modal="true"/);
  });
});
