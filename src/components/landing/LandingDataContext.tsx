"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Server-fetched facts the landing page needs (founder headshot, live usage
 * count). The landing page itself is a client route component, and Next.js
 * type-checks page components against PageProps, so custom props are not an
 * option. The server page wraps it in this provider instead; the /landing-v2
 * route renders without the provider and gets the empty defaults.
 */
export type LandingData = {
  /** Public URL of the founder headshot, or null while public/founder-kyle.jpg is missing. */
  founderHeadshot: string | null;
  /**
   * Live count of books generated (projects with at least one generated
   * chapter), read from Supabase at render time. null when the query failed or
   * the environment has no Supabase credentials (local builds).
   */
  booksGenerated: number | null;
};

export const EMPTY_LANDING_DATA: LandingData = {
  founderHeadshot: null,
  booksGenerated: null,
};

const LandingDataContext = createContext<LandingData>(EMPTY_LANDING_DATA);

export function LandingDataProvider({ value, children }: { value: LandingData; children: ReactNode }) {
  return <LandingDataContext.Provider value={value}>{children}</LandingDataContext.Provider>;
}

export function useLandingData(): LandingData {
  return useContext(LandingDataContext);
}
