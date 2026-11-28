import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: { promotionCodes: { list: (...a: unknown[]) => list(...a) } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FOUNDING_MONTHLY, foundingOn, foundingStatus, resetFoundingCache, seatsFrom } from "@/lib/founding";
import { foundingSeatsLine } from "@/components/pricing/FoundingBanner";

const promo = (over: Partial<{ id: string; active: boolean; max_redemptions: number | null; times_redeemed: number }> = {}) => ({
  id: "promo_123",
  active: true,
  max_redemptions: 100,
  times_redeemed: 37,
  ...over,
});

describe("Founding 100", () => {
  beforeEach(() => {
    resetFoundingCache();
    list.mockReset();
    process.env.FOUNDING_OFFER = "true";
    process.env.STRIPE_FOUNDING_PROMO_CODE = "FOUNDING100";
  });
  afterEach(() => {
    delete process.env.FOUNDING_OFFER;
    delete process.env.STRIPE_FOUNDING_PROMO_CODE;
  });

  it("is $99 minus the $50-off coupon", () => {
    expect(FOUNDING_MONTHLY).toBe(49);
  });

  it("is off unless the flag says exactly true", async () => {
    process.env.FOUNDING_OFFER = "yes";
    expect(foundingOn()).toBe(false);
    expect(await foundingStatus()).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("is off with no code set, without calling Stripe", async () => {
    process.env.STRIPE_FOUNDING_PROMO_CODE = "  ";
    expect(await foundingStatus()).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("reads seats left from the capped promotion code", async () => {
    list.mockResolvedValue({ data: [promo()] });
    expect(await foundingStatus()).toEqual({ promoId: "promo_123", total: 100, remaining: 63 });
    expect(list).toHaveBeenCalledWith({ code: "FOUNDING100", active: true, limit: 1 });
  });

  it("treats a missing, inactive or uncapped code as no offer", async () => {
    list.mockResolvedValue({ data: [] });
    expect(await foundingStatus()).toBeNull();
    expect(seatsFrom(promo({ active: false }))).toBeNull();
    expect(seatsFrom(promo({ max_redemptions: null }))).toBeNull();
  });

  it("never reports fewer than zero seats", () => {
    expect(seatsFrom(promo({ times_redeemed: 104 }))?.remaining).toBe(0);
  });

  it("hides the offer when Stripe fails", async () => {
    list.mockRejectedValue(new Error("stripe down"));
    expect(await foundingStatus()).toBeNull();
  });

  it("caches for a minute, then reads Stripe again", async () => {
    list.mockResolvedValue({ data: [promo()] });
    await foundingStatus(1_000);
    await foundingStatus(30_000);
    expect(list).toHaveBeenCalledTimes(1);
    list.mockResolvedValue({ data: [promo({ times_redeemed: 38 })] });
    expect((await foundingStatus(62_000))?.remaining).toBe(62);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("banner seat line reads naturally", () => {
    expect(foundingSeatsLine({ on: true, remaining: 63, total: 100, price: 49, regular: 99 })).toBe("63 seats left of 100");
    expect(foundingSeatsLine({ on: true, remaining: 1, total: 100, price: 49, regular: 99 })).toBe("1 seat left of 100");
  });
});
