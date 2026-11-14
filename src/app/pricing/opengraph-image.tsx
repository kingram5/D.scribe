import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/components/landing/og-card";
import { PLANS } from "@/lib/tiers";
import { GHOSTWRITER_COST } from "@/lib/ghostwriter-cost";

// Pricing og:image (HeyCatch item 7). Served at /pricing/opengraph-image.
export const alt = `D.scribe Pricing — AI Book Writing Plans Starting at $${PLANS.starter.price}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    eyebrow: "Pricing",
    title: `Plans from $${PLANS.starter.price} a month.`,
    // Same sourced figure as the page copy (src/lib/ghostwriter-cost.ts).
    subtitle: `A nonfiction ghostwriter typically costs ${GHOSTWRITER_COST.range} (${GHOSTWRITER_COST.source}). D.scribe delivers your first draft in under an hour.`,
  });
}
