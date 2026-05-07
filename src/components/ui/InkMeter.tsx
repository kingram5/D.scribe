"use client";

import { useState, useEffect } from "react";

interface InkData {
  balance: number;
  lifetime_used: number;
  tier: string;
  breakdown: Record<string, number>;
}

const TIER_LIMITS: Record<string, number> = {
  free: 10,
  starter: 300,
  pro: 660,
  premium: 1500,
};

const TIER_LABELS: Record<string, string> = {
  free: "Free Trial",
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

export default function InkMeter({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<InkData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchInk() {
      try {
        const res = await fetch("/api/ink");
        if (res.ok && !cancelled) setData(await res.json());
      } catch {
        // silent fail
      }
    }

    fetchInk();
    const interval = setInterval(fetchInk, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  const limit = TIER_LIMITS[data.tier] || 10;
  const used = limit - data.balance;
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct < 60 ? "#22c55e" : pct < 85 ? "#eab308" : "#ef4444";

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          background: "rgba(0,0,0,0.04)",
          borderRadius: 20,
          cursor: "default",
        }}
        title={`${data.balance.toFixed(1)} Ink remaining (${TIER_LABELS[data.tier] || data.tier})`}
      >
        <div style={{
          width: 48,
          height: 4,
          background: "rgba(0,0,0,0.08)",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${100 - pct}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.5s ease",
          }} />
        </div>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-geist-mono), monospace",
          whiteSpace: "nowrap",
        }}>
          {data.balance.toFixed(1)} Ink
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 8px", marginBottom: 4 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          background: "rgba(0,0,0,0.03)",
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 12,
          padding: "14px 16px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Header row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#191816",
            fontFamily: "var(--font-manrope), sans-serif",
          }}>
            Ink Balance
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#191816",
            fontFamily: "var(--font-geist-mono), monospace",
          }}>
            {data.balance.toFixed(1)} <span style={{ color: "#a0978a", fontWeight: 400 }}>/ {limit}</span>
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          width: "100%",
          height: 8,
          background: "rgba(0,0,0,0.06)",
          borderRadius: 4,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${100 - pct}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            transition: "width 0.5s ease, background 0.3s ease",
          }} />
        </div>

        {/* Tier label + expand arrow */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#a0978a",
            fontFamily: "var(--font-manrope), sans-serif",
          }}>
            {TIER_LABELS[data.tier] || data.tier}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#a0978a" }}>
              {expanded ? "Hide" : "Details"}
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="#a0978a"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <path d="M2 4l3 3 3-3" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && Object.keys(data.breakdown).length > 0 && (
        <div style={{
          marginTop: 6,
          padding: "8px 14px",
          background: "rgba(0,0,0,0.02)",
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.04)",
        }}>
          <p style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-tertiary)",
            marginBottom: 6,
            fontFamily: "var(--font-manrope), sans-serif",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}>
            Usage Breakdown
          </p>
          {Object.entries(data.breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([op, cost]) => (
              <div key={op} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "2px 0",
              }}>
                <span style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  textTransform: "capitalize",
                }}>
                  {op.replace(/_/g, " ")}
                </span>
                <span style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}>
                  {cost.toFixed(1)} Ink
                </span>
              </div>
            ))}
          <div style={{
            borderTop: "1px solid rgba(0,0,0,0.06)",
            marginTop: 4,
            paddingTop: 4,
            display: "flex",
            justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-manrope), sans-serif",
            }}>
              Lifetime
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-geist-mono), monospace",
            }}>
              {data.lifetime_used.toFixed(1)} Ink
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
