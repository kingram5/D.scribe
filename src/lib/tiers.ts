// Tier display metadata, prices and monthly Ink allotments, shared by the
// pricing page, the upgrade modal, the usage widgets and the Stripe webhook so
// the numbers can't drift apart.
//
// Two plan sets. v1 is live. v2 is the Publisher-Ready pricing (Kyle
// 2026-09-27, option #3): prices doubled, each plan sized to whole
// Publisher-Ready books at the unchanged meter (~1,200 Ink per book).
// v2 turns on with NEXT_PUBLIC_PLANS_V2=true, which must flip on the same day
// as migration 030 (SQL allotments) and the Stripe price swap. Until then this
// branch can merge without changing a single price anyone sees or pays.

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

const PLANS_V1: Record<"starter" | "pro" | "premium", PlanDef> = {
  starter: { price: 25, ink: 300, books: "about 1.5 books" },
  pro: { price: 50, ink: 660, books: "~3 books" },
  premium: { price: 100, ink: 1500, books: "~7 books" },
};

const PLANS_V2: Record<"starter" | "pro" | "premium", PlanDef> = {
  starter: { price: 50, ink: 1200, books: "1 Publisher-Ready book" },
  pro: { price: 100, ink: 2400, books: "2 Publisher-Ready books" },
  premium: { price: 200, ink: 6000, books: "5 Publisher-Ready books" },
};

/** Ink for one Publisher-Ready book at meter v2 (~$11.75 vendor x 102). Display only. */
export const INK_PER_PUBLISHER_READY_BOOK = 1200;

export function plansV2(): boolean {
  return process.env.NEXT_PUBLIC_PLANS_V2 === "true";
}

export const PLANS: Record<"starter" | "pro" | "premium", PlanDef> = plansV2() ? PLANS_V2 : PLANS_V1;

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
