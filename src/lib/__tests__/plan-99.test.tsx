/**
 * The $99 single plan (NEXT_PUBLIC_PLAN_99, Kyle 2026-11-19): the plan tables,
 * the price helpers, and every public price surface with the flag ON.
 *
 * The flag-OFF recording lives in plan-99-flag-off-baseline.test.tsx. The
 * routes (checkout, plan switch, webhook) are in plan-99-routes.test.ts.
 *
 * The flag-on fixture is a recording of what the single-plan surfaces say; it
 * only guards against drift. The assertions that prove the switch are the
 * explicit ones here: one paid offer at 99.00, no old price or plan name left
 * on a D.scribe-owned surface. Regenerate the fixture only on purpose:
 * UPDATE_PLAN_BASELINE=1 npx vitest run src/lib/__tests__/plan-99.test.tsx
 */
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/landing/og-card", () => ({
  OG_SIZE: { width: 1200, height: 630 },
  OG_CONTENT_TYPE: "image/png",
  renderOgCard: (args: unknown) => args,
}));

const FIXTURE = path.join(__dirname, "__fixtures__", "plan-99-flag-on.json");

const PRICE_ENV: Record<string, string> = {
  STRIPE_PRICE_STARTER: "price_test_starter",
  STRIPE_PRICE_PRO: "price_test_pro",
  STRIPE_PRICE_PREMIUM: "price_test_premium",
  STRIPE_PRICE_STARTER_LEGACY: "price_test_starter_legacy",
  STRIPE_PRICE_PRO_LEGACY: "price_test_pro_legacy",
  STRIPE_PRICE_PREMIUM_LEGACY: "price_test_premium_legacy",
  STRIPE_PRICE_VOICE_PACK: "price_test_voice_pack",
  STRIPE_PRICE_INK_PACK: "price_test_ink_pack",
};
const P99 = "price_test_plan_99";

