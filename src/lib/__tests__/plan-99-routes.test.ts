/**
 * The $99 single plan (NEXT_PUBLIC_PLAN_99) on the money path: checkout, the
 * in-place plan switch, and the Stripe webhook. Stripe and Supabase are fakes;
 * nothing here talks to a real service.
 *
 * What these pin down:
 *   - checkout sells the env-configured $99 price and refuses (503) without it
 *   - a subscriber on an old plan or old price is never re-priced by asking
 *     for the plan they already have
 *   - the webhook grants 1,500 Ink for the new price and keeps every old
 *     price on its old tier and old allotment, flag on or off
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const P99 = "price_test_plan_99";
const PRICE_ENV: Record<string, string> = {
  STRIPE_PRICE_STARTER: "price_test_starter",
  STRIPE_PRICE_PRO: "price_test_pro",
  STRIPE_PRICE_PREMIUM: "price_test_premium",
  STRIPE_PRICE_VOICE_PACK: "price_test_voice_pack",
  STRIPE_PRICE_INK_PACK: "price_test_ink_pack",
};

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload: Row | null };

const h = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown> | null>,
  calls: [] as { table: string; op: string; payload: Record<string, unknown> | null }[],
  stripe: {} as Record<string, unknown>,
  partners: {} as Record<string, unknown>,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: async () => ({ user: { id: "user_1", email: "a@example.com", created_at: "2026-01-01T00:00:00Z" }, error: null }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        single: async () => ({ data: h.rows[table] ?? null, error: null }),
        maybeSingle: async () => ({ data: h.rows[table] ?? null, error: null }),
        insert: async (payload: Row) => { h.calls.push({ table, op: "insert", payload }); return { error: null }; },
        upsert: async (payload: Row) => { h.calls.push({ table, op: "upsert", payload }); return { error: null }; },
        update: (payload: Row) => { h.calls.push({ table, op: "update", payload }); return q; },
        then: (resolve: (v: { data: null; error: null }) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
  return { ...actual, stripe: h.stripe };
});
vi.mock("@/lib/partners", () => ({
  referralFor: (...a: unknown[]) => (h.partners.referralFor as (...x: unknown[]) => unknown)(...a),
  findActivePartnerBySlug: async () => null,
  claimReferral: async () => ({ claimed: false, bonus: 0 }),
  hadSubscriptionBefore: async () => false,
  attributeCheckout: (...a: unknown[]) => (h.partners.attributeCheckout as (...x: unknown[]) => unknown)(...a),
  recordInvoiceCommission: (...a: unknown[]) => (h.partners.recordInvoiceCommission as (...x: unknown[]) => unknown)(...a),
  voidCommissionsForPayment: async () => {},
}));

function setup(opts: { plan99: boolean; plansV2?: boolean; plan99Price?: string | null }) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PLAN_99", opts.plan99 ? "true" : "");
  vi.stubEnv("NEXT_PUBLIC_PLANS_V2", opts.plansV2 ? "true" : "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.d-scribe.app");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  for (const [k, v] of Object.entries(PRICE_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("STRIPE_PRICE_PLAN_99", opts.plan99Price === null ? "" : opts.plan99Price ?? P99);
  h.rows = {};
  h.calls.length = 0;
  for (const k of Object.keys(h.stripe)) delete h.stripe[k];
  h.partners.referralFor = vi.fn(async () => null);
  h.partners.attributeCheckout = vi.fn(async () => {});
  h.partners.recordInvoiceCommission = vi.fn(async () => {});
}

const post = (path: string, body: unknown) =>
  new NextRequest(`https://www.d-scribe.app${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ── checkout ────────────────────────────────────────────────────────────────

async function checkout(body: unknown) {
  const create = vi.fn(async (_args: Record<string, unknown>) => ({ url: "https://checkout.stripe.test/session" }));
  h.stripe.checkout = { sessions: { create } };
  h.stripe.customers = { create: vi.fn(async () => ({ id: "cus_new" })) };
  const { POST } = await import("@/app/api/stripe/checkout/route");
  const res = await POST(post("/api/stripe/checkout", body));
  return { res, json: (await res.json()) as Record<string, unknown>, create };
}

describe("checkout", () => {
  it("flag on: a new customer is sold the env-configured $99 price, on the premium tier", async () => {
    setup({ plan99: true });
    const { res, json, create } = await checkout({ tier: "premium" });
    expect(res.status).toBe(200);
    expect(json).toEqual({ url: "https://checkout.stripe.test/session" });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args).toMatchObject({
      mode: "subscription",
      line_items: [{ price: P99, quantity: 1 }],
      metadata: { user_id: "user_1", tier: "premium" },
      allow_promotion_codes: true,
    });
  });

  it.each([
    ["missing", null],
    ["set to the $100 Premium price", "price_test_premium"],
    ["set to the Starter price", "price_test_starter"],
  ])("flag on, STRIPE_PRICE_PLAN_99 %s: 503 and no Stripe session at all", async (_label, id) => {
    setup({ plan99: true, plan99Price: id });
    const { res, json, create } = await checkout({ tier: "premium" });
    expect(res.status).toBe(503);
    expect(typeof json.error).toBe("string");
    expect(json.url).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["starter", "pro"])("flag on: the old %s plan can no longer be bought (400, no session)", async (tier) => {
    setup({ plan99: true });
    const { res, create } = await checkout({ tier });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["starter", "price_test_starter"],
    ["pro", "price_test_pro"],
    ["premium", "price_test_premium"],
  ])("flag off: %s still checks out at today's price, even with the $99 price configured", async (tier, price) => {
    setup({ plan99: false });
    const { res, create } = await checkout({ tier });
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0]).toMatchObject({ line_items: [{ price, quantity: 1 }], metadata: { tier } });
  });

  it("flag on: a creator's code is pre-applied to the $99 price", async () => {
    setup({ plan99: true });
    h.partners.referralFor = vi.fn(async () => ({
      partner: { status: "active", stripe_promotion_code_id: "promo_creator" },
      first_paid_at: null,
    }));
    const { res, create } = await checkout({ tier: "premium" });
    expect(res.status).toBe(200);
    const args = create.mock.calls[0][0];
    expect(args).toMatchObject({ line_items: [{ price: P99, quantity: 1 }], discounts: [{ promotion_code: "promo_creator" }] });
    expect(args.allow_promotion_codes).toBeUndefined();
  });

  it("flag on: a dead creator code falls back to the code box, still on the $99 price", async () => {
    setup({ plan99: true });
    h.partners.referralFor = vi.fn(async () => ({
      partner: { status: "active", stripe_promotion_code_id: "promo_dead" },
      first_paid_at: null,
    }));
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("promotion code expired"))
      .mockResolvedValueOnce({ url: "https://checkout.stripe.test/session" });
    h.stripe.checkout = { sessions: { create } };
    h.stripe.customers = { create: vi.fn(async () => ({ id: "cus_new" })) };
    const { POST } = await import("@/app/api/stripe/checkout/route");
    const res = await POST(post("/api/stripe/checkout", { tier: "premium" }));
    expect(res.status).toBe(200);
    expect(create.mock.calls[1][0]).toMatchObject({ line_items: [{ price: P99, quantity: 1 }], allow_promotion_codes: true });
  });

  it.each([true, false])("Ink refill packs are untouched with the flag %s", async (on) => {
    setup({ plan99: on });
    h.rows.ink_balances = { stripe_customer_id: "cus_1", tier: "starter", topup_tts_chars: 0 };
    const { res, create } = await checkout({ topup: "ink_pack" });
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0]).toMatchObject({
      mode: "payment",
      line_items: [{ price: "price_test_ink_pack", quantity: 1 }],
      metadata: { kind: "topup", sku: "ink_pack" },
    });
  });
});

// ── in-place plan switch ────────────────────────────────────────────────────

async function switchPlan(opts: {
  balanceTier: string;
  currentPrice: string;
  cancelPending?: boolean;
  body: unknown;
}) {
  h.rows.ink_balances = { stripe_subscription_id: "sub_1", tier: opts.balanceTier };
  const update = vi.fn(async (_id: string, _args: Record<string, unknown>) => ({ current_period_end: 1_800_000_000 }));
  h.stripe.subscriptions = {
    retrieve: vi.fn(async () => ({
      status: "active",
      cancel_at_period_end: !!opts.cancelPending,
      items: { data: [{ id: "si_1", price: { id: opts.currentPrice } }] },
    })),
    update,
  };
  const { POST } = await import("@/app/api/stripe/subscription/route");
  const res = await POST(post("/api/stripe/subscription", opts.body));
  return { res, json: (await res.json()) as Record<string, unknown>, update };
}

describe("plan switch for existing subscribers", () => {
  it.each([
    ["starter", "price_test_starter"],
    ["pro", "price_test_pro"],
  ])("flag on: a %s subscriber who chooses the plan moves to the $99 price, prorated", async (tier, price) => {
    setup({ plan99: true });
    const { res, json, update } = await switchPlan({ balanceTier: tier, currentPrice: price, body: { tier: "premium" } });
    expect(res.status).toBe(200);
    expect(json).toEqual({ switched: true, tier: "premium" });
    expect(update).toHaveBeenCalledWith("sub_1", {
      items: [{ id: "si_1", price: P99 }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
    });
  });

  it("flag on: a $100 Premium subscriber is already on the plan and is not touched", async () => {
    setup({ plan99: true });
    const { res, json, update } = await switchPlan({ balanceTier: "premium", currentPrice: "price_test_premium", body: { tier: "premium" } });
    expect(res.status).toBe(400);
    expect(json.error).toBe("That is already your plan");
    expect(update).not.toHaveBeenCalled();
  });

  it("flag on: a $100 Premium subscriber undoing a cancellation keeps the $100 price", async () => {
    setup({ plan99: true });
    const { res, json, update } = await switchPlan({
      balanceTier: "premium", currentPrice: "price_test_premium", cancelPending: true, body: { tier: "premium" },
    });
    expect(res.status).toBe(200);
    expect(json).toEqual({ switched: true, tier: "premium" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: false });
  });

  it("flag on: a Starter subscriber undoing a cancellation keeps Starter at its price", async () => {
    setup({ plan99: true });
    const { res, update } = await switchPlan({
      balanceTier: "starter", currentPrice: "price_test_starter", cancelPending: true, body: { tier: "starter" },
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: false });
  });

  it.each([
    ["starter", "pro"],
    ["pro", "starter"],
    ["premium", "pro"],
  ])("flag on: %s cannot move to the retired %s plan", async (from, to) => {
    setup({ plan99: true });
    const { res, update } = await switchPlan({ balanceTier: from, currentPrice: `price_test_${from}`, body: { tier: to } });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("flag on, env var missing: an upgrade is refused (503) and the subscription is left alone", async () => {
    setup({ plan99: true, plan99Price: null });
    const { res, update } = await switchPlan({ balanceTier: "starter", currentPrice: "price_test_starter", body: { tier: "premium" } });
    expect(res.status).toBe(503);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([true, false])("cancel and resume work for a grandfathered subscriber with the flag %s", async (on) => {
    setup({ plan99: on });
    const c = await switchPlan({ balanceTier: "starter", currentPrice: "price_test_starter", body: { action: "cancel" } });
    expect(c.res.status).toBe(200);
    expect(c.json.canceled).toBe(true);
    expect(c.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    const r = await switchPlan({ balanceTier: "starter", currentPrice: "price_test_starter", cancelPending: true, body: { action: "resume" } });
    expect(r.json).toEqual({ resumed: true });
    expect(r.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: false });
  });

  it("flag off: switching between the three plans is exactly today's behavior", async () => {
    setup({ plan99: false });
    const { res, update } = await switchPlan({ balanceTier: "starter", currentPrice: "price_test_starter", body: { tier: "pro" } });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("sub_1", {
      items: [{ id: "si_1", price: "price_test_pro" }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
    });
  });

  it("after a rollback (flag off): someone who bought at $99 is not bumped to the $100 price by re-choosing Premium", async () => {
    setup({ plan99: false });
    const { res, update } = await switchPlan({
      balanceTier: "premium", currentPrice: P99, cancelPending: true, body: { tier: "premium" },
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: false });
  });
});

// ── webhook ─────────────────────────────────────────────────────────────────

async function webhook(event: Record<string, unknown>, subscriptionPrice = P99) {
  h.stripe.webhooks = { constructEvent: (body: string) => JSON.parse(body) };
  h.stripe.subscriptions = {
    retrieve: vi.fn(async () => ({
      status: "active",
      items: { data: [{ id: "si_1", price: { id: subscriptionPrice }, current_period_start: 1_790_000_000, current_period_end: 1_792_600_000 }] },
    })),
  };
  const { POST } = await import("@/app/api/stripe/webhook/route");
  const req = new NextRequest("https://www.d-scribe.app/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body: JSON.stringify({ id: `evt_${Math.random()}`, ...event }),
  });
  const res = await POST(req);
  const balanceWrites = h.calls.filter((c: Call) => c.table === "ink_balances");
  return { res, balanceWrites };
}

const subscriptionUpdated = (price: string) => ({
  type: "customer.subscription.updated",
  data: { object: { id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ price: { id: price } }] } } },
});
const renewalInvoice = {
  type: "invoice.payment_succeeded",
  data: { object: { id: "in_1", customer: "cus_1", billing_reason: "subscription_cycle", amount_paid: 9900 } },
};

describe("webhook", () => {
  it("flag on: a completed $99 checkout activates premium with 1,500 Ink", async () => {
    setup({ plan99: true });
    const { res, balanceWrites } = await webhook({
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", subscription: "sub_1", customer: "cus_1", metadata: { user_id: "user_1", tier: "premium" } } },
    });
    expect(res.status).toBe(200);
    expect(balanceWrites).toHaveLength(1);
    expect(balanceWrites[0]).toMatchObject({ op: "upsert", payload: { user_id: "user_1", tier: "premium", ink_balance: 1500, stripe_subscription_id: "sub_1" } });
    expect(h.partners.attributeCheckout).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])("a subscription on the $99 price syncs to premium / 1,500 Ink with the flag %s", async (on) => {
    setup({ plan99: on });
    h.rows.ink_balances = { user_id: "user_1" };
    const { res, balanceWrites } = await webhook(subscriptionUpdated(P99));
    expect(res.status).toBe(200);
    expect(balanceWrites[0]).toMatchObject({ op: "upsert", payload: { tier: "premium", ink_balance: 1500 } });
  });

  it.each([
    [true, "price_test_starter", "starter", 300],
    [true, "price_test_pro", "pro", 660],
    [true, "price_test_premium", "premium", 1500],
    [false, "price_test_starter", "starter", 300],
    [false, "price_test_pro", "pro", 660],
    [false, "price_test_premium", "premium", 1500],
  ])("flag %s: a subscription on %s stays %s with %i Ink", async (on, price, tier, ink) => {
    setup({ plan99: on });
    h.rows.ink_balances = { user_id: "user_1" };
    const { balanceWrites } = await webhook(subscriptionUpdated(price), price);
    expect(balanceWrites[0]).toMatchObject({ op: "upsert", payload: { tier, ink_balance: ink } });
  });

  it.each([
    [true, "starter", 300],
    [true, "pro", 660],
    [true, "premium", 1500],
    [false, "starter", 300],
    [false, "pro", 660],
    [false, "premium", 1500],
  ])("flag %s: a renewal for a %s account refills exactly %i Ink and nothing else", async (on, tier, ink) => {
    setup({ plan99: on });
    h.rows.ink_balances = { user_id: "user_1", tier };
    const { res, balanceWrites } = await webhook(renewalInvoice);
    expect(res.status).toBe(200);
    expect(balanceWrites).toHaveLength(1);
    expect(balanceWrites[0].op).toBe("update");
    expect(Object.keys(balanceWrites[0].payload ?? {}).sort()).toEqual(["ink_balance", "ink_period_start"]);
    expect(balanceWrites[0].payload).toMatchObject({ ink_balance: ink });
    expect(h.partners.recordInvoiceCommission).toHaveBeenCalledTimes(1);
  });

  it("both flags on: a $99 renewal still refills 1,500, never the v2 7,500", async () => {
    setup({ plan99: true, plansV2: true });
    h.rows.ink_balances = { user_id: "user_1", tier: "premium" };
    const { balanceWrites } = await webhook(renewalInvoice);
    expect(balanceWrites[0].payload).toMatchObject({ ink_balance: 1500 });
  });

  it("an unknown price changes nothing", async () => {
    setup({ plan99: true });
    h.rows.ink_balances = { user_id: "user_1" };
    const { res, balanceWrites } = await webhook(subscriptionUpdated("price_unknown"));
    expect(res.status).toBe(200);
    expect(balanceWrites).toHaveLength(0);
  });
});
