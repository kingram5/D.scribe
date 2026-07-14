"use client";

import { useEffect, useRef, useState } from "react";

interface InkUpgradeModalProps {
  onClose: () => void;
  reason?: "ink" | "tts" | "tts_locked";
}

const TIERS = [
  { name: "Starter", price: 25, ink: 300, ttsChars: "8K", highlight: false },
  { name: "Pro", price: 50, ink: 660, ttsChars: "20K", badge: "Most Popular", highlight: true },
  { name: "Premium", price: 100, ink: 1500, ttsChars: "60K", highlight: false },
];

function getHeader(reason: "ink" | "tts" | "tts_locked") {
  if (reason === "tts") return "Monthly voice limit reached";
  if (reason === "tts_locked") return "Voice is a paid feature";
  return "You’ve run out of Ink";
}

function getSubtitle(reason: "ink" | "tts" | "tts_locked") {
  if (reason === "tts") return "Upgrade your plan to keep using AI voice this month.";
  if (reason === "tts_locked") return "AI voice is available on all paid plans.";
  return "Upgrade your plan to keep building your manuscript.";
}

export default function InkUpgradeModal({ onClose, reason = "ink" }: InkUpgradeModalProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Dialog semantics: focus moves in on open, Escape closes
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  async function handleChoose(tierName: string) {
    setLoadingTier(tierName);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierName.toLowerCase() }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setLoadingTier(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ink-upgrade-title"
        tabIndex={-1}
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "32px 28px",
          maxWidth: 580,
          width: "90%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
          outline: "none",
        }}
        onClick={e => e.stopPropagation()}
      >
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
          <h2 id="ink-upgrade-title" style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#191816",
            fontFamily: "var(--font-manrope), sans-serif",
            marginBottom: 6,
          }}>
            {getHeader(reason)}
          </h2>
          <p style={{
            fontSize: 14,
            color: "#7a7369",
            fontFamily: "var(--font-manrope), sans-serif",
            lineHeight: 1.5,
          }}>
            {getSubtitle(reason)}
          </p>
        </div>

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
                marginBottom: 4,
              }}>
                {tier.ink.toLocaleString()} Ink
              </div>
              <div style={{
                fontSize: 11,
                color: "#a0978a",
                fontFamily: "var(--font-geist-mono), monospace",
                marginBottom: 16,
              }}>
                {tier.ttsChars} voice chars
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
                  cursor: loadingTier ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-manrope), sans-serif",
                  transition: "opacity 0.15s",
                  opacity: loadingTier && loadingTier !== tier.name ? 0.5 : 1,
                }}
                disabled={!!loadingTier}
                onClick={() => handleChoose(tier.name)}
              >
                {loadingTier === tier.name ? "Loading..." : `Choose ${tier.name}`}
              </button>
            </div>
          ))}
        </div>

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
