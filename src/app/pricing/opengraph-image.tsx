import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/components/landing/og-card";
import { PLANS } from "@/lib/tiers";

// Pricing og:image (HeyCatch item 7). Served at /pricing/opengraph-image.
export const alt = `D.scribe Pricing — AI Book Writing Plans Starting at $${PLANS.starter.price}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    eyebrow: "Pricing",
    title: `Plans from $${PLANS.starter.price} a month.`,
    subtitle: "Traditional ghostwriters charge $30,000 to $80,000 and take 12 to 24 months. D.scribe delivers your first draft in under an hour.",
  });
}
