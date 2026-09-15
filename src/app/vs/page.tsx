import type { Metadata } from "next";
import Link from "next/link";
import { VS_PAGES, SOURCED_NOTE } from "@/lib/vs-pages";

/**
 * /vs — index of the comparison pages (HeyCatch action plan).
 * Small hub so the three pages are internally linked and crawlable.
 */

export const metadata: Metadata = {
  title: "Compare D.scribe",
  description:
    "Honest side-by-side comparisons of D.scribe against Built&Written, Squibler, and Dictate on price, input, and output.",
  alternates: { canonical: "https://d-scribe.app/vs" },
  openGraph: {
    title: "Compare D.scribe",
    description:
      "Honest side-by-side comparisons of D.scribe against Built&Written, Squibler, and Dictate.",
    url: "https://d-scribe.app/vs",
    siteName: "D.scribe",
    type: "website",
  },
};

const COLORS = {
  bg: "#2C2419",
  ink: "#F9F7F2",
  body: "#C8C0B4",
  muted: "#A89F94",
  faint: "#7A7358",
  accent: "#C17A47",
  divider: "rgba(249,247,242,0.08)",
  card: "rgba(249,247,242,0.03)",
} as const;

const SANS = "var(--font-inter), var(--font-manrope), sans-serif";
const SERIF = "var(--font-playfair), var(--font-lora), serif";

export default function VsIndex() {
  return (
    <main style={{ background: COLORS.bg, color: COLORS.body, minHeight: "100vh", fontFamily: SANS, padding: "0 24px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "72px 0 96px" }}>
        <Link href="/" style={{ fontSize: 13, color: COLORS.muted, textDecoration: "none" }}>
          &larr; D.scribe
        </Link>

        <h1
          style={{
            fontFamily: SERIF,
            fontSize: 42,
            lineHeight: 1.15,
            color: COLORS.ink,
            fontWeight: 500,
            margin: "28px 0 18px",
          }}
        >
          How D.scribe compares
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.75, color: COLORS.body, marginBottom: 40 }}>
          Three honest side-by-sides. Each one names what the other product does better, because a
          comparison that only flatters us is not worth your time.
        </p>

        {VS_PAGES.map((p) => (
          <Link
            key={p.slug}
            href={`/vs/${p.slug}`}
            style={{
              display: "block",
              background: COLORS.card,
              border: `1px solid ${COLORS.divider}`,
              borderRadius: 10,
              padding: "22px 24px",
              marginBottom: 16,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 23,
                color: COLORS.ink,
                display: "block",
                marginBottom: 8,
              }}
            >
              D.scribe vs {p.competitor}
            </span>
            <span style={{ fontSize: 15, lineHeight: 1.65, color: COLORS.muted, display: "block" }}>
              {p.verdict}
            </span>
          </Link>
        ))}

        <p
          style={{
            fontSize: 13,
            lineHeight: 1.65,
            color: COLORS.faint,
            borderTop: `1px solid ${COLORS.divider}`,
            marginTop: 40,
            paddingTop: 20,
          }}
        >
          {SOURCED_NOTE}
        </p>
      </div>
    </main>
  );
}