function setEnv(opts: { plan99?: boolean; plansV2?: boolean; plan99Price?: string | null } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PLAN_99", opts.plan99 ? "true" : "");
  vi.stubEnv("NEXT_PUBLIC_PLANS_V2", opts.plansV2 ? "true" : "");
  for (const [k, v] of Object.entries(PRICE_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("STRIPE_PRICE_PLAN_99", opts.plan99Price === null ? "" : opts.plan99Price ?? P99);
}

/** Every public price surface, as text. Same set the flag-off recording covers. */
async function surfaces(): Promise<Record<string, string>> {
  const { llmsTxt, llmsFullTxt } = await import("@/lib/llms");
  const sd = await import("@/lib/structured-data");
  const faq = await import("@/components/landing/faq");
  const vs = await import("@/lib/vs-pages");
  const about = await import("@/lib/about-content");
  const pricing = await import("@/app/pricing/page");
  const og = await import("@/app/pricing/opengraph-image");
  const { default: InkUpgradeModal } = await import("@/components/ui/InkUpgradeModal");
  const PricingPage = pricing.default;
  return {
    llmsTxt: llmsTxt(),
    llmsFullTxt: llmsFullTxt(),
    planOffers: JSON.stringify(sd.planOffers()),
    softwareApplicationNode: JSON.stringify(sd.softwareApplicationNode()),
    faq: JSON.stringify(faq.FAQ_ITEMS),
    vs: JSON.stringify({ D_SCRIBE_PRICING: vs.D_SCRIBE_PRICING, VS_PAGES: vs.VS_PAGES }),
    about: JSON.stringify({
      DIFFERENTIATORS: about.DIFFERENTIATORS,
      KEY_FACTS: about.KEY_FACTS,
      HOW_IT_WORKS: about.HOW_IT_WORKS,
      WHO_USES: about.WHO_USES,
    }),
    pricingMetadata: JSON.stringify(pricing.metadata),
    pricingHtml: renderToStaticMarkup(<PricingPage />),
    ogImage: JSON.stringify({ alt: og.alt, card: og.default() }),
    modalInk: renderToStaticMarkup(<InkUpgradeModal onClose={() => {}} reason="ink" />),
    modalTts: renderToStaticMarkup(<InkUpgradeModal onClose={() => {}} reason="tts" />),
    modalTtsLocked: renderToStaticMarkup(<InkUpgradeModal onClose={() => {}} reason="tts_locked" />),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/stripe");
  vi.doUnmock("@/lib/supabase");
  vi.resetModules();
});

describe("plan tables", () => {
  it("flag off: three plans at today's prices, nothing about plan 99 leaks in", async () => {
    setEnv({ plan99: false });
    const t = await import("@/lib/tiers");
    expect(t.plan99()).toBe(false);
    expect(t.planSet()).toBe("v1");
    expect([t.PLANS.starter.price, t.PLANS.pro.price, t.PLANS.premium.price]).toEqual([25, 50, 100]);
    expect(t.SELLABLE_TIERS).toEqual(["starter", "pro", "premium"]);
    expect(t.VOICE_PLANS).toBe("Pro and Premium");
    const { TIER_INK } = await import("@/lib/stripe");
    expect(TIER_INK).toEqual({ starter: 300, pro: 660, premium: 1500 });
  });

  it("flag on: one sellable plan, $99, 1,500 Ink, billed on the premium tier", async () => {
    setEnv({ plan99: true });
    const t = await import("@/lib/tiers");
    expect(t.plan99()).toBe(true);
    expect(t.planSet()).toBe("plan99");
    expect(t.SELLABLE_TIERS).toEqual(["premium"]);
    expect(t.PLAN_99).toMatchObject({ tier: "premium", price: 99, ink: 1500 });
    expect(t.PLANS.premium).toMatchObject({ price: 99, ink: 1500 });
    expect(t.VOICE_PLANS).toBe("the Premium plan");
  });

  it("flag on: every tier keeps its v1 allotment, so grandfathered renewals refill what they always did", async () => {
    setEnv({ plan99: true });
    const t = await import("@/lib/tiers");
    expect(t.INK_LIMITS).toEqual({ free: 10, starter: 300, pro: 660, premium: 1500 });
    const { TIER_INK } = await import("@/lib/stripe");
    expect(TIER_INK).toEqual({ starter: 300, pro: 660, premium: 1500 });
    const { renewalRefillPayload } = await import("@/lib/topups");
    expect(renewalRefillPayload("starter").ink_balance).toBe(300);
    expect(renewalRefillPayload("pro").ink_balance).toBe(660);
    expect(renewalRefillPayload("premium").ink_balance).toBe(1500);
  });

  it("both flags on: plan 99 wins (v2 would price Premium at $200 and hand out 7,500 Ink)", async () => {
    setEnv({ plan99: true, plansV2: true });
    const t = await import("@/lib/tiers");
    expect(t.planSet()).toBe("plan99");
    expect(t.PLANS.premium).toMatchObject({ price: 99, ink: 1500 });
    expect(t.INK_LIMITS).toEqual({ free: 10, starter: 300, pro: 660, premium: 1500 });
    const { TIER_INK } = await import("@/lib/stripe");
    expect(TIER_INK.premium).toBe(1500);
    const both = await surfaces();

    setEnv({ plan99: true, plansV2: false });
    const only99 = await surfaces();
    expect(both).toEqual(only99);
  });

  it("the plan's 1,500 Ink is the premium allotment already in SQL (migration 012), so no migration", async () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/012_ink_reset_and_tts_gate.sql"), "utf8");
    expect(sql).toMatch(/when 'premium' then return 1500;/);
    expect(sql).toMatch(/when 'starter' then return 300;/);
    expect(sql).toMatch(/when 'pro'\s+then return 660;/);
  });
});

describe("planPriceFor: which Stripe price a sale uses", () => {
  it("flag off: today's price for each tier, the plan-99 price is never used", async () => {
    setEnv({ plan99: false });
    const { planPriceFor } = await import("@/lib/stripe");
    expect(planPriceFor("starter")).toEqual({ ok: true, price: "price_test_starter" });
    expect(planPriceFor("pro")).toEqual({ ok: true, price: "price_test_pro" });
    expect(planPriceFor("premium")).toEqual({ ok: true, price: "price_test_premium" });
  });

  it("flag on: the env price id, and only for the one plan", async () => {
    setEnv({ plan99: true });
    const { planPriceFor } = await import("@/lib/stripe");
    expect(planPriceFor("premium")).toEqual({ ok: true, price: P99 });
    expect(planPriceFor("starter")).toMatchObject({ ok: false, status: 400 });
    expect(planPriceFor("pro")).toMatchObject({ ok: false, status: 400 });
  });

  it("flag on, env var missing: refuses (503), never falls back to the $100 Premium price", async () => {
    setEnv({ plan99: true, plan99Price: null });
    const { planPriceFor, plan99PriceId } = await import("@/lib/stripe");
    expect(plan99PriceId()).toBeNull();
    const r = planPriceFor("premium");
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(JSON.stringify(r)).not.toContain("price_test_premium");
  });

  it.each([
    ["the $100 Premium price", "price_test_premium"],
    ["a legacy price", "price_test_premium_legacy"],
    ["the Starter price", "price_test_starter"],
    ["a refill price", "price_test_ink_pack"],
  ])("flag on, env var set to %s: refuses (503)", async (_label, id) => {
    setEnv({ plan99: true, plan99Price: id });
    const { planPriceFor, plan99PriceId } = await import("@/lib/stripe");
    expect(plan99PriceId()).toBeNull();
    expect(planPriceFor("premium")).toMatchObject({ ok: false, status: 503 });
  });
});

describe("tierForPrice: what a subscription's price is worth", () => {
  it.each([true, false])("the $99 price maps to premium with the flag %s (rollback keeps $99 subscribers whole)", async (on) => {
    setEnv({ plan99: on });
    const { tierForPrice, TIER_INK } = await import("@/lib/stripe");
    expect(tierForPrice(P99)).toBe("premium");
    expect(TIER_INK[tierForPrice(P99)!]).toBe(1500);
  });

  it.each([true, false])("old and legacy prices keep their own tiers with the flag %s", async (on) => {
    setEnv({ plan99: on });
    const { tierForPrice } = await import("@/lib/stripe");
    expect(tierForPrice("price_test_starter")).toBe("starter");
    expect(tierForPrice("price_test_pro")).toBe("pro");
    expect(tierForPrice("price_test_premium")).toBe("premium");
    expect(tierForPrice("price_test_starter_legacy")).toBe("starter");
    expect(tierForPrice("price_test_pro_legacy")).toBe("pro");
    expect(tierForPrice("price_test_premium_legacy")).toBe("premium");
    expect(tierForPrice("price_unknown")).toBeUndefined();
  });

  it("a mis-set env var can never turn a Starter subscription into Premium", async () => {
    setEnv({ plan99: true, plan99Price: "price_test_starter" });
    const { tierForPrice } = await import("@/lib/stripe");
    expect(tierForPrice("price_test_starter")).toBe("starter");
  });

  it("no env var: unknown stays unknown", async () => {
    setEnv({ plan99: true, plan99Price: null });
    const { tierForPrice } = await import("@/lib/stripe");
    expect(tierForPrice(P99)).toBeUndefined();
    expect(tierForPrice("")).toBeUndefined();
  });
});

describe("flag on: public price surfaces show one plan at $99 with 1,500 Ink", () => {
  it("structured data: exactly one paid offer, 99.00 USD a month", async () => {
    setEnv({ plan99: true });
    const sd = await import("@/lib/structured-data");
    const offers = sd.planOffers() as { name: string; price: string; description: string; priceSpecification?: { price: string; unitCode: string } }[];
    expect(offers.map((o) => o.price)).toEqual(["0.00", "99.00"]);
    expect(offers[1].name).toBe("Premium plan");
    expect(offers[1].description).toContain("1,500 Ink per month");
    expect(offers[1].priceSpecification).toMatchObject({ price: "99.00", unitCode: "MON" });
    const app = sd.softwareApplicationNode() as { offers: unknown[] };
    expect(app.offers).toHaveLength(2);
  });

  it("every surface names the price and the Ink, and no old price or old plan name survives", async () => {
    setEnv({ plan99: true });
    const s = await surfaces();
    const vs = await import("@/lib/vs-pages");

    // The $99 and the 1,500 are actually there.
    for (const key of ["llmsTxt", "llmsFullTxt", "about", "pricingMetadata", "pricingHtml", "ogImage", "modalInk", "modalTts", "modalTtsLocked", "vs"]) {
      expect(s[key], key).toMatch(/\$99\b/);
    }
    for (const key of ["llmsTxt", "llmsFullTxt", "faq", "about", "pricingMetadata", "pricingHtml", "modalInk", "modalTtsLocked", "vs", "planOffers"]) {
      expect(s[key], key).toMatch(/1,500/);
    }
    // One card on the pricing page, one plan in the modal.
    expect(s.pricingHtml.match(/\/mo<\/span>/g)).toHaveLength(1);
    expect(s.modalTtsLocked.match(/\/mo<\/span>/g)).toHaveLength(1);

    // Old prices ($50,000 is the ghostwriter figure, $20 the refill: both stay).
    const OLD_PRICE = /\$(25|50|100|200)(?![\d,.])/;
    // Old plan names. "Premium" is the single plan's name, so it is allowed.
    const OLD_PLAN = /\bStarter\b|\bPro\b(?!fessional)|plans start at|[Cc]ompare (all )?plans|\b(three|3) plans\b/;

    // D.scribe's own words: everything except the competitor columns of /vs.
    const beforeComparisons = s.llmsFullTxt.split("## Comparisons")[0];
    const own: Record<string, string> = {
      llmsTxt: s.llmsTxt,
      llmsFullBeforeComparisons: beforeComparisons,
      planOffers: s.planOffers,
      softwareApplicationNode: s.softwareApplicationNode,
      faq: s.faq,
      about: s.about,
      pricingMetadata: s.pricingMetadata,
      pricingHtml: s.pricingHtml,
      ogImage: s.ogImage,
      modalInk: s.modalInk,
      modalTts: s.modalTts,
      modalTtsLocked: s.modalTtsLocked,
      vsPricingLine: vs.D_SCRIBE_PRICING,
      vsOurColumn: vs.VS_PAGES.flatMap((p) => p.rows.map((r) => r.ds)).join("\n"),
      vsOurPitch: vs.VS_PAGES.flatMap((p) => [p.intro, p.verdict, p.pickUs]).join("\n"),
    };
    for (const [key, text] of Object.entries(own)) {
      expect(text, `${key} old price`).not.toMatch(OLD_PRICE);
      expect(text, `${key} old plan name`).not.toMatch(OLD_PLAN);
    }
    // /vs FAQ answers mention competitors' "Pro" tiers; ours must still be gone.
    const vsFaqs = vs.VS_PAGES.flatMap((p) => p.faqs.map((f) => f.a)).join("\n");
    expect(vsFaqs).not.toMatch(/\bStarter\b|Pro and Premium|\$(25|50|100)\/month/);
    expect(vsFaqs).toMatch(/\$99\/month/);
  });

  it("matches the flag-on recording", async () => {
    setEnv({ plan99: true });
    const current = await surfaces();
    if (process.env.UPDATE_PLAN_BASELINE === "1") {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, JSON.stringify(current, null, 2) + "\n");
    }
    const recorded = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as Record<string, string>;
    expect(Object.keys(current).sort()).toEqual(Object.keys(recorded).sort());
    for (const key of Object.keys(recorded)) expect(current[key], key).toBe(recorded[key]);
  });
});

