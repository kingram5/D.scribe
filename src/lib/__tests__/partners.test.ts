/**
 * Creator partner program (Kyle 2026-09-25): the money rules, the free-Ink claim,
 * and source-level guards on the three places a bug would cost real money:
 * the webhook (partner work must never block entitlement), checkout (a dead
 * creator code must never block a sale) and payout release (session only).
 */
import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commissionAvailableAt,
  commissionCents,
  inCommissionWindow,
  isNewAccount,
  normalizeCode,
  normalizeSlug,
  payableCents,
  suggestSlugAndCode,
} from "@/lib/partner-rules";

describe("partner rules", () => {
  it("normalizes link names and codes", () => {
    expect(normalizeSlug("  Pastor Jane Doe ")).toBe("pastor-jane-doe");
    expect(normalizeSlug("a")).toBeNull();
    expect(normalizeSlug(42)).toBeNull();
    expect(normalizeCode("jane50")).toBe("JANE50");
    expect(normalizeCode("ja ne!50")).toBe("JANE50");
    expect(normalizeCode("ab")).toBeNull();
    expect(suggestSlugAndCode("Pastor Jane Doe")).toEqual({ slug: "pastor-jane-doe", code: "PASTORJANEDOE50" });
  });

  it("pays 30% of what was actually paid, rounded down", () => {
    expect(commissionCents(1250)).toBe(375); // Starter at 50% off
    expect(commissionCents(2500)).toBe(750);
    expect(commissionCents(999)).toBe(299);
    expect(commissionCents(0)).toBe(0);
    expect(commissionCents(-500)).toBe(0);
    expect(commissionCents(1000, 5)).toBe(900); // rate is clamped
  });

  it("only counts payments inside the 12 months after the first one", () => {
    const first = new Date("2026-10-01T00:00:00Z");
    expect(inCommissionWindow(first, new Date("2026-10-01T00:00:00Z"))).toBe(true);
    expect(inCommissionWindow(first, new Date("2027-09-30T23:59:00Z"))).toBe(true);
    expect(inCommissionWindow(first, new Date("2027-10-01T00:00:00Z"))).toBe(false);
    expect(inCommissionWindow(first, new Date("2026-08-01T00:00:00Z"))).toBe(false);
  });

  it("holds each commission 30 days, and only cleared unpaid rows are payable", () => {
    const paid = new Date("2026-10-01T12:00:00Z");
    expect(commissionAvailableAt(paid).toISOString()).toBe("2026-10-31T12:00:00.000Z");
    const now = new Date("2026-11-15T00:00:00Z");
    expect(payableCents([
      { commission_cents: 375, status: "held", available_at: "2026-10-31T12:00:00Z", payout_id: null },
      { commission_cents: 750, status: "held", available_at: "2026-11-20T00:00:00Z", payout_id: null }, // still in the hold
      { commission_cents: 750, status: "paid", available_at: "2026-10-01T00:00:00Z", payout_id: "p1" },
      { commission_cents: 750, status: "void", available_at: "2026-10-01T00:00:00Z", payout_id: null },
    ], now)).toBe(375);
  });

  it("treats accounts up to 7 days old as new", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    expect(isNewAccount("2026-10-04T00:00:00Z", now)).toBe(true);
    expect(isNewAccount("2026-10-02T00:00:00Z", now)).toBe(false);
    expect(isNewAccount(null, now)).toBe(false);
    expect(isNewAccount("garbage", now)).toBe(false);
  });
});

// ── claimReferral eligibility, against a fake database ───────────────────────

const state = {
  referral: null as null | { user_id: string },
  deleted: [] as string[],
  rpcArgs: null as null | Record<string, unknown>,
  balanceTier: "free",
};

vi.mock("@/lib/stripe", () => ({ stripe: {}, STRIPE_PRICES: {}, TIER_INK: { premium: 1500 } }));
vi.mock("@/lib/ink", () => ({ ensureBalance: vi.fn(async () => ({ ink_balance: 10, lifetime_used: 0, tier: state.balanceTier, topup_ink: 0 })) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, eq: self, in: self, limit: () =>
          Promise.resolve({ data: table === "deleted_account_emails" ? state.deleted.map((h) => ({ email_hash: h })) : [] }),
        maybeSingle: () => Promise.resolve({ data: table === "referrals" ? state.referral : null }),
      });
      return chain;
    },
    rpc: (_name: string, args: Record<string, unknown>) => {
      state.rpcArgs = args;
      return Promise.resolve({ data: args.p_bonus, error: null });
    },
  }),
}));

