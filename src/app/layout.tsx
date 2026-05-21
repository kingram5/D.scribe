import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Inter, Kalam, Manrope, Lora, Instrument_Serif, Playfair_Display } from "next/font/google";
import { MarketingPixels } from "@/components/analytics/MarketingPixels";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
      </body>
    </html>
  );
}