describe("grandfathered subscribers on the single-plan pricing page", () => {
  it("Starter and Pro are told their plan and price stay, and what switching costs", async () => {
    setEnv({ plan99: true });
    const { plan99NoteText } = await import("@/components/pricing/Plan99Note");
    for (const [tier, name] of [["starter", "Starter"], ["pro", "Pro"]] as const) {
      const text = plan99NoteText(tier)!;
      expect(text).toContain(`You are on the ${name} plan`);
      expect(text).toContain("at the price you pay today");
      expect(text).toContain("$99/month");
    }
  });

  it("a Premium subscriber is never told they pay $99 (they may pay $100)", async () => {
    setEnv({ plan99: true });
    const { plan99NoteText } = await import("@/components/pricing/Plan99Note");
    const text = plan99NoteText("premium")!;
    expect(text).toContain("Your price stays what you signed up at");
    expect(text).not.toMatch(/\$\d/);
  });

  it("free and signed-out visitors get no note; the button offers the one plan", async () => {
    setEnv({ plan99: true });
    const { plan99NoteText } = await import("@/components/pricing/Plan99Note");
    const { planLabel } = await import("@/lib/plan-label");
    expect(plan99NoteText("free")).toBeNull();
    expect(planLabel("premium", "free", true)).toBe("Get Started");
    expect(planLabel("premium", "starter", true)).toBe("Upgrade to Premium");
    expect(planLabel("premium", "pro", true)).toBe("Upgrade to Premium");
    expect(planLabel("premium", "premium", true)).toBe("Your current plan");
  });
});

