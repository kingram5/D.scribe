import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FIRST_TOUCH_KEY, VISIT_PINGED_KEY, claimVisitPing, recordFirstTouch } from "../attribution";
import { isAppPath } from "../app-routes";
import { channelFromPingBody, hashedIpKey, isForeignOrigin, isLikelyBot } from "../visit-ping";

// POST /api/attribution/visit: anonymous visit counts by channel. Channel worked
// out on the server, bots and declines dropped, rate-limited per (hashed) IP,
// and FAIL SOFT when migration 033 has not run.

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcError: null as null | { code?: string; message: string },
  rpcThrows: false,
  allowed: true,
  limiterKeys: [] as string[],
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async (key: string) => { state.limiterKeys.push(key); return { allowed: state.allowed, retryAfterMs: 0 }; },
}));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      if (state.rpcThrows) throw new Error("network down");
      state.rpc(fn, args);
      return { data: null, error: state.rpcError };
    },
  }),
}));

import { POST } from "@/app/api/attribution/visit/route";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function visit(body: unknown, headers: Record<string, string> = {}) {
  return POST(new NextRequest("https://www.d-scribe.app/api/attribution/visit", {
    method: "POST",
    headers: { "user-agent": CHROME, "content-type": "application/json", "x-real-ip": "203.0.113.7", origin: "https://www.d-scribe.app", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

beforeEach(() => {
  state.rpc.mockClear(); state.rpcError = null; state.rpcThrows = false; state.allowed = true; state.limiterKeys = [];
});

describe("POST /api/attribution/visit", () => {
  it("counts one visit under the channel the SERVER derives", async () => {
    const res = await visit({ referrer: "https://l.instagram.com/" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counted: true, channel: "instagram" });
    expect(state.rpc).toHaveBeenCalledWith("bump_visit_channel", { p_channel: "instagram" });
  });

  it("ignores a channel name sent by the client", async () => {
    await visit({ channel: "chatgpt", referrer: "" });
    expect(state.rpc).toHaveBeenCalledWith("bump_visit_channel", { p_channel: "direct" });
    state.rpc.mockClear();
    await visit({ channel: "tiktok", utm_source: "newsletter" });
    expect(state.rpc).toHaveBeenCalledWith("bump_visit_channel", { p_channel: "email" });
  });

  it("utm_source wins over the referrer", async () => {
    await visit({ referrer: "https://www.google.com/", utm_source: "tiktok" });
    expect(state.rpc).toHaveBeenCalledWith("bump_visit_channel", { p_channel: "tiktok" });
  });

  it("FAILS SOFT when the function is missing or the database errors", async () => {
    state.rpcError = { code: "PGRST202", message: "Could not find the function public.bump_visit_channel" };
    let res = await visit({ referrer: "" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counted: false });
    state.rpcError = null; state.rpcThrows = true;
    res = await visit({ referrer: "" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counted: false });
  });

  it("drops bots and empty user agents without touching the database", async () => {
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 HeadlessChrome/120", "Chrome-Lighthouse", "curl/8.4.0", ""]) {
      const res = await visit({ referrer: "" }, { "user-agent": ua });
      expect(await res.json()).toEqual({ counted: false });
    }
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.limiterKeys).toHaveLength(0);
  });

  it("drops posts from another site's pages", async () => {
    const res = await visit({ referrer: "" }, { origin: "https://evil.example" });
    expect(await res.json()).toEqual({ counted: false });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("honours a declined-analytics cookie even if the client pings anyway", async () => {
    const declined = encodeURIComponent(JSON.stringify({ necessary: true, analytics: false, marketing: false, v: 1 }));
    const res = await visit({ referrer: "" }, { cookie: `dscribe_consent=${declined}` });
    expect(await res.json()).toEqual({ counted: false });
    expect(state.rpc).not.toHaveBeenCalled();
    const accepted = encodeURIComponent(JSON.stringify({ necessary: true, analytics: true, marketing: false, v: 1 }));
    await visit({ referrer: "" }, { cookie: `dscribe_consent=${accepted}` });
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("rate-limits per IP, keyed on a hash (the raw IP is never used as the key)", async () => {
    await visit({ referrer: "" });
    expect(state.limiterKeys).toHaveLength(1);
    expect(state.limiterKeys[0]).not.toContain("203.0.113.7");
    expect(state.limiterKeys[0]).toBe(hashedIpKey("203.0.113.7"));
    state.allowed = false;
    const res = await visit({ referrer: "" });
    expect(res.status).toBe(429);
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized and malformed bodies", async () => {
    let res = await visit({ referrer: "x".repeat(5000) });
    expect(res.status).toBe(413);
    res = await visit("not json");
    expect(res.status).toBe(400);
    res = await visit([1, 2]);
    expect(res.status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("visit-ping helpers", () => {
  it("bot filter keeps real browsers and in-app browsers", () => {
    for (const ua of [
      CHROME,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0]",
      "Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    ]) expect([ua, isLikelyBot(ua)]).toEqual([ua, false]);
    expect(isLikelyBot(null)).toBe(true);
    expect(isLikelyBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
  });

  it("foreign-origin check", () => {
    expect(isForeignOrigin(null, "www.d-scribe.app")).toBe(false);
    expect(isForeignOrigin("https://www.d-scribe.app", "www.d-scribe.app")).toBe(false);
    expect(isForeignOrigin("https://d-scribe.app.evil.com", "www.d-scribe.app")).toBe(true);
    expect(isForeignOrigin("garbage", "www.d-scribe.app")).toBe(true);
  });

  it("hashed key is stable per IP and differs between IPs", () => {
    expect(hashedIpKey("1.2.3.4")).toBe(hashedIpKey("1.2.3.4"));
    expect(hashedIpKey("1.2.3.4")).not.toBe(hashedIpKey("1.2.3.5"));
    expect(hashedIpKey("1.2.3.4")).toMatch(/^visit:[0-9a-f]{24}$/);
  });

  it("channelFromPingBody clips and ignores non-strings", () => {
    expect(channelFromPingBody(null)).toBeNull();
    expect(channelFromPingBody("x")).toBeNull();
    expect(channelFromPingBody({ referrer: 5, utm_source: { a: 1 } })).toBe("direct");
    expect(channelFromPingBody({ referrer: "https://www.reddit.com/r/x" })).toBe("reddit");
  });
});

describe("one ping per browser, ever", () => {
  const now = new Date("2026-11-25T15:00:00Z");
  const mk = () => {
    const store = new Map<string, string>();
    return { store, storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } };
  };

  it("pings on the first visit with only referrer + utm_source/utm_medium", () => {
    const { storage, store } = mk();
    const touch = recordFirstTouch(storage, "https://www.d-scribe.app/?utm_source=ig&utm_medium=social&utm_campaign=launch", "https://l.instagram.com/x?e=1", { analyticsDeclined: false, isAppPath, now });
    expect(claimVisitPing(storage, touch, false)).toEqual({ referrer: "https://l.instagram.com/x", utm_source: "ig", utm_medium: "social" });
    expect(store.get(VISIT_PINGED_KEY)).toBe("1");
  });

  it("never pings again: not on the next page, not after signup deletes the first touch", () => {
    const { storage, store } = mk();
    const opts = { analyticsDeclined: false, isAppPath, now };
    expect(claimVisitPing(storage, recordFirstTouch(storage, "https://www.d-scribe.app/", "", opts), false)).not.toBeNull();
    expect(claimVisitPing(storage, recordFirstTouch(storage, "https://www.d-scribe.app/pricing", "", opts), false)).toBeNull();
    store.delete(FIRST_TOUCH_KEY); // AttributionGate.finish after the answer is stored
    expect(claimVisitPing(storage, recordFirstTouch(storage, "https://www.d-scribe.app/", "https://www.google.com/", opts), false)).toBeNull();
  });

  it("never pings from the signed-in app or with analytics declined, and a decline clears the marker", () => {
    const { storage, store } = mk();
    expect(claimVisitPing(storage, recordFirstTouch(storage, "https://www.d-scribe.app/dashboard", "", { analyticsDeclined: false, isAppPath, now }), false)).toBeNull();
    expect(store.has(VISIT_PINGED_KEY)).toBe(false);
    expect(claimVisitPing(storage, recordFirstTouch(storage, "https://www.d-scribe.app/", "", { analyticsDeclined: true, isAppPath, now }), true)).toBeNull();
    expect(store.size).toBe(0);
    store.set(VISIT_PINGED_KEY, "1");
    claimVisitPing(storage, null, true);
    expect(store.has(VISIT_PINGED_KEY)).toBe(false);
  });
});
