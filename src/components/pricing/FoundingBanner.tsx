"use client";

import { useEffect, useState } from "react";

// Founding 100 banner above the $99 card (src/lib/founding.ts). Renders
// nothing until /api/founding confirms the offer is on with seats left, so a
// switched-off offer, a Stripe hiccup or a sold-out cap never shows a number.

export type FoundingInfo = { on: true; remaining: number; total: number; price: number; regular: number };

export function foundingSeatsLine(info: FoundingInfo): string {
  const seats = info.remaining === 1 ? "1 seat" : `${info.remaining} seats`;
  return `${seats} left of ${info.total}`;
}

export default function FoundingBanner() {
  const [info, setInfo] = useState<FoundingInfo | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/founding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.on === true && Number(d.remaining) > 0 && Number(d.total) > 0) setInfo(d as FoundingInfo);
      })
      .catch(() => null);
    return () => { alive = false; };
  }, []);

  if (!info) return null;
  return (
    <div
      role="note"
      aria-label="Founding 100 offer"
      style={{
        maxWidth: 560,
        margin: "0 auto 28px",
        padding: "18px 22px",
        border: "1px solid rgba(193,122,71,0.55)",
        borderRadius: 14,
        background: "rgba(193,122,71,0.08)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-manrope), sans-serif",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#C17A47",
          marginBottom: 8,
        }}
      >
        Founding 100 · {foundingSeatsLine(info)}
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-manrope), sans-serif",
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1.45,
          color: "#F9F7F2",
        }}
      >
        The first {info.total} authors pay ${info.price} a month for life, instead of ${info.regular}.
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "#A89F94",
        }}
      >
        Applied automatically at checkout for new subscribers. Your founding price stays for as long as your
        subscription stays active; if you cancel, it ends.
      </p>
    </div>
  );
}
