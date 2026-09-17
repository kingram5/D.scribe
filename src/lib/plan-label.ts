// Wording for the buttons on /pricing, which is also where "Manage Plan" lands.
// Kept out of the component so it can be tested without a DOM.

export type Tier = "starter" | "pro" | "premium";

const ORDER: Record<string, number> = { free: 0, starter: 1, pro: 2, premium: 3 };

const title = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function planLabel(cardTier: Tier, currentTier: string, loaded: boolean): string {
  if (!loaded || currentTier === "free") return "Get Started";
  if (currentTier === cardTier) return "Your current plan";
  return (ORDER[cardTier] ?? 0) > (ORDER[currentTier] ?? 0)
    ? `Upgrade to ${title(cardTier)}`
    : `Switch to ${title(cardTier)}`;
}
