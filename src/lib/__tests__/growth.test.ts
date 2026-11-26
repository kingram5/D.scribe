import { describe, expect, it } from "vitest";
import { isPaying, parseWindow, rate, summarizeGrowth, weekOf, windowStart, type SignupRow, type VisitRow } from "../growth";

// Growth dashboard aggregation (2026-11-25).

const NOW = new Date("2026-11-25T18:00:00Z"); // a Wednesday
const signup = (over: Partial<SignupRow>): SignupRow => ({
  user_id: Math.random().toString(36).slice(2), attribution_source: "google", referrer: null, null_referrer: true,
  utm_source: null, utm_medium: null, created_at: "2026-11-24T10:00:00Z", ...over,
});

describe("windows and dates", () => {
  it("accepts only 7, 30 or 90, else 30", () => {
    expect(parseWindow("7")).toBe(7);
    expect(parseWindow("90")).toBe(90);
    for (const bad of [null, undefined, "", "14", "abc", "-7", "7.5"]) expect(parseWindow(bad)).toBe(30);
  });

  it("window start is inclusive of today, in UTC", () => {
    expect(windowStart(7, NOW)).toBe("2026-11-19");
    expect(windowStart(30, NOW)).toBe("2026-10-27");
    expect(windowStart(7, new Date("2026-11-26T03:30:00Z"))).toBe("2026-11-20"); // 9:30pm Central on the 25th is already the 26th in UTC
  });

  it("weeks start on Monday (UTC)", () => {
    expect(weekOf("2026-11-25")).toBe("2026-11-23");
    expect(weekOf("2026-11-23")).toBe("2026-11-23");
    expect(weekOf("2026-11-22T23:59:59Z")).toBe("2026-11-16");
  });

  it("rate is null with no base or when part exceeds whole", () => {
    expect(rate(1, 0)).toBeNull();
    expect(rate(5, 3)).toBeNull();
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(0, 4)).toBe(0);
  });
});

describe("paying", () => {
  it("counts a subscription or a paid tier, never a comp partner", () => {
    expect(isPaying({ tier: "premium" })).toBe(true);
    expect(isPaying({ tier: "free", stripe_subscription_id: "sub_123" })).toBe(true);
    expect(isPaying({ tier: "free", stripe_subscription_id: null })).toBe(false);
    expect(isPaying({ tier: "premium", comp_partner: true })).toBe(false);
    expect(isPaying({ tier: "free", stripe_subscription_id: "sub_1", comp_partner: true })).toBe(false);
    expect(isPaying({ tier: null })).toBe(false);
  });
});

