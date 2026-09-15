// Server-only data for the public landing page (/). Fetched in src/app/page.tsx
// and handed to the client landing component through LandingDataProvider.

import { FOUNDER } from "@/lib/founder";
import type { LandingData } from "@/components/landing/LandingDataContext";

export async function getLandingData(): Promise<LandingData> {
  return {
    founderHeadshot: FOUNDER.headshot,
  };
}
