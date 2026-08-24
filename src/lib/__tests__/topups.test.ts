/**
 * À la carte top-up packs: spend order, eligibility, webhook grant/replay/clawback,
 * and the subscription lifecycle never touching topup_* columns.
 */

import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTopupGrant,
  canBuyInkPack,
  canBuyVoicePack,
  clawbackTopup,
  renewalRefillPayload,
  safeReturnTo,
  spendInk,
  spendTts,
  ttsGateLocked,
} from "@/lib/topups";

describe("spendInk — monthly first, then top-up", () => {
  it("covers the cost from monthly Ink alone", () => {
    expect(spendInk(300, 200, 40)).toEqual({ allowed: true, monthly: 260, topup: 200 });
  });

  it("splits across the monthly / top-up boundary", () => {
    expect(spendInk(10, 200, 40)).toEqual({ allowed: true, monthly: 0, topup: 170 });
  });

  it("spends from the top-up bucket when monthly is empty", () => {
    expect(spendInk(0, 200, 40)).toEqual({ allowed: true, monthly: 0, topup: 160 });
  });

  it("rejects when both buckets cannot cover the cost", () => {
    expect(spendInk(2, 3, 10)).toEqual({ allowed: false, monthly: 2, topup: 3 });
  });
});

describe("spendTts — monthly first, then top-up", () => {
  it("covers the request from the monthly allowance", () => {
    expect(spendTts(100, 20000, 5000, 400)).toMatchObject({
      allowed: true,
      used: 500,
      topup_remaining: 5000,
      monthly_take: 400,
      topup_take: 0,
    });
  });

  it("splits across the monthly / top-up boundary", () => {
    expect(spendTts(19500, 20000, 1000, 1000)).toMatchObject({
      allowed: true,
      used: 20000,
      topup_remaining: 500,
      monthly_take: 500,
      topup_take: 500,
    });
  });

  it("spends from the top-up bucket when monthly is empty", () => {
    expect(spendTts(20000, 20000, 20000, 800)).toMatchObject({
      allowed: true,
      used: 20000,
      topup_remaining: 19200,
      monthly_take: 0,
      topup_take: 800,
    });
  });

  it("rejects when both buckets cannot cover the request", () => {
    expect(spendTts(20000, 20000, 100, 500)).toMatchObject({
      allowed: false,
      used: 20000,
      topup_remaining: 100,
    });
  });
});

describe("top-up grant and clawback helpers", () => {
  it("applies voice and ink grants onto separate buckets", () => {
    const afterVoice = applyTopupGrant({ topup_ink: 10, topup_tts_chars: 0 }, "voice_pack");
    expect(afterVoice).toEqual({ topup_ink: 10, topup_tts_chars: 20000 });
    expect(applyTopupGrant(afterVoice, "ink_pack")).toEqual({ topup_ink: 210, topup_tts_chars: 20000 });
  });

  it("claws back the granted amount and floors at 0", () => {
    expect(clawbackTopup({ topup_ink: 50, topup_tts_chars: 100 }, { ink: 200, tts_chars: 20000 }))
      .toEqual({ topup_ink: 0, topup_tts_chars: 0 });
  });
});

describe("renewalRefillPayload", () => {
  it("refills only monthly Ink — never topup_* columns", () => {
    const payload = renewalRefillPayload("pro", new Date("2026-08-01T00:00:00.000Z"));
    expect(payload).toEqual({
      ink_balance: 660,
      ink_period_start: "2026-08-01T00:00:00.000Z",
    });
    expect(Object.keys(payload)).toEqual(["ink_balance", "ink_period_start"]);
  });
});

describe("eligibility and TTS gate", () => {
  it("lets a paid tier or existing Stripe customer buy an Ink pack", () => {
    expect(canBuyInkPack("free", false)).toBe(false);
    expect(canBuyInkPack("free", true)).toBe(true);
    expect(canBuyInkPack("starter", false)).toBe(true);
  });

  it("lets pro/premium or leftover voice credits buy a voice pack", () => {
    expect(canBuyVoicePack("starter", 0)).toBe(false);
    expect(canBuyVoicePack("pro", 0)).toBe(true);
    expect(canBuyVoicePack("starter", 100)).toBe(true);
  });

  it("locks free/starter voice unless leftover top-up chars remain", () => {
    expect(ttsGateLocked("starter", 0)).toBe(true);
    expect(ttsGateLocked("starter", 100)).toBe(false);
    expect(ttsGateLocked("free", 0)).toBe(true);
    expect(ttsGateLocked("pro", 0)).toBe(false);
  });

  it("accepts only same-site return paths", () => {
    expect(safeReturnTo("/settings")).toBe("/settings");
    expect(safeReturnTo("https://evil.example/phish")).toBe("/dashboard?topup=success");
    expect(safeReturnTo("//evil.example")).toBe("/dashboard?topup=success");
  });
});

