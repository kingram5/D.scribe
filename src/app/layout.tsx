import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter, Kalam, Manrope, Lora, Playfair_Display, Cormorant_Garamond } from "next/font/google";
import { MarketingPixels } from "@/components/analytics/MarketingPixels";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { VercelAnalytics } from "@/components/analytics/VercelAnalytics";
import { ReferralBanner } from "@/components/partners/ReferralBanner";
import { FirstTouchCapture } from "@/components/attribution/FirstTouchCapture";
import { SITE_URL } from "@/lib/site";
import { jsonLd, siteGraph } from "@/lib/structured-data";
import "./globals.css";

// 2026-11-14 mobile speed pass: Geist is only the third fallback in the body
// stack (Manrope, Inter, Geist), so it practically never paints. It stays
// declared but no longer preloads.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

// preload: false on the decorative/rarely-painted faces — next/font preloads
// every face by default, and 11 of 16 declared families never paint on the
// homepage. Fonts block text rendering; ~344 KB of them stood between a
// mobile visitor and readable words. The face still loads on demand wherever
// it is actually used.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const kalam = Kalam({
  variable: "--font-kalam",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  preload: false,
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// Lora is the app's serif. On public pages it is mostly a fallback behind
// Playfair (the landing's book carousel does use it first), so it no longer
// preloads: two fewer high-priority font files competing with first paint. It
// still loads wherever it actually paints, signed-in pages included.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
  preload: false,
});

// Instrument Serif removed 2026-11-14: nothing used --font-instrument.

// One desktop-only landing line ("Your Story Starts"). Self-hosted here instead
// of a render-blocking @import from Google Fonts; loads only where it paints.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: "400",
  // Italic for the line, normal for its "→" (the old Google Fonts import loaded both).
  style: ["normal", "italic"],
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Resolves relative canonicals and the generated og:image / twitter:image URLs
  // against the serving host instead of whatever Vercel guesses.
  metadataBase: new URL(SITE_URL),
  title: {
    template: "%s | D.scribe",
    default: "D.scribe — Turn Your Voice Into a Published Book with AI",
  },
  description: "D.scribe turns your voice recordings into a fully structured manuscript. Coaches, pastors, and speakers publish their books in days — not years.",
  openGraph: {
    siteName: "D.scribe",
    type: "website",
  },
};

// The max-scale viewport cap was removed on purpose — DO NOT put it back to
// "fix" iOS focus-zoom. iOS Safari has IGNORED that directive since iOS 10
// (so it never suppressed the zoom it was added for), while Android Chrome
// honoured it and lost pinch-zoom entirely: a WCAG 1.4.4 failure on a product
// whose whole job is reading text. iOS focus-zoom is fixed the right way:
// 16px inputs.
// viewportFit: "cover" makes env(safe-area-inset-*) resolve to real values so
// the fixed bottom nav can pad for the iPhone home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome otherwise leaves fixed overlays at the layout viewport when
  // its keyboard opens. The studio also watches visualViewport for iOS Safari,
  // which does not consistently honour this policy.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${kalam.variable} ${manrope.variable} ${lora.variable} ${playfair.variable} ${cormorant.variable} antialiased`}>
        {/* Site-wide Organization + WebSite JSON-LD; pages reference these by @id. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(siteGraph())} />
        <MarketingPixels />
        <ReferralBanner />
        <FirstTouchCapture />
        {children}
        <ConsentBanner />
        {/* Vercel Web Analytics: off once analytics is declined (growth dashboard, 2026-11-25). */}
        <VercelAnalytics />
      </body>
    </html>
  );
}
