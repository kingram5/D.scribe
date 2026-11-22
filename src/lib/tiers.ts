// Tier display metadata, prices and monthly Ink allotments, shared by the
// pricing page, the upgrade modal, the usage widgets and the Stripe webhook so
// the numbers can't drift apart.
//
// Three plan sets. v1 is live. v2 is the Publisher-Ready pricing (Kyle
// 2026-09-27, option #3): prices doubled, each plan sized to whole
// Publisher-Ready books at the unchanged meter (~1,200 Ink per book), plus
// ~300 Ink of headroom per book for the month's Theo interviews and analysis
// (Kyle ruled 1,500 / 3,000 / 7,500 on 9/27 after the review found 1,200 left
// Starter unable to finish its one book).
// v2 turns on with NEXT_PUBLIC_PLANS_V2=true, which must flip on the same day
// as migration 030 (SQL allotments) and the Stripe price swap. Until then this
// branch can merge without changing a single price anyone sees or pays.
//
// Plan 99 (Kyle 2026-11-19, "Let's keep it at $99"): ONE plan for new
// sign-ups, $99 a month, 1,500 Ink (one Publisher-Ready book a month). It is
// billed on the existing `premium` tier, whose allotment is already 1,500 Ink
// in both this file (v1) and SQL (tier_ink_allotment, migration 012), so no
// migration and no new tier id. Turns on with NEXT_PUBLIC_PLAN_99=true.
//
// THE RULE that keeps current subscribers on their old price and allotment:
// the plan-99 flag only changes what is OFFERED (cards, copy, which price
// checkout uses). Allotments stay v1 for every tier (starter 300, pro 660,
// premium 1,500), and the webhook refills by the tier stored on the account,
// never by the flag. If NEXT_PUBLIC_PLANS_V2 is also on, plan 99 wins: v2's
// allotments would hand $99 subscribers 7,500 Ink.

export const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

export interface PlanDef {
  price: number;
  ink: number;
  /** Plain-English capacity line for cards and structured data. */
  books: string;
}

export type PaidTier = "starter" | "pro" | "premium";

const PLANS_V1: Record<PaidTier, PlanDef> = {
  starter: { price: 25, ink: 300, books: "about 1.5 books" },
  pro: { price: 50, ink: 660, books: "~3 books" },
  premium: { price: 100, ink: 1500, books: "~7 books" },
};

const PLANS_V2: Record<PaidTier, PlanDef> = {
  starter: { price: 50, ink: 1500, books: "1 Publisher-Ready book" },
  pro: { price: 100, ink: 3000, books: "2 Publisher-Ready books" },
  premium: { price: 200, ink: 7500, books: "5 Publisher-Ready books" },
};

/** Ink for one Publisher-Ready book at meter v2 (~$11.75 vendor x 102). Display only. */
export const INK_PER_PUBLISHER_READY_BOOK = 1200;

/** The tier the $99 plan bills on. Its allotment (1,500) is what the plan sells. */
export const PLAN_99_TIER = "premium" as const;

/** The one plan new sign-ups see when NEXT_PUBLIC_PLAN_99 is on. */
export const PLAN_99: PlanDef & { tier: typeof PLAN_99_TIER; name: string; voiceMinutes: string; voiceChars: string } = {
  tier: PLAN_99_TIER,
  // Display name. Kept as the tier's own label so meters, the partner comp
  // ("free Premium account") and the legal pages stay consistent. One place
  // to change if Kyle picks another name.
  name: TIER_LABELS[PLAN_99_TIER],
  price: 99,
  ink: 1500,
  books: "1 Publisher-Ready book",
  // The premium tier's existing voice allotment (tts.ts, migration 012). Not a
  // new feature: it is what the tier the plan bills on has always carried.
  voiceMinutes: "about 80 minutes",
  voiceChars: "60,000 voice characters",
};

const PLANS_99: Record<PaidTier, PlanDef> = {
  // Grandfathered: no longer sold, still refilled at their v1 allotment.
  starter: PLANS_V1.starter,
  pro: PLANS_V1.pro,
  premium: { price: PLAN_99.price, ink: PLAN_99.ink, books: PLAN_99.books },
};

export function plansV2(): boolean {
  return process.env.NEXT_PUBLIC_PLANS_V2 === "true";
}

/** NEXT_PUBLIC_PLAN_99=true: one $99 plan for new sign-ups. Wins over v2. */
export function plan99(): boolean {
  return process.env.NEXT_PUBLIC_PLAN_99 === "true";
}

export type PlanSet = "plan99" | "v2" | "v1";

/** Which plan set is live. Plan 99 wins if both flags are on. */
export function planSet(): PlanSet {
  if (plan99()) return "plan99";
  return plansV2() ? "v2" : "v1";
}

const SETS: Record<PlanSet, Record<PaidTier, PlanDef>> = { plan99: PLANS_99, v2: PLANS_V2, v1: PLANS_V1 };

export const PLANS: Record<PaidTier, PlanDef> = SETS[planSet()];

/** Tiers a new customer can buy, or switch to, right now. */
export const SELLABLE_TIERS: readonly PaidTier[] = plan99() ? [PLAN_99_TIER] : ["starter", "pro", "premium"];

/**
 * Which plans have T.H.E.O reading aloud, for copy shown to people who do not
 * have it yet. Plan 99 sells one plan, so the old wording would name a plan
 * nobody can buy.
 */
export const VOICE_PLANS: string = plan99() ? `the ${PLAN_99.name} plan` : "Pro and Premium";

export const INK_LIMITS: Record<string, number> = {
  free: 10,
  starter: PLANS.starter.ink,
  pro: PLANS.pro.ink,
  premium: PLANS.premium.ink,
};

export const TIER_COLORS: Record<string, string> = {
  free: "#7A7358",
  starter: "#5B7FA6",
  pro: "#C17A47",
  premium: "#9B6BB0",
};
