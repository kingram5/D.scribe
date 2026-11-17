"use client";

import LandingPage from "@/app/landing-v2/page";
import { HeroOverrideProvider } from "@/components/landing/HeroOverride";
import TheoHero from "./TheoHero";
import type { TheoEntranceVariant } from "./theo-hero-config";

/**
 * PREVIEW ONLY: the live landing page with the T.H.E.O hero swapped in.
 * `variant` = one of the entrance clips (?v=walk|door|chair); none = the plain hero.
 */
export default function TheoHeroLanding({ variant }: { variant?: TheoEntranceVariant }) {
  return (
    <HeroOverrideProvider hero={<TheoHero key={variant ?? "plain"} variant={variant} />}>
      <LandingPage />
    </HeroOverrideProvider>
  );
}
