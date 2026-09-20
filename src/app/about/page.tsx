import type { Metadata } from "next";
import Link from "next/link";
import { FOUNDER_STORY } from "@/lib/founder";

/**
 * /about — the founding story (HeyCatch 2026-09-10 item 2).
 *
 * Server-rendered, same warm-editorial dark theme as /pricing and /legal.
 * Kyle 2026-09-19: no personal info on this page — no name, email, location,
 * headshot or Person schema. The story carries itself.
 */

export const metadata: Metadata = {
  title: "About",
  description: "D.scribe is voice-to-manuscript software for speakers, pastors, and coaches.",
  alternates: {
    canonical: "https://d-scribe.app/about",
  },
  openGraph: {
    title: "About D.scribe",
    description: "Voice-to-manuscript software for speakers, pastors, and coaches.",
    url: "https://d-scribe.app/about",
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
} as const;

const SANS = "var(--font-inter), var(--font-manrope), sans-serif";
const SERIF = "var(--font-playfair), var(--font-lora), serif";

export default function AboutPage() {
  return (
    <>
      <div style={{ minHeight: "100vh", backgroundColor: COLORS.bg, color: COLORS.ink, position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "fixed",
            top: "10%",
            right: "5%",
            width: "30vw",
            height: "30vw",
            background: "rgba(193,122,71,0.06)",
            borderRadius: "50%",
            filter: "blur(100px)",
            pointerEvents: "none",
          }}
        />

        <nav
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            borderBottom: `1px solid ${COLORS.divider}`,
            background: "rgba(44,36,25,0.9)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: COLORS.accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontFamily: SERIF,
                  fontSize: 20,
                  paddingTop: 2,
                }}
              >
                D.
              </div>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 18, color: COLORS.ink }}>scribe</span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <Link href="/pricing" style={{ fontFamily: SANS, fontSize: 14, color: COLORS.ink, textDecoration: "none", fontWeight: 600 }}>
                Pricing
              </Link>
              <Link
                href="/login"
                style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: COLORS.ink, background: COLORS.accent, padding: "10px 24px", borderRadius: 9999, textDecoration: "none" }}
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        <article style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px 96px", position: "relative", zIndex: 10 }}>
          <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.accent, margin: "0 0 16px" }}>
            About
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 400, fontStyle: "italic", color: COLORS.ink, lineHeight: 1.15, margin: "0 0 40px" }}>
            Why I built this
          </h1>

          {/* Kyle's story: his words, verbatim from src/lib/founder.ts (swapped in
              2026-09-19). Never edited, never an internal placeholder on a public
              page (fixed 2026-09-10 after the placeholder shipped live). */}
          {FOUNDER_STORY ? (
            <>{FOUNDER_STORY.map((para, i) => (
              <p key={i} style={{ fontFamily: SANS, fontSize: 17, lineHeight: 1.8, color: COLORS.body, margin: "0 0 16px" }}>
                {para}
              </p>
            ))}</>
          ) : null}

          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />

          {/* Product facts, in the product voice (not Kyle's) */}
          <h2 style={{ fontFamily: SERIF, fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 400, fontStyle: "italic", color: COLORS.ink, lineHeight: 1.25, margin: "0 0 16px" }}>
            What D.scribe does
          </h2>
          <p style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.8, color: COLORS.body, margin: "0 0 16px" }}>
            D.scribe is voice-to-manuscript software for speakers, pastors, and coaches. You upload the recordings you already have: sermons, coaching calls, keynotes, voice memos. D.scribe transcribes them, builds a voice profile from how you actually talk, and drafts your manuscript chapter by chapter.
          </p>
          <p style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.8, color: COLORS.body, margin: "0 0 16px" }}>
            Every key point comes from your own words. The draft lands in a manuscript editor where every sentence is yours to change, and it exports to PDF or DOCX when you say it is done.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 32 }}>
            <Link
              href="/login"
              style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: COLORS.ink, background: COLORS.accent, padding: "12px 24px", borderRadius: 9999, textDecoration: "none" }}
            >
              Begin your book
            </Link>
            <Link
              href="/pricing"
              style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: COLORS.ink, border: "1px solid rgba(249,247,242,0.2)", padding: "12px 24px", borderRadius: 9999, textDecoration: "none" }}
            >
              See pricing
            </Link>
          </div>
        </article>
      </div>
    </>
  );
}
