import type { Metadata } from "next";
import LandingPage from "@/app/landing-v2/page";
import { LandingDataProvider } from "@/components/landing/LandingDataContext";
import { faqSchema as buildFaqSchema } from "@/components/landing/faq";
import { getLandingData } from "@/lib/landing-data";

// Server data for the landing page refreshes hourly (founder headshot presence,
// and from HeyCatch item 3 the live usage count).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "D.scribe — Turn Your Voice Into a Published Book with AI",
  description: "D.scribe transcribes your voice recordings and turns them into a fully structured manuscript. Coaches, pastors, and speakers publish their books in days — not years.",
  alternates: {
    canonical: "https://d-scribe.app",
  },
  openGraph: {
    title: "D.scribe — Turn Your Voice Into a Published Book with AI",
    description: "Upload any audio, set your structure, and watch AI write your manuscript chapter by chapter — in your voice.",
    url: "https://d-scribe.app",
    siteName: "D.scribe",
    type: "website",
  },
  // og:image / twitter:image come from ./opengraph-image.tsx and ./twitter-image.tsx (HeyCatch item 7).
  twitter: {
    card: "summary_large_image",
    title: "D.scribe — Turn Your Voice Into a Published Book with AI",
    description: "Upload any audio, set your structure, and watch AI write your manuscript chapter by chapter — in your voice.",
  },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "D.scribe",
  url: "https://d-scribe.app",
  description: "AI-powered voice-to-manuscript software for coaches, pastors, and speakers",
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "D.scribe — Turn Your Voice Into a Published Book with AI",
  url: "https://d-scribe.app",
  description: "Upload audio, transcribe, and generate your book manuscript with AI",
  isPartOf: { "@type": "WebSite", name: "D.scribe", url: "https://d-scribe.app" },
};

// FAQPage JSON-LD is built from the same list the page renders (HeyCatch item 8).
const faqSchema = buildFaqSchema();

export default async function Page() {
  const landingData = await getLandingData();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <LandingDataProvider value={landingData}>
        <LandingPage />
      </LandingDataProvider>
    </>
  );
}
