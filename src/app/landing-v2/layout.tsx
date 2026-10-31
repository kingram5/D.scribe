import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

// The homepage renders this same landing page (src/app/page.tsx imports it), so
// /landing-v2 is a duplicate of "/". Point its canonical at the homepage.
export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
};

export default function LandingV2Layout({ children }: { children: React.ReactNode }) {
  return children;
}
