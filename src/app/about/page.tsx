import type { Metadata } from "next";
import Link from "next/link";
import { FOUNDER_STORY } from "@/lib/founder";
import { FAQ_ITEMS } from "@/components/landing/faq";
import PublicMobileMenu from "@/components/landing/PublicMobileMenu";
import { SITE_URL } from "@/lib/site";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { DEFINITION, ORG_ID, graph, jsonLd, webPageNode } from "@/lib/structured-data";
import { DIFFERENTIATORS, HOW_IT_WORKS, KEY_FACTS, WHO_USES } from "@/lib/about-content";

/**
 * /about — the founding story (HeyCatch 2026-09-10 item 2), expanded into a
 * full About page for AI search (Hoffman 8-block structure, 2026-09-21):
 * value statement, what we do, differentiators, who uses it, how it works,
 * key facts (machine-readable <dl>), and FAQ.
 *
 * Server-rendered, same warm-editorial dark theme as /pricing and /legal.
 * Kyle 2026-09-19: no personal info on this page — no name, email, location,
 * headshot or Person schema. The story carries itself; the key-facts table
 * therefore omits founder-name and headquarters rows.
 */

export const metadata: Metadata = {
  title: "About",
  description: "D.scribe is voice-to-manuscript software for speakers, pastors, and coaches.",
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
  openGraph: {
    title: "About D.scribe",
    description: "Voice-to-manuscript software for speakers, pastors, and coaches.",
    url: `${SITE_URL}/about`,
    siteName: "D.scribe",
    type: "website",
    images: [DEFAULT_OG_IMAGE],
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

const H2: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: "clamp(22px, 3vw, 28px)",
  fontWeight: 400,
  fontStyle: "italic",
  color: COLORS.ink,
  lineHeight: 1.25,
  margin: "0 0 16px",
};

const H3: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 700,
  color: COLORS.ink,
  margin: "0 0 8px",
};

const P: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 16,
  lineHeight: 1.8,
  color: COLORS.body,
  margin: "0 0 16px",
};

// The Organization itself (logo, sameAs, founding year, contact) comes from the
// root layout's site graph; this page is its AboutPage. The old block here
// hard-coded 25/50/100 offer prices, which would have gone stale on the plan
// switch; prices now live only on the SoftwareApplication (home, pricing).
const pageGraph = graph(
  webPageNode({
    path: "/about",
    type: "AboutPage",
    name: "About D.scribe",
    description: DEFINITION,
    about: ORG_ID,
  }),
);

export default function AboutPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(pageGraph)} />
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

        <nav className="ds-touch-links"
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
              <Link href="/pricing" className="ds-pubnav-desktop" style={{ fontFamily: SANS, fontSize: 14, color: COLORS.ink, textDecoration: "none", fontWeight: 600 }}>
                Pricing
              </Link>
              <Link
                href="/login"
                style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: COLORS.ink, background: COLORS.accent, padding: "10px 24px", borderRadius: 9999, textDecoration: "none" }}
              >
                Get Started
              </Link>
              <PublicMobileMenu />
            </div>
          </div>
        </nav>

        <article style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px 96px", position: "relative", zIndex: 10 }}>
          <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: COLORS.accent, margin: "0 0 16px" }}>
            About
          </p>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(30px, 5vw, 46px)", fontWeight: 400, fontStyle: "italic", color: COLORS.ink, lineHeight: 1.15, margin: "0 0 24px" }}>
            Why I built this
          </h1>

          {/* Hoffman block 1: the value statement, in the shape AI reads best. */}
          <p style={{ fontFamily: SANS, fontSize: 18, lineHeight: 1.7, color: COLORS.ink, margin: "0 0 40px" }}>
            D.scribe is voice-to-manuscript software that turns the talks, sermons, and coaching sessions you have already recorded into a finished book, for speakers, pastors, and coaches.
          </p>

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

          {/* Hoffman block 2: what D.scribe does, in the product voice (not Kyle's) */}
          <h2 style={H2}>
            What D.scribe does
          </h2>
          <p style={P}>
            D.scribe is voice-to-manuscript software for speakers, pastors, and coaches. You upload the recordings you already have: sermons, coaching calls, keynotes, voice memos. D.scribe transcribes them, builds a voice profile from how you actually talk, and drafts your manuscript chapter by chapter.
          </p>
          <p style={P}>
            Every key point comes from your own words. The draft lands in a manuscript editor where every sentence is yours to change, and it exports to PDF or DOCX when you say it is done.
          </p>

          {/* Hoffman block 3: differentiators, quantified, competitors named */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            What makes D.scribe different
          </h2>
          {DIFFERENTIATORS.map((d) => (
            <div key={d.title} style={{ margin: "0 0 20px" }}>
              <h3 style={H3}>{d.title}</h3>
              <p style={{ ...P, marginBottom: 0 }}>{d.body}</p>
            </div>
          ))}

          {/* Hoffman block 4: who uses it */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            Who uses D.scribe
          </h2>
          <ul style={{ margin: "0 0 16px", padding: "0 0 0 20px", listStyle: "disc" }}>
            {WHO_USES.map((w) => (
              <li key={w} style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.8, color: COLORS.body, marginBottom: 8 }}>
                {w}
              </li>
            ))}
          </ul>

          {/* Hoffman block 6: how it works */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            How D.scribe works
          </h2>
          {HOW_IT_WORKS.map((h) => (
            <div key={h.title} style={{ margin: "0 0 20px" }}>
              <h3 style={H3}>{h.title}</h3>
              <p style={{ ...P, marginBottom: 0 }}>{h.body}</p>
            </div>
          ))}

          {/* Hoffman block 7: key facts, machine-readable definition list */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            Key facts
          </h2>
          <dl style={{ margin: "0 0 16px" }}>
            {KEY_FACTS.map(([term, def]) => (
              <div key={term} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px 16px", padding: "10px 0", borderBottom: `1px solid ${COLORS.divider}` }}>
                <dt style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.muted, paddingTop: 2 }}>
                  {term}
                </dt>
                <dd style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.7, color: COLORS.body, margin: 0 }}>
                  {def}
                </dd>
              </div>
            ))}
          </dl>

          {/* Hoffman block 8: FAQ — same source as the landing's FAQPage schema */}
          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />
          <h2 style={H2}>
            Frequently asked questions
          </h2>
          {FAQ_ITEMS.map((item) => (
            <div key={item.q} style={{ margin: "0 0 20px" }}>
              <h3 style={H3}>{item.q}</h3>
              <p style={{ ...P, marginBottom: 0 }}>{item.a}</p>
            </div>
          ))}

          <div style={{ height: 1, background: COLORS.divider, margin: "40px 0" }} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
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
