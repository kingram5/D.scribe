import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — AI Book Writing Plans Starting at $25",
  description: "D.scribe pricing starts at $25/month. Every plan includes AI transcription, voice-to-manuscript generation, and PDF/DOCX export. Pay only for the Ink you use — cancel anytime.",
  alternates: {
    canonical: "https://d-scribe.app/pricing",
  },
  openGraph: {
    title: "D.scribe Pricing — AI Book Writing Plans Starting at $25",
    description: "Starter, Pro, and Premium plans with AI transcription, manuscript generation, and full manuscript editor. Cancel anytime.",
    url: "https://d-scribe.app/pricing",
    siteName: "D.scribe",
    type: "website",
  },
};

const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "D.scribe Pricing — AI Book Writing Plans",
  url: "https://d-scribe.app/pricing",
  description: "Compare D.scribe plans for AI-powered voice-to-manuscript book writing",
  isPartOf: { "@type": "WebSite", name: "D.scribe", url: "https://d-scribe.app" },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "D.scribe",
  url: "https://d-scribe.app",
};

// Every tier includes the full toolkit — plans differ only on capacity (Ink),
// voice (Pro+), and value (Ink per dollar scales up with tier).
const TIERS = [
  {
    name: "Starter",
    price: 25,
    ink: 300,
    books: "~3 books",
    voice: null, // no voice playback on Starter
    tagline: "Test the waters — write your first book or two.",
    badge: null,
    highlight: false,
  },
  {
    name: "Pro",
    price: 50,
    ink: 660,
    books: "~6 books",
    voice: "20,000 voice chars / mo",
    tagline: "For the regular author who writes consistently.",
    badge: "Best Value",
    highlight: true,
  },
  {
    name: "Premium",
    price: 100,
    ink: 1500,
    books: "~14 books",
    voice: "60,000 voice chars / mo",
    tagline: "High-volume authors, coaches, and teams.",
    badge: null,
    highlight: false,
  },
];

// All AI capabilities are included on every plan — shown once, not gated per tier.
const INCLUDED_FEATURES = [
  "AI transcription",
  "Voice profile",
  "Chapter generation",
  "AI coherence pass",
  "Enrichment quotes",
  "Priority generation",
  "PDF / DOCX export",
];

