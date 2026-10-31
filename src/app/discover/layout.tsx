import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

// /discover is a client page (it fetches /api/discover in the browser), so its
// metadata lives here. Until 2026-10-30 it inherited the homepage title and
// description, and crawlers saw only an empty shell (no public books yet), so it
// is noindex for now. Drop the noindex once the book list is server-rendered and
// has real books on it.
export const metadata: Metadata = {
  title: "Discover Books Written with D.scribe",
  description: "Books written by real people with D.scribe: coaches, pastors and speakers who turned their talks into a manuscript.",
  alternates: { canonical: `${SITE_URL}/discover` },
  robots: { index: false, follow: true },
};

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
