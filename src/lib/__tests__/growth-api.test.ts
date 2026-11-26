import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// /admin/growth: who may see it (admins + read-only GROWTH_VIEWER_EMAILS, exact
// lowercase match, confirmed email, 404 otherwise), FAIL SOFT per source, and
// the view's states.

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string | null },
  missing: new Set<string>(),
  visits: [] as unknown[],
  signups: [] as unknown[],
  balances: [] as unknown[],
  queries: [] as string[],
}));

vi.mock("@/lib/auth", () => ({ getUser: async () => state.user }));
vi.mock("@/lib/partners", () => ({
  isPartnerAdmin: (email: string) => (process.env.PARTNER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).includes(email.toLowerCase()),
}));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      state.queries.push(table);
      const err = state.missing.has(table) ? { code: "42P01", message: `relation "${table}" does not exist` } : null;
      const data = table === "visit_channel_daily" ? state.visits : table === "user_attribution" ? state.signups : state.balances;
      const result = { data: err ? null : data, error: err };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "gte", "order", "in", "eq"]) chain[m] = () => chain;
      chain.range = async () => result;
      chain.limit = async () => ({ data: err ? null : (data as { day?: string }[]).slice(0, 1), error: err });
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return chain;
    },
  }),
}));

import { GET } from "@/app/api/admin/growth/route";
import { isGrowthViewer, growthViewerEmails } from "@/lib/growth-viewers";
import { GrowthDashboard } from "@/components/growth/GrowthDashboard";
import { growthFixture } from "@/components/growth/growth-fixtures";

const get = (days = "30") => GET(new NextRequest(`https://www.d-scribe.app/api/admin/growth?days=${days}`));
const confirmed = "2026-11-01T00:00:00Z";
const ENV = { ...process.env };

beforeEach(() => {
  process.env.PARTNER_ADMIN_EMAILS = "owner@example.com";
  process.env.GROWTH_VIEWER_EMAILS = " Viewer@Example.com , second@example.com,not-an-email";
  state.user = null; state.missing = new Set(); state.visits = []; state.signups = []; state.balances = []; state.queries = [];
});
afterEach(() => { process.env = { ...ENV }; });

describe("who can open the growth dashboard", () => {
  it("viewer list: trimmed, lowercased, exact match only", () => {
    expect([...growthViewerEmails()].sort()).toEqual(["second@example.com", "viewer@example.com"]);
    expect(isGrowthViewer("VIEWER@example.com")).toBe(true);
    expect(isGrowthViewer("viewer+x@example.com")).toBe(false);
    expect(isGrowthViewer("v.iewer@example.com")).toBe(false);
    expect(isGrowthViewer("viewer@example.com.evil.io")).toBe(false);
    expect(isGrowthViewer("example.com")).toBe(false);
    expect(isGrowthViewer(null)).toBe(false);
    expect(growthViewerEmails("")).toEqual(new Set());
  });

  it("404 for signed-out, unlisted, and unconfirmed callers, without reading anything", async () => {
    expect((await get()).status).toBe(404);
    state.user = { id: "u1", email: "stranger@example.com", email_confirmed_at: confirmed };
    expect((await get()).status).toBe(404);
    state.user = { id: "u2", email: "viewer@example.com", email_confirmed_at: null };
    expect((await get()).status).toBe(404);
    expect(state.queries).toEqual([]);
  });

  it("partner admin and listed viewer both get the numbers; the viewer is marked read-only", async () => {
    state.user = { id: "u3", email: "owner@example.com", email_confirmed_at: confirmed };
    let res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).viewer).toBe("admin");
    state.user = { id: "u4", email: "Viewer@Example.com", email_confirmed_at: confirmed };
    res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).viewer).toBe("viewer");
  });
});

