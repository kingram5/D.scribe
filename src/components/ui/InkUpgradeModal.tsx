"use client";

interface InkUpgradeModalProps {
  onClose: () => void;
}

const TIERS = [
  { name: "Starter", price: 25, ink: 300, highlight: false },
  { name: "Pro", price: 50, ink: 660, badge: "Most Popular", highlight: true },
  { name: "Premium", price: 100, ink: 1500, highlight: false },
];

export default function InkUpgradeModal({ onClose }: InkUpgradeModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "32px 28px",
          maxWidth: 560,
          width: "90%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "rgba(239,68,68,0.1)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#191816",
            fontFamily: "var(--font-manrope), sans-serif",
            marginBottom: 6,
          }}>
            You've run out of Ink
          </h2>
          <p style={{
            fontSize: 14,
            color: "#7a7369",
            fontFamily: "var(--font-manrope), sans-serif",
            lineHeight: 1.5,
          }}>
            Upgrade your plan to keep building your manuscript.
          </p>
        </div>

        {/* Tier cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {TIERS.map(tier => (
            <div
              key={tier.name}
              style={{
                flex: 1,
                border: tier.highlight ? "2px solid var(--ds-accent-500, #C17A47)" : "1px solid rgba(0,0,0,0.1)",
                borderRadius: 14,
                padding: "20px 16px",
                textAlign: "center",
                position: "relative",
                background: tier.highlight ? "rgba(193,122,71,0.03)" : "#fff",
              }}
            >
              {tier.badge && (
                <div style={{
                  position: "absolute",
                  top: -10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--ds-accent-500, #C17A47)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 10px",
                  borderRadius: 20,
                  fontFamily: "var(--font-manrope), sans-serif",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}>
                  {tier.badge}
                </div>
              )}
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#191816",
                fontFamily: "var(--font-manrope), sans-serif",
                marginBottom: 4,
              }}>
                {tier.name}
              </div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#191816",
                fontFamily: "var(--font-manrope), sans-serif",
                lineHeight: 1,
                marginBottom: 4,
              }}>
                ${tier.price}
                <span style={{ fontSize: 13, fontWeight: 500, color: "#a0978a" }}>/mo</span>
              </div>
              <div style={{
                fontSize: 12,
                color: "#7a7369",
                fontFamily: "var(--font-geist-mono), monospace",
                marginBottom: 16,
              }}>
                {tier.ink.toLocaleString()} Ink
              </div>
              <button
                style={{
                  width: "100%",
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  background: tier.highlight ? "var(--ds-accent-500, #C17A47)" : "rgba(0,0,0,0.06)",
                  color: tier.highlight ? "#fff" : "#191816",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-manrope), sans-serif",
                  transition: "opacity 0.15s",
                }}
                onClick={() => {
                  // Placeholder — Stripe checkout will go here
                  alert(`Stripe checkout for ${tier.name} plan coming soon!`);
                }}
              >
                Choose {tier.name}
              </button>
            </div>
          ))}
        </div>

        {/* Dismiss */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "10px 0",
            background: "none",
            border: "none",
            fontSize: 13,
            color: "#a0978a",
            cursor: "pointer",
            fontFamily: "var(--font-manrope), sans-serif",
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
