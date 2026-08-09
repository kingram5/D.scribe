// Tier display metadata + monthly Ink allotments, shared by the usage widget
// and the app-chrome balance meter so the numbers can't drift apart.
export const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

export const INK_LIMITS: Record<string, number> = {
  free: 10,
  starter: 300,
  pro: 660,
  premium: 1500,
};

export const TIER_COLORS: Record<string, string> = {
  free: "#7A7358",
  starter: "#5B7FA6",
  pro: "#C17A47",
  premium: "#9B6BB0",
};
