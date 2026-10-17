import type { Metadata, Viewport } from "next";
import { MarketingPixels } from "@/components/analytics/MarketingPixels";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { ReferralBanner } from "@/components/partners/ReferralBanner";
import "./globals.css";
import "./fonts.css";

export const metadata: Metadata = {
  title: {
    template: "%s | D.scribe",
    default: "D.scribe — Turn Your Voice Into a Published Book with AI",
  },
  description: "D.scribe transcribes your voice recordings and turns them into a fully structured manuscript. Coaches, pastors, and speakers publish their books in days — not years.",
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
      <head>
        <link rel="preload" href="/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/manrope-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/lora-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <MarketingPixels />
        <ReferralBanner />
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}