describe("subscription lifecycle must not write topup_*", () => {
  const webhook = fs.readFileSync(
    path.resolve(__dirname, "../../app/api/stripe/webhook/route.ts"),
    "utf8",
  );

  it("renewal refill goes through renewalRefillPayload", () => {
    expect(webhook).toMatch(/\.update\(renewalRefillPayload\(balance\.tier\)\)/);
  });

  it("freezeInk zeroes only ink_balance", () => {
    const freeze = webhook.slice(webhook.indexOf("async function freezeInk"), webhook.indexOf("async function revokeEntitlement"));
    expect(freeze).toMatch(/update\(\{ ink_balance: 0 \}\)/);
    expect(freeze).not.toMatch(/topup_/);
  });

  it("revokeEntitlement and subscription.deleted leave topup_* unread", () => {
    const revoke = webhook.slice(webhook.indexOf("async function revokeEntitlement"), webhook.indexOf("async function handleStripeEvent"));
    expect(revoke).not.toMatch(/topup_/);
    expect(revoke).toMatch(/tier: "free", ink_balance: 0, stripe_subscription_id: null/);
    const deleted = webhook.slice(webhook.indexOf("customer.subscription.deleted"), webhook.indexOf("invoice.payment_succeeded"));
    expect(deleted).not.toMatch(/topup_/);
  });

  it("activateSubscription upsert does not mention topup_*", () => {
    const activate = webhook.slice(webhook.indexOf("async function activateSubscription"), webhook.indexOf("async function freezeInk"));
    expect(activate).not.toMatch(/topup_/);
  });
});

const balances: Record<string, { topup_ink: number; topup_tts_chars: number }> = {};
const purchases: Array<{
  id: string;
  user_id: string;
  sku: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  granted: unknown;
  status: string;
}> = [];

function thenable<T>(value: T) {
  return {
    then(resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === "topup_purchases") {
            if (purchases.some((p) => p.stripe_session_id === row.stripe_session_id)) {
              return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
            }
            purchases.push({
              id: `p-${purchases.length + 1}`,
              user_id: String(row.user_id),
              sku: String(row.sku),
              stripe_session_id: String(row.stripe_session_id),
              stripe_payment_intent: (row.stripe_payment_intent as string | null) ?? null,
              granted: row.granted,
              status: "granted",
            });
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(col: string, val: string) {
              return {
                single: async () => {
                  if (table === "ink_balances" && col === "user_id") {
                    return {
                      data: balances[val] ?? { topup_ink: 0, topup_tts_chars: 0 },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                },
                maybeSingle: async () => {
                  if (table === "topup_purchases" && col === "stripe_payment_intent") {
                    return { data: purchases.find((p) => p.stripe_payment_intent === val) ?? null, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          const apply = (col: string, val: string) => {
            if (table === "ink_balances" && col === "user_id") {
              balances[val] = { ...(balances[val] ?? { topup_ink: 0, topup_tts_chars: 0 }), ...patch } as {
                topup_ink: number;
                topup_tts_chars: number;
              };
            }
            if (table === "topup_purchases" && col === "id") {
              const row = purchases.find((p) => p.id === val);
              if (row) Object.assign(row, patch);
            }
            return { error: null };
          };
          return {
            eq(col: string, val: string) {
              return {
                eq() {
                  return Promise.resolve(apply(col, val));
                },
                ...thenable(apply(col, val)),
              };
            },
          };
        },
      };
    },
  }),
}));

describe("webhook top-up grant / replay / clawback", () => {
  beforeEach(() => {
    purchases.length = 0;
    for (const key of Object.keys(balances)) delete balances[key];
    balances["user-1"] = { topup_ink: 0, topup_tts_chars: 0 };
  });

  it("grants a voice pack once and ignores a replayed session id", async () => {
    const { grantTopupPurchase } = await import("@/app/api/stripe/webhook/route");
    const first = await grantTopupPurchase({
      userId: "user-1",
      sku: "voice_pack",
      stripeSessionId: "cs_1",
      paymentIntent: "pi_1",
      amountCents: 2000,
    });
    expect(first).toEqual({ granted: true, replayed: false });
    expect(balances["user-1"].topup_tts_chars).toBe(20000);

    const replay = await grantTopupPurchase({
      userId: "user-1",
      sku: "voice_pack",
      stripeSessionId: "cs_1",
      paymentIntent: "pi_1",
      amountCents: 2000,
    });
    expect(replay).toEqual({ granted: false, replayed: true });
    expect(balances["user-1"].topup_tts_chars).toBe(20000);
    expect(purchases).toHaveLength(1);
  });

  it("claws back a granted purchase and floors the bucket at 0", async () => {
    const { grantTopupPurchase, clawbackTopupPurchase } = await import("@/app/api/stripe/webhook/route");
    await grantTopupPurchase({
      userId: "user-1",
      sku: "ink_pack",
      stripeSessionId: "cs_ink",
      paymentIntent: "pi_ink",
      amountCents: 2000,
    });
    balances["user-1"].topup_ink = 50;
    const clawed = await clawbackTopupPurchase("pi_ink");
    expect(clawed).toBe(true);
    expect(balances["user-1"].topup_ink).toBe(0);
    expect(purchases[0].status).toBe("clawed_back");
    expect(await clawbackTopupPurchase("pi_ink")).toBe(false);
  });
});