function inkPerDollar(ink: number, price: number): string {
  const v = ink / price;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

export default function PricingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#2C2419",
        color: "#F9F7F2",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "10%",
          width: "40vw",
          height: "40vw",
          background: "rgba(193,122,71,0.08)",
          borderRadius: "50%",
          filter: "blur(120px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: "10%",
          right: "5%",
          width: "30vw",
          height: "30vw",
          background: "rgba(217,139,88,0.06)",
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
          borderBottom: "1px solid rgba(249,247,242,0.08)",
          background: "rgba(44,36,25,0.9)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#C17A47",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontFamily: "var(--font-playfair), var(--font-lora), serif",
                fontSize: 20,
                paddingTop: 2,
              }}
            >
              D.
            </div>
            <span
              style={{
                fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                fontWeight: 600,
                fontSize: 18,
                color: "#F9F7F2",
              }}
            >
              scribe
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <Link
              href="/#features"
              style={{
                fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                fontSize: 14,
                color: "#A89F94",
                textDecoration: "none",
              }}
            >
              Features
            </Link>
            <Link
              href="/#intelligence"
              style={{
                fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                fontSize: 14,
                color: "#A89F94",
                textDecoration: "none",
              }}
            >
              Intelligence
            </Link>
            <Link
              href="/pricing"
              style={{
                fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                fontSize: 14,
                color: "#F9F7F2",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Pricing
            </Link>
          </div>

          <Link
            href="/login"
            style={{
              fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "#F9F7F2",
              background: "#C17A47",
              padding: "10px 24px",
              borderRadius: 9999,
              textDecoration: "none",
            }}
          >
            Get Started
          </Link>
        </div>
      </nav>

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "80px 24px 120px",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <p
            style={{
              fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#C17A47",
              marginBottom: 16,
            }}
          >
            Pricing
          </p>
          <h1
            style={{
              fontFamily: "var(--font-playfair), var(--font-lora), serif",
              fontSize: "clamp(36px, 5vw, 60px)",
              fontWeight: 400,
              fontStyle: "italic",
              color: "#F9F7F2",
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            Write your book.<br />Pay for what you use.
          </h1>
          <p
            style={{
              fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
              fontSize: 18,
              color: "#A89F94",
              maxWidth: 520,
              margin: "0 auto",
              lineHeight: 1.7,
            }}
          >
            Every plan includes the full D. scribe toolkit. Ink scales with how much
            you write. Cancel anytime.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          {TIERS.map((tier, i) => (
            <div
              key={tier.name}
              style={{
                background: tier.highlight
                  ? "rgba(193,122,71,0.06)"
                  : "rgba(249,247,242,0.03)",
                border: tier.highlight
                  ? "1.5px solid rgba(193,122,71,0.5)"
                  : "1px solid rgba(249,247,242,0.1)",
                borderRadius: 20,
                padding: "36px 28px",
                position: "relative",
                transform: tier.highlight ? "translateY(-8px)" : "none",
              }}
            >
              {tier.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: -13,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#C17A47",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 14px",
                    borderRadius: 20,
                    fontFamily: "var(--font-manrope), sans-serif",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tier.badge}
                </div>
              )}

              <div
                style={{
                  fontFamily: "var(--font-manrope), sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  color: tier.highlight ? "#C17A47" : "#A89F94",
                  letterSpacing: "0.04em",
                  marginBottom: 12,
                }}
              >
                {tier.name}
              </div>

              <div
                style={{
                  fontFamily: "var(--font-manrope), sans-serif",
                  fontSize: 48,
                  fontWeight: 800,
                  color: "#F9F7F2",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                ${tier.price}
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#A89F94",
                  }}
                >
                  /mo
                </span>
              </div>

              <div
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 13,
                  color: "#A89F94",
                  marginBottom: 6,
                  marginTop: 8,
                }}
              >
                {tier.ink.toLocaleString()} Ink &middot; {tier.books}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  color: tier.highlight ? "#C17A47" : "#A89F94",
                  marginBottom: 6,
                }}
              >
                {inkPerDollar(tier.ink, tier.price)} Ink per $1
              </div>
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: tier.voice ? "#7A7358" : "#5C5249",
                  marginBottom: 20,
                }}
              >
                {tier.voice ?? "No voice playback"}
              </div>

              <p
                style={{
                  fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                  fontSize: 14,
                  color: "#C8C0B4",
                  lineHeight: 1.6,
                  margin: "0 0 24px",
                  minHeight: 44,
                }}
              >
                {tier.tagline}
              </p>

              <div
                style={{
                  height: 1,
                  background: "rgba(249,247,242,0.08)",
                  marginBottom: 20,
                }}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                  fontSize: 13,
                  color: "#A89F94",
                  marginBottom: 32,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C17A47" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Full D.scribe toolkit included
              </div>

              <Link
                href="/login"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "13px 0",
                  borderRadius: 12,
                  background: tier.highlight ? "#C17A47" : "rgba(249,247,242,0.08)",
                  color: tier.highlight ? "#fff" : "#F9F7F2",
                  fontFamily: "var(--font-manrope), sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: tier.highlight ? "none" : "1px solid rgba(249,247,242,0.15)",
                }}
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>

        {/* Everything included — shown once, not gated per tier */}
        <div style={{ maxWidth: 760, margin: "56px auto 0", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C17A47", marginBottom: 20 }}>
            Every plan includes
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px 24px" }}>
            {INCLUDED_FEATURES.map((f) => (
              <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", fontSize: 14, color: "#C8C0B4" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C17A47" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                {f}
              </span>
            ))}
          </div>
          <p style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", fontSize: 13, color: "#7A7358", marginTop: 20 }}>
            Voice playback (text-to-speech) is available on Pro &amp; Premium.
          </p>
        </div>

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <p
            style={{
              fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
              fontSize: 14,
              color: "#7A7358",
            }}
          >
            All plans include a 10 Ink free trial &middot; No payment required to start
          </p>
        </div>

        {/* How Ink Works */}
        <div style={{ maxWidth: 720, margin: "96px auto 0", borderTop: "1px solid rgba(249,247,242,0.08)", paddingTop: 72 }}>
          <h2 style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, fontStyle: "italic", color: "#F9F7F2", textAlign: "center", marginBottom: 40 }}>
            How Ink works
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {[
              {
                title: "Ink is your generation budget",
                body: "Every action that calls the AI — transcription, chapter generation, enrichment passes, coherence rewrites — costs Ink. Think of it like tokens on a prepaid meter. You can see exactly how much each action will cost before you run it.",
              },
              {
                title: "One book ≈ 100 Ink",
                body: "A standard 40,000-word book runs roughly 100 Ink end to end. The Starter plan (300 Ink) covers about 3 full books. Pro (660 Ink) handles 6. Premium (1,500 Ink) is built for high-volume authors, coaches, or teams producing content consistently.",
              },
              {
                title: "No surprise overages",
                body: "D.scribe shows you an Ink estimate before every major action. If you're running low, you'll see a warning — you'll never hit a wall mid-chapter without knowing it's coming.",
              },
            ].map((item) => (
              <div key={item.title} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C17A47", marginTop: 8, flexShrink: 0 }} />
                <div>
                  <p style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 15, fontWeight: 700, color: "#F9F7F2", marginBottom: 6 }}>{item.title}</p>
                  <p style={{ fontFamily: "var(--font-inter), var(--font-manrope), sans-serif", fontSize: 14, color: "#A89F94", lineHeight: 1.75, margin: 0 }}>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
