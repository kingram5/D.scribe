import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter, Kalam, Manrope, Lora, Instrument_Serif, Playfair_Display } from "next/font/google";
import { MarketingPixels } from "@/components/analytics/MarketingPixels";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  preload: false,
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

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
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${kalam.variable} ${manrope.variable} ${lora.variable} ${instrumentSerif.variable} ${playfair.variable} antialiased`}>
        <MarketingPixels />
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}