describe("creator codes on the $99 price", () => {
  it("a first-time creator coupon covers the product the $99 price sits on", async () => {
    setEnv({ plan99: true });
    const created: { applies_to?: { products: string[] } }[] = [];
    const productOf: Record<string, string> = {
      price_test_starter: "prod_starter",
      price_test_pro: "prod_pro",
      price_test_premium: "prod_premium",
      [P99]: "prod_premium",
    };
    vi.doMock("@/lib/supabase", () => ({ createServerClient: () => ({}) }));
    vi.doMock("@/lib/stripe", async () => {
      const actual = await vi.importActual<typeof import("@/lib/stripe")>("@/lib/stripe");
      return {
        ...actual,
        stripe: {
          coupons: {
            retrieve: async () => { throw Object.assign(new Error("No such coupon"), { code: "resource_missing" }); },
            create: async (args: { applies_to?: { products: string[] } }) => { created.push(args); return { id: "coupon_1" }; },
          },
          prices: { retrieve: async (id: string) => ({ product: productOf[id] }) },
        },
      };
    });
    const { ensurePartnerCoupon } = await import("@/lib/partners");
    await ensurePartnerCoupon();
    expect(created).toHaveLength(1);
    expect(created[0].applies_to?.products.sort()).toEqual(["prod_premium", "prod_pro", "prod_starter"]);
  });

  it("commission is a share of what was actually paid, so $99 needs no table change", async () => {
    const { commissionCents, PARTNER_COMMISSION_RATE, PARTNER_DISCOUNT_PERCENT } = await import("@/lib/partner-rules");
    const firstInvoice = Math.round(9900 * (1 - PARTNER_DISCOUNT_PERCENT / 100));
    expect(commissionCents(firstInvoice)).toBe(Math.floor(firstInvoice * PARTNER_COMMISSION_RATE));
    expect(commissionCents(9900)).toBe(Math.floor(9900 * PARTNER_COMMISSION_RATE));
  });
});
