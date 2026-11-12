import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("plan sets", () => {
  it("v1 stays live until NEXT_PUBLIC_PLANS_V2 is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLANS_V2", "");
    const { PLANS, INK_LIMITS } = await import("../tiers");
    expect([PLANS.starter.price, PLANS.pro.price, PLANS.premium.price]).toEqual([25, 50, 100]);
    expect([INK_LIMITS.starter, INK_LIMITS.pro, INK_LIMITS.premium]).toEqual([300, 660, 1500]);
  });

  it("v2 doubles prices and sizes Ink to whole Publisher-Ready books plus interview headroom (1/2/5)", async () => {
    vi.stubEnv("NEXT_PUBLIC_PLANS_V2", "true");
    const { PLANS, INK_LIMITS, INK_PER_PUBLISHER_READY_BOOK } = await import("../tiers");
    expect([PLANS.starter.price, PLANS.pro.price, PLANS.premium.price]).toEqual([50, 100, 200]);
    expect([INK_LIMITS.starter, INK_LIMITS.pro, INK_LIMITS.premium]).toEqual([1500, 3000, 7500]);
    // Each plan covers its whole books plus the month's interviews (~115 Ink per book).
    expect(Math.floor(INK_LIMITS.starter / (INK_PER_PUBLISHER_READY_BOOK + 115))).toBe(1);
    expect(Math.floor(INK_LIMITS.pro / (INK_PER_PUBLISHER_READY_BOOK + 115))).toBe(2);
    expect(Math.floor(INK_LIMITS.premium / (INK_PER_PUBLISHER_READY_BOOK + 115))).toBe(5);
    const { TIER_INK } = await import("../stripe");
    expect(TIER_INK).toEqual({ starter: 1500, pro: 3000, premium: 7500 });
  });

  it("v2 Ink matches migration 030's SQL allotments", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/030_publisher_ready_plans.sql"), "utf8");
    expect(sql).toMatch(/'starter' then return 1500/);
    expect(sql).toMatch(/'pro'\s+then return 3000/);
    expect(sql).toMatch(/'premium' then return 7500/);
  });
});

describe("price -> tier", () => {
  it("maps current and legacy prices to the same tier", async () => {
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_new_starter");
    vi.stubEnv("STRIPE_PRICE_STARTER_LEGACY", "price_old_starter");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_new_pro");
    const { tierForPrice } = await import("../stripe");
    expect(tierForPrice("price_new_starter")).toBe("starter");
    expect(tierForPrice("price_old_starter")).toBe("starter");
    expect(tierForPrice("price_new_pro")).toBe("pro");
    expect(tierForPrice("price_unknown")).toBeUndefined();
    expect(tierForPrice(undefined)).toBeUndefined();
  });
});
