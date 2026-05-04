import Link from "next/link";

const TIERS = [
  {
    name: "Starter",
    price: 25,
    ink: 300,
    books: "~3 books",
    ttsChars: "8,000",
    badge: null,
    highlight: false,
    features: [
      "AI transcription",
      "Voice profile",
      "Chapter generation",
      "PDF / DOCX export",
    ],
  },
  {
    name: "Pro",
    price: 50,
    ink: 660,
    books: "~6 books",
    ttsChars: "20,000",
    badge: "Most Popular",
    highlight: true,
    features: [
      "AI transcription",
      "Voice profile",
      "Chapter generation",
      "PDF / DOCX export",
      "AI coherence pass",
      "Enrichment quotes",
    ],
  },
  {
    name: "Premium",
    price: 100,
    ink: 1500,
    books: "~14 books",
    ttsChars: "60,000",
    badge: null,
    highlight: false,
    features: [
      "AI transcription",
      "Voice profile",
      "Chapter generation",
      "PDF / DOCX export",
      "AI coherence pass",
      "Enrichment quotes",
      "Priority generation",
    ],
  },
];

export default function PricingPage() {
  return (
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
                  marginBottom: 4,
                  marginTop: 8,
                }}
              >
                {tier.ink.toLocaleString()} Ink &middot; {tier.books}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 12,
                  color: "#7A7358",
                  marginBottom: 28,
                }}
              >
                {tier.ttsChars} voice chars / mo
              </div>

              <div
                style={{
                  height: 1,
                  background: "rgba(249,247,242,0.08)",
                  marginBottom: 24,
                }}
              />

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
                {tier.features.map(f => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
                      fontSize: 14,
                      color: "#C8C0B4",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C17A47" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

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

        <div style={{ textAlign: "center", marginTop: 64 }}>
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
      </div>
    </div>
  );
}
