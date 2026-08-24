/**
 * Unit tests for src/lib/stripe.ts
 *
 * TIER_INK is a pure constant that maps tier names to Ink allotments. It drives
 * both checkout activation and billing-cycle resets — wrong values would silently
 * give users wrong balances. Worth pinning.
 *
 * We do NOT import the `stripe` proxy object (it would call `new Stripe(...)` and
 * require STRIPE_SECRET_KEY). Only the pure exports are tested here.
 */

import { describe, it, expect } from "vitest";
import { TIER_INK, STRIPE_PRICES, TOPUP_GRANTS } from "@/lib/stripe";

describe("TIER_INK", () => {
  it("starter tier gets 300 Ink", () => {
    expect(TIER_INK["starter"]).toBe(300);
  });

  it("pro tier gets 660 Ink", () => {
    expect(TIER_INK["pro"]).toBe(660);
  });

  it("premium tier gets 1500 Ink", () => {
    expect(TIER_INK["premium"]).toBe(1500);
  });

  it("tiers are in ascending order (starter < pro < premium)", () => {
    expect(TIER_INK["starter"]).toBeLessThan(TIER_INK["pro"]);
    expect(TIER_INK["pro"]).toBeLessThan(TIER_INK["premium"]);
  });

  it("unknown tier returns undefined (not a silent zero)", () => {
    expect(TIER_INK["free"]).toBeUndefined();
  });
});

describe("TOPUP_GRANTS", () => {
  it("voice pack grants 20,000 chars and ink pack grants 200 Ink", () => {
    expect(TOPUP_GRANTS.voice_pack).toEqual({ tts_chars: 20000 });
    expect(TOPUP_GRANTS.ink_pack).toEqual({ ink: 200 });
  });
});

describe("STRIPE_PRICES shape", () => {
  it("contains starter, pro, and premium keys", () => {
    expect(Object.keys(STRIPE_PRICES)).toEqual(
      expect.arrayContaining(["starter", "pro", "premium"])
    );
  });
});
