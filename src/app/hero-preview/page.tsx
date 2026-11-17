import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { LandingDataProvider } from "@/components/landing/LandingDataContext";
import TheoHeroLanding from "@/components/landing/theo-hero/TheoHeroLanding";
import { isTheoEntranceVariant } from "@/components/landing/theo-hero/theo-hero-config";
import { getLandingData } from "@/lib/landing-data";
import { SITE_URL } from "@/lib/site";

// PREVIEW ONLY (branch feat/theo-hero-preview). The full landing page with the
// T.H.E.O hero swapped in, for side-by-side comparison with "/". Strip this
// route, its middleware PUBLIC_PATHS entry and HeroOverride before any merge.
//
// ?v=walk|door|chair picks an entrance clip; anything else = the plain hero.
// Reading searchParams makes the route dynamic, so the landing data (one
// aggregate count) is cached for an hour instead of re-queried per request.
const getPreviewLandingData = unstable_cache(getLandingData, ["hero-preview-landing-data"], { revalidate: 3600 });

export const metadata: Metadata = {
  title: "Hero preview",
  robots: { index: false, follow: false },
  alternates: { canonical: SITE_URL },
};

export default async function HeroPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { v } = await searchParams;
  const variant = isTheoEntranceVariant(v) ? v : undefined;
  const landingData = await getPreviewLandingData();
  return (
    <LandingDataProvider value={landingData}>
      <TheoHeroLanding variant={variant} />
    </LandingDataProvider>
  );
}
