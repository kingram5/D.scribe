"use client";

import { useEffect, useState } from "react";

interface InkData {
  balance: number;
  lifetime_used: number;
  tier: string;
}

interface TtsData {
  tts_chars_used: number;
  tts_limit: number;
  tts_period_start: string;
  tier: string;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

const INK_LIMITS: Record<string, number> = {
  free: 10,
  starter: 300,
  pro: 660,
  premium: 1500,
};

const TIER_COLORS: Record<string, string> = {
  free: "#7A7358",
  starter: "#5B7FA6",
  pro: "#C17A47",
  premium: "#9B6BB0",
};

export default function UsageWidget() {
  const [ink, setInk] = useState<InkData | null>(null);
  const [tts, setTts] = useState<TtsData | null>(null);
  const [managingPlan, setManagingPlan] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ink?history=false")
      .then(r => r.json())
      .then(setInk)
      .catch(() => null);

    fetch("/api/ink/usage")
      .then(r => r.json())
      .then(setTts)
      .catch(() => null);
  }, []);

  async function handleManagePlan() {
    setManagingPlan(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return; // redirecting — keep loading state until the page unloads
      }
      // An error *response* doesn't throw, so surface it instead of hanging.
      setPortalError(data.error || `Couldn't open billing portal (${res.status})`);
    } catch {
      setPortalError("Couldn't open billing portal. Please try again.");
    }
    setManagingPlan(false); // only reached on failure — success redirects above
  }

  const tier = ink?.tier ?? "free";
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const tierColor = TIER_COLORS[tier] ?? "#7A7358";

  const ttsUsed = tts?.tts_chars_used ?? 0;
  const ttsLimit = tts?.tts_limit ?? 0;
  const ttsPct = ttsLimit > 0 ? Math.min(100, (ttsUsed / ttsLimit) * 100) : 0;

  const inkLimit = INK_LIMITS[tier] ?? 10;
  const inkUsed = ink ? Math.max(0, inkLimit - ink.balance) : 0;
  const inkPct = inkLimit > 0 ? Math.min(100, (inkUsed / inkLimit) * 100) : 0;
  const inkBarColor = inkPct > 85 ? "#ef4444" : "#3b82f6";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(44,36,25,0.08)",
        borderRadius: 16,
        padding: "20px 20px 16px",
        fontFamily: "var(--font-manrope), sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2C2419", letterSpacing: "0.01em" }}>
          Usage
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: tierColor,
            background: `${tierColor}18`,
            padding: "3px 10px",
            borderRadius: 20,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {tierLabel}
        </span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#7A7358", fontWeight: 500 }}>Ink</span>
          <span style={{ fontSize: 12, color: "#7A7358", fontFamily: "var(--font-geist-mono), monospace" }}>
            {ink ? inkUsed.toFixed(1) : "—"} / {inkLimit}
          </span>
        </div>
        <div style={{ height: 5, background: "rgba(44,36,25,0.08)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${inkPct}%`,
            background: inkBarColor,
            borderRadius: 999,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {tier !== "free" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#7A7358", fontWeight: 500 }}>Voice</span>
            <span style={{ fontSize: 12, color: "#7A7358", fontFamily: "var(--font-geist-mono), monospace" }}>
              {ttsUsed.toLocaleString()} / {ttsLimit.toLocaleString()} chars
            </span>
          </div>
          <div
            style={{
              height: 5,
              background: "rgba(44,36,25,0.08)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${ttsPct}%`,
                background: ttsPct > 85 ? "#ef4444" : "#B87333",
                borderRadius: 999,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      )}

      {tier !== "free" ? (
        <button
          onClick={handleManagePlan}
          disabled={managingPlan}
          style={{
            width: "100%",
            padding: "8px 0",
            borderRadius: 8,
            border: "1px solid rgba(44,36,25,0.12)",
            background: "transparent",
            fontSize: 12,
            fontWeight: 600,
            color: "#2C2419",
            cursor: managingPlan ? "not-allowed" : "pointer",
            fontFamily: "var(--font-manrope), sans-serif",
            opacity: managingPlan ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {managingPlan ? "Loading..." : "Manage Plan"}
        </button>
      ) : null}
      {portalError && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 11,
            color: "#ef4444",
            fontFamily: "var(--font-manrope), sans-serif",
            textAlign: "center",
          }}
        >
          {portalError}
        </p>
      )}
      {tier === "free" ? (
        <a
          href="/pricing"
          style={{
            display: "block",
            width: "100%",
            padding: "8px 0",
            borderRadius: 8,
            border: "none",
            background: "#C17A47",
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            cursor: "pointer",
            fontFamily: "var(--font-manrope), sans-serif",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Upgrade Plan
        </a>
      ) : null}
    </div>
  );
}