describe("GET /api/admin/growth", () => {
  beforeEach(() => { state.user = { id: "u3", email: "owner@example.com", email_confirmed_at: confirmed }; });

  it("joins visits, sign-ups and paying per channel", async () => {
    const today = new Date().toISOString().slice(0, 10);
    state.visits = [{ day: today, channel: "instagram", visits: 10 }];
    state.signups = [
      { user_id: "a", attribution_source: "instagram", referrer: "https://l.instagram.com/", null_referrer: false, utm_source: null, utm_medium: null, created_at: new Date().toISOString() },
      { user_id: "b", attribution_source: "instagram", referrer: "https://l.instagram.com/", null_referrer: false, utm_source: null, utm_medium: null, created_at: new Date().toISOString() },
    ];
    state.balances = [
      { user_id: "a", tier: "premium", stripe_subscription_id: "sub_1", comp_partner: false },
      { user_id: "b", tier: "premium", stripe_subscription_id: null, comp_partner: true },
    ];
    const body = await (await get("7")).json();
    expect(body.available).toBe(true);
    expect(body.summary.days).toBe(7);
    expect(body.summary.countingSince).toBe(today);
    expect(body.summary.channels[0]).toMatchObject({ id: "instagram", visits: 10, signups: 2, paid: 1, visitToSignupPct: 20, signupToPaidPct: 50 });
    expect(body.sources).toEqual({ visits: true, signups: true, paying: true });
  });

  it("bad ?days falls back to 30", async () => {
    expect((await (await get("365")).json()).summary.days).toBe(30);
  });

  it("FAILS SOFT: no visit table still shows sign-ups; nothing at all says to run 033", async () => {
    state.missing = new Set(["visit_channel_daily"]);
    let body = await (await get()).json();
    expect(body.available).toBe(true);
    expect(body.sources.visits).toBe(false);
    expect(body.summary.countingSince).toBeNull();
    state.missing = new Set(["visit_channel_daily", "user_attribution"]);
    const res = await get();
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/033/);
  });

  it("FAILS SOFT on plans: paying 0 and flagged, page still renders", async () => {
    state.signups = [{ user_id: "a", attribution_source: "google", referrer: null, null_referrer: true, utm_source: null, utm_medium: null, created_at: new Date().toISOString() }];
    state.missing = new Set(["ink_balances"]);
    const body = await (await get()).json();
    expect(body.available).toBe(true);
    expect(body.sources.paying).toBe(false);
    expect(body.summary.totals.paid).toBe(0);
  });
});

describe("the dashboard view", () => {
  const html = (kind: Parameters<typeof growthFixture>[0]) =>
    renderToStaticMarkup(React.createElement(GrowthDashboard, { payload: growthFixture(kind), days: 30, onDays: () => undefined }));

  it("full: channels, both layouts, rates, the counting-since note and the Vercel link", () => {
    const h = html("full");
    expect(h).toContain("What’s working");
    expect(h).toContain("Instagram");
    expect(h).toContain("AI assistants");
    expect(h).toContain(`class="gd-table-wide`);
    expect(h).toContain(`class="gd-cards"`);
    expect(h).toMatch(/Visits started counting on Nov 25/);
    expect(h).toMatch(/href="https:\/\/vercel\.com\/"[^>]*>Vercel Analytics/);
    expect(h).toMatch(/aria-pressed="true"[^>]*>Last 30 days/);
  });

  it("empty: intentional empty states, no table", () => {
    const h = html("empty");
    expect(h).toContain("Nothing in the last 30 days yet.");
    expect(h).toContain("No answers in the last 30 days yet.");
    expect(h).toContain("No visits counted yet.");
    expect(h).not.toContain(`class="gd-table-wide`);
  });

  it("missing visit table: says so, still shows sign-ups", () => {
    const h = html("no-visits");
    expect(h).toContain("Visit counts are not available yet");
    expect(h).toContain("Friend or colleague");
  });

  it("unavailable: shows the reason", () => {
    expect(html("unavailable")).toContain("Run migration 033_signup_attribution.sql");
  });
});
