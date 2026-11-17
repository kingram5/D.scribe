"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * PREVIEW ONLY (branch feat/theo-hero-preview). Lets /hero-preview render the
 * full landing page with a different hero. The landing page is a client route
 * component and Next type-checks page props, so a context is the only way in
 * (same reason as LandingDataContext). With no provider, "/" and /landing-v2
 * render the live hero untouched.
 */
const HeroOverrideContext = createContext<ReactNode | null>(null);

export function HeroOverrideProvider({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return <HeroOverrideContext.Provider value={hero}>{children}</HeroOverrideContext.Provider>;
}

export function useHeroOverride() {
  return useContext(HeroOverrideContext);
}
