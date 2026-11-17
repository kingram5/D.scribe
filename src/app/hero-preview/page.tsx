import type { Metadata } from "next";
import { LandingDataProvider } from "@/components/landing/LandingDataContext";
import TheoHeroLanding from "@/components/landing/theo-hero/TheoHeroLanding";
import { getLandingData } from "@/lib/landing-data";
import { SITE_URL } from "@/lib/site";

// PREVIEW ONLY (branch feat/theo-hero-preview). The full landing page with the
// T.H.E.O hero swapped in, for side-by-side comparison with "/". Strip this
// route, its middleware PUBLIC_PATHS entry and HeroOverride before any merge.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Hero preview",
  robots: { index: false, follow: false },
  alternates: { canonical: SITE_URL },
};

export default async function HeroPreviewPage() {
  const landingData = await getLandingData();
  return (
    <LandingDataProvider value={landingData}>
      <TheoHeroLanding />
    </LandingDataProvider>
  );
}
