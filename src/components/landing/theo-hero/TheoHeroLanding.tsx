"use client";

import LandingPage from "@/app/landing-v2/page";
import { HeroOverrideProvider } from "@/components/landing/HeroOverride";
import TheoHero from "./TheoHero";

/** PREVIEW ONLY: the live landing page with the T.H.E.O hero swapped in. */
export default function TheoHeroLanding() {
  return (
    <HeroOverrideProvider hero={<TheoHero />}>
      <LandingPage />
    </HeroOverrideProvider>
  );
}
