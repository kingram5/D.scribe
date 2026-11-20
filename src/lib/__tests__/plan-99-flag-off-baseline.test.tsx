/**
 * Byte-for-byte guard for the $99 single-plan switch (feat/plan-99, Kyle
 * 2026-11-19). With NEXT_PUBLIC_PLAN_99 off, every price surface must render
 * exactly what it rendered before the switch was built: the pricing page
 * markup and metadata, the OG card text, the upgrade modal, JSON-LD offers,
 * llms.txt / llms-full.txt, the FAQ, the /vs data, the /about facts, and the
 * plan / allotment / price tables.
 *
 * The fixture was generated on the untouched tree (origin/master 203d0dd)
 * BEFORE any plan-99 code existed, and committed on its own, so this test is
 * a recording of the old behavior rather than a description of the new one.
 * It covers both live plan sets: v1 (today) and v2 (NEXT_PUBLIC_PLANS_V2).
 *
 * Regenerate only on purpose: UPDATE_PLAN_BASELINE=1 npx vitest run <this file>
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

const FIXTURE = path.join(__dirname, "__fixtures__", "plan-flag-off-baseline.json");

const PRICE_ENV = {
  STRIPE_PRICE_STARTER: "price_test_starter",
  STRIPE_PRICE_PRO: "price_test_pro",
  STRIPE_PRICE_PREMIUM: "price_test_premium",
  STRIPE_PRICE_STARTER_LEGACY: "price_test_starter_legacy",
  STRIPE_PRICE_PRO_LEGACY: "price_test_pro_legacy",
  STRIPE_PRICE_PREMIUM_LEGACY: "price_test_premium_legacy",
};

async function snapshot(plansV2: boolean): Promise<Record<string, string>> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PLAN_99", "");
  vi.stubEnv("NEXT_PUBLIC_PLANS_V2", plansV2 ? "true" : "");
  for (const [k, v] of Object.entries(PRICE_ENV)) vi.stubEnv(k, v);

  const tiers = await import("@/lib/tiers");
  const stripeLib = await import("@/lib/stripe");
  const { llmsTxt, llmsFullTxt } = await import("@/lib/llms");
  const sd = await import("@/lib/structured-data");
  const faq = await import("@/components/landing/faq");
  const vs = await import("@/lib/vs-pages");
  const about = await import("@/lib/about-content");
  const pricing = await import("@/app/pricing/page");
  const og = await import("@/app/pricing/opengraph-image");
  const { default: InkUpgradeModal } = await import("@/components/ui/InkUpgradeModal");
  const PricingPage = pricing.default;

  const priceIds = [...Object.values(PRICE_ENV), "price_unknown"];
  return {
    tiers: JSON.stringify({ PLANS: tiers.PLANS, INK_LIMITS: tiers.INK_LIMITS, TIER_LABELS: tiers.TIER_LABELS }),
    stripe: JSON.stringify({
      STRIPE_PRICES: stripeLib.STRIPE_PRICES,
      TIER_INK: stripeLib.TIER_INK,
      tierForPrice: priceIds.map((p) => [p, stripeLib.tierForPrice(p) ?? null]),
    }),
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
  vi.resetModules();
});

describe("NEXT_PUBLIC_PLAN_99 off = every price surface unchanged", () => {
  it("matches the pre-switch recording for plans v1 and v2", async () => {
    const current = { v1: await snapshot(false), v2: await snapshot(true) };
    if (process.env.UPDATE_PLAN_BASELINE === "1") {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, JSON.stringify(current, null, 2) + "\n");
    }
    const recorded = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as typeof current;
    for (const set of ["v1", "v2"] as const) {
      expect(Object.keys(current[set]).sort()).toEqual(Object.keys(recorded[set]).sort());
      for (const key of Object.keys(recorded[set])) {
        expect(current[set][key], `${set}.${key}`).toBe(recorded[set][key]);
      }
    }
  });
});