describe("summarizeGrowth", () => {
  const visits: VisitRow[] = [
    { day: "2026-11-25", channel: "instagram", visits: 40 },
    { day: "2026-11-24", channel: "instagram", visits: 10 },
    { day: "2026-11-24", channel: "chatgpt", visits: 6 },
    { day: "2026-11-24", channel: "perplexity", visits: 4 },
    { day: "2026-11-20", channel: "direct", visits: 20 },
    { day: "2026-10-01", channel: "instagram", visits: 999 }, // outside the 7-day window
    { day: "2026-11-24", channel: "myspace", visits: 50 }, // unknown channel: ignored
  ];
  const paidA = signup({ user_id: "a", referrer: "https://l.instagram.com/", null_referrer: false, attribution_source: "instagram" });
  const rows: SignupRow[] = [
    paidA,
    signup({ user_id: "b", referrer: null, null_referrer: true, attribution_source: "instagram" }), // app hid the link: Direct, but said Instagram
    signup({ user_id: "c", referrer: "https://chatgpt.com/", null_referrer: false, attribution_source: "chatgpt" }),
    signup({ user_id: "d", referrer: null, null_referrer: null, attribution_source: "friend" }), // nothing captured
    signup({ user_id: "e", referrer: "https://l.instagram.com/", null_referrer: false, created_at: "2026-10-01T00:00:00Z" }), // outside window
  ];
  const s = summarizeGrowth({ visits, signups: rows, paying: new Set(["a", "c", "e"]), days: 7, countingSince: "2026-11-20", now: NOW });

  it("totals the window only and ignores unknown channels", () => {
    expect(s.startDay).toBe("2026-11-19");
    expect(s.endDay).toBe("2026-11-25");
    expect(s.totals).toMatchObject({ visits: 80, signups: 4, paid: 2, said: 3 });
    expect(s.totals.visitToSignupPct).toBe(5);
    expect(s.totals.signupToPaidPct).toBe(50);
  });

  it("groups channels, sorts by sign-ups, and breaks out AI assistants", () => {
    const ids = s.channels.map((c) => c.id);
    expect(ids[0]).toBe("direct"); // 2 sign-ups (b direct, d not captured)
    const ig = s.channels.find((c) => c.id === "instagram")!;
    expect(ig).toMatchObject({ visits: 50, signups: 1, said: 2, paid: 1, visitToSignupPct: 2, signupToPaidPct: 100 });
    const ai = s.channels.find((c) => c.id === "ai")!;
    expect(ai).toMatchObject({ visits: 10, signups: 1, paid: 1 });
    expect(ai.breakdown.map((b) => [b.channel, b.visits, b.signups])).toEqual([["chatgpt", 6, 1], ["perplexity", 4, 0]]);
    const direct = s.channels.find((c) => c.id === "direct")!;
    expect(direct.breakdown.map((b) => b.channel)).toEqual(["direct", "unknown"]);
    expect(direct.visitToSignupPct).toBe(10);
    expect(s.quiet).toContain("TikTok");
    expect(s.quiet).not.toContain("Instagram");
  });

  it("splits what people said, with paying", () => {
    expect(s.answers).toEqual([
      { source: "instagram", label: "Instagram", count: 2, paid: 1 },
      { source: "chatgpt", label: "ChatGPT", count: 1, paid: 1 },
      { source: "friend", label: "Friend or colleague", count: 1, paid: 0 },
    ]);
  });

  it("weekly rows cover the whole window, newest first, quiet weeks as zero", () => {
    expect(s.weekly.map((w) => w.week)).toEqual(["2026-11-23", "2026-11-16"]);
    expect(s.weekly[0]).toMatchObject({ visits: 60, signups: 4 });
    expect(s.weekly[1]).toMatchObject({ visits: 20, signups: 0 });
    expect(s.weekly[0].byGroup).toEqual({ instagram: 1, direct: 2, ai: 1 });
    expect(s.weeklyGroups.map((g) => g.id)).toEqual(["direct", "instagram", "ai"]);
    const s90 = summarizeGrowth({ visits: [], signups: [], paying: new Set(), days: 90, countingSince: null, now: NOW });
    expect(s90.weekly.length).toBe(14);
    expect(s90.weekly.every((w) => w.visits === 0 && w.signups === 0)).toBe(true);
  });

  it("empty input: no channels, every group quiet, rates null", () => {
    const e = summarizeGrowth({ visits: [], signups: [], paying: new Set(), days: 30, countingSince: null, now: NOW });
    expect(e.channels).toEqual([]);
    expect(e.quiet.length).toBe(11);
    expect(e.totals.visitToSignupPct).toBeNull();
    expect(e.totals.signupToPaidPct).toBeNull();
    expect(e.countingSince).toBeNull();
  });

  it("more sign-ups than visits (sign-ups that predate visit counting) shows no rate", () => {
    const x = summarizeGrowth({
      visits: [{ day: "2026-11-25", channel: "google", visits: 1 }],
      signups: [signup({ referrer: "https://www.google.com/", null_referrer: false }), signup({ referrer: "https://www.google.com/", null_referrer: false })],
      paying: new Set(), days: 7, countingSince: "2026-11-25", now: NOW,
    });
    expect(x.channels[0]).toMatchObject({ id: "search", visits: 1, signups: 2, visitToSignupPct: null });
    expect(x.channels[0].breakdown).toEqual([]); // only Google active: no sub-row repeating the group
  });
});
