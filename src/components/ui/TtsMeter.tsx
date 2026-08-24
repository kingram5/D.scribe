"use client";

import { useState, useEffect } from "react";
import AddMoreButton from "@/components/ui/AddMoreButton";

interface TtsData {
  tts_chars_used: number;
  tts_limit: number;
  tts_period_start: string;
  tier: string;
  topup_tts_chars?: number;
}

export default function TtsMeter({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<TtsData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTts() {
      try {
        const res = await fetch("/api/ink/usage");
        if (res.ok && !cancelled) setData(await res.json());
      } catch {
        // silent fail
      }
    }

    fetchTts();
    const interval = setInterval(fetchTts, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  const used = data.tts_chars_used;
  const limit = data.tts_limit;
  const extra = Number(data.topup_tts_chars ?? 0);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const barColor = pct > 85 ? "#ef4444" : "#B87333";
  const extraLabel = extra > 0 ? `+ ${extra.toLocaleString()} extra` : null;

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "8px 20px",
          background: "rgba(0,0,0,0.04)",
          borderRadius: 40,
          cursor: "default",
        }}
        title={`Voice: ${used.toLocaleString()} / ${limit.toLocaleString()} chars used this month`}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#B87333" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 1v8M5 4v2a3 3 0 006 0V4" />
          <path d="M3 9a5 5 0 0010 0" />
          <path d="M8 14v2" />
        </svg>
        <div style={{
          width: 80,
          height: 8,
          background: "rgba(0,0,0,0.08)",
          borderRadius: 4,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor,
            borderRadius: 4,
            transition: "width 0.5s ease",
          }} />
        </div>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-geist-mono), monospace",
          whiteSpace: "nowrap",
        }}>
          {used.toLocaleString()}
          <span style={{ fontWeight: 400, opacity: 0.6 }}> / {limit.toLocaleString()}</span>
          {extraLabel && (
            <span style={{ fontWeight: 400, color: "#C17A47", marginLeft: 6 }}>{extraLabel}</span>
          )}
        </span>
        <AddMoreButton sku="voice_pack" />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 8px 8px" }}>
      <div style={{
        background: "rgba(0,0,0,0.03)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 12,
        padding: "14px 16px",
      }}>
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
            Voice
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#191816",
            fontFamily: "var(--font-geist-mono), monospace",
          }}>
            {used.toLocaleString()}{" "}
            <span style={{ color: "#a0978a", fontWeight: 400 }}>/ {limit.toLocaleString()}</span>
            {extraLabel && (
              <span style={{ color: "#C17A47", fontWeight: 500, marginLeft: 6 }}>{extraLabel}</span>
            )}
          </span>
        </div>
        <div style={{
          width: "100%",
          height: 8,
          background: "rgba(0,0,0,0.06)",
          borderRadius: 4,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${pct}%`,
            height: "100%",
            background: barColor,
            borderRadius: 4,
            transition: "width 0.5s ease, background 0.3s ease",
          }} />
        </div>
        <div style={{
          fontSize: 11,
          color: "#a0978a",
          marginTop: 8,
          fontFamily: "var(--font-manrope), sans-serif",
        }}>
          chars / month{extraLabel ? ` · ${extraLabel}` : ""}
        </div>
        <div style={{ marginTop: 8 }}>
          <AddMoreButton sku="voice_pack" />
        </div>
      </div>
    </div>
  );
}