describe("claimReferral", () => {
  const partner = {
    id: "p1", slug: "jane", code: "JANE50", name: "Jane", email: "jane@example.com", user_id: "creator",
    status: "active", source: "invite", links: null, audience: null, pitch: null, commission_rate: 0.3,
    commission_months: 12, stripe_promotion_code_id: "promo_1", stripe_connect_account_id: null, approved_at: null, created_at: "",
  } as const;
  const fresh = new Date(Date.now() - 3_600_000).toISOString();

  beforeEach(() => {
    state.referral = null;
    state.deleted = [];
    state.rpcArgs = null;
    state.balanceTier = "free";
  });

  it("gives a brand-new free account 50 Ink", async () => {
    const { claimReferral } = await import("@/lib/partners");
    const r = await claimReferral({ userId: "u1", email: "reader@gmail.com", userCreatedAt: fresh, partner: { ...partner }, source: "link" });
    expect(r).toEqual({ claimed: true, bonus: 50, partnerName: "Jane" });
    expect(state.rpcArgs?.p_bonus).toBe(50);
  });

  it("attributes but gives no Ink to an old account, a paid account, or a checkout-time code", async () => {
    const { claimReferral } = await import("@/lib/partners");
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect((await claimReferral({ userId: "u1", email: "a@gmail.com", userCreatedAt: old, partner: { ...partner }, source: "link" })).bonus).toBe(0);
    state.balanceTier = "starter";
    expect((await claimReferral({ userId: "u1", email: "a@gmail.com", userCreatedAt: fresh, partner: { ...partner }, source: "link" })).bonus).toBe(0);
    state.balanceTier = "free";
    expect((await claimReferral({ userId: "u1", email: "a@gmail.com", userCreatedAt: fresh, partner: { ...partner }, source: "checkout" })).bonus).toBe(0);
  });

  it("gives nothing to a re-signup after deleting an account or a throwaway inbox", async () => {
    const { claimReferral, emailHash } = await import("@/lib/partners");
    state.deleted = [emailHash("reader@gmail.com")];
    expect((await claimReferral({ userId: "u1", email: "re.ader+x@gmail.com", userCreatedAt: fresh, partner: { ...partner }, source: "link" })).bonus).toBe(0);
    state.deleted = [];
    expect((await claimReferral({ userId: "u1", email: "x@mailinator.com", userCreatedAt: fresh, partner: { ...partner }, source: "link" })).bonus).toBe(0);
  });

  it("first touch wins and creators can't refer themselves", async () => {
    const { claimReferral } = await import("@/lib/partners");
    state.referral = { user_id: "u1" };
    expect((await claimReferral({ userId: "u1", email: "a@gmail.com", userCreatedAt: fresh, partner: { ...partner }, source: "link" })).claimed).toBe(false);
    state.referral = null;
    expect((await claimReferral({ userId: "creator", email: "x@gmail.com", userCreatedAt: fresh, partner: { ...partner }, source: "link" })).claimed).toBe(false);
    expect((await claimReferral({ userId: "u9", email: "Jane@Example.com", userCreatedAt: fresh, partner: { ...partner }, source: "link" })).claimed).toBe(false);
    expect(state.rpcArgs).toBeNull();
  });
});

// ── source-level guards on the money paths ───────────────────────────────────

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../../", p), "utf8").replace(/\r\n/g, "\n");

describe("money-path guards", () => {
  it("webhook: partner bookkeeping runs after entitlement and is fenced off", () => {
    const w = read("app/api/stripe/webhook/route.ts");
    const completed = w.slice(w.indexOf('event.type === "checkout.session.completed"'), w.indexOf('event.type === "customer.subscription.updated"'));
    expect(completed.indexOf("partnerSideEffect")).toBeGreaterThan(completed.indexOf("activateSubscription("));
    expect(completed.indexOf("partnerSideEffect")).toBeGreaterThan(completed.indexOf("grantTopupPurchase("));
    const invoice = w.slice(w.indexOf('event.type === "invoice.payment_succeeded"'), w.indexOf('event.type === "invoice.payment_failed"'));
    expect(invoice.indexOf("recordInvoiceCommission")).toBeGreaterThan(invoice.indexOf("renewalRefillPayload"));
    expect(invoice).toMatch(/partnerSideEffect\("invoice commission"/);
    const fence = w.slice(w.indexOf("async function partnerSideEffect"), w.indexOf("async function activateSubscription"));
    expect(fence).toMatch(/try \{[\s\S]*await fn\(\);[\s\S]*\} catch/);
    expect(fence).not.toMatch(/throw/);
  });

  it("checkout: a creator code that Stripe rejects falls back to the code box", () => {
    const c = read("app/api/stripe/checkout/route.ts");
    expect(c).toMatch(/discounts: \[\{ promotion_code: promotionCode \}\]/);
    expect(c).toMatch(/catch \(err\) \{[\s\S]*allow_promotion_codes: true/);
    // top-ups never take codes
    const topup = c.slice(c.indexOf("if (isTopupSku(topup))"), c.indexOf('if (typeof tier !== "string"'));
    expect(topup).not.toMatch(/promotion/);
  });

  it("payout release: signed-in session only, never the machine key", () => {
    const p = read("app/api/admin/partners/payouts/route.ts");
    const post = p.slice(p.indexOf("export async function POST"));
    expect(post).toMatch(/requirePartnerAdmin\(req, false\)/);
    expect(post).toMatch(/caller\?\.kind !== "session"/);
    expect(post).toMatch(/idempotencyKey/);
  });
});
