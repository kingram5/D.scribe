import { ImageResponse } from "next/og";

/**
 * Shared Open Graph / Twitter card renderer (HeyCatch 2026-09-10 item 7).
 * Used by src/app/opengraph-image.tsx and src/app/pricing/opengraph-image.tsx.
 *
 * Rendered by Satori at build/request time, so only flexbox layout and inline
 * styles are available (no CSS variables, no web fonts unless loaded). Brand
 * colors mirror the landing page; the wordmark uses Satori's default serif
 * fallback rather than Playfair to avoid a network fetch during builds.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export function renderOgCard({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1A140E 0%, #2C2419 60%, #3A2C1E 100%)",
          color: "#F9F7F2",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 56, fontStyle: "italic", color: "#F0A878" }}>D.</span>
          <span style={{ fontSize: 40, fontStyle: "italic", color: "#F9F7F2" }}>scribe</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span style={{ fontSize: 20, letterSpacing: 6, textTransform: "uppercase", color: "#C17A47", fontFamily: "sans-serif" }}>
            {eyebrow}
          </span>
          <span style={{ fontSize: 76, lineHeight: 1.05, maxWidth: 1000, color: "#F9F7F2" }}>{title}</span>
          <span style={{ fontSize: 30, lineHeight: 1.4, maxWidth: 960, color: "#C8C0B4", fontFamily: "sans-serif" }}>{subtitle}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "sans-serif", fontSize: 22, color: "#A89F94" }}>
          <span>d-scribe.app</span>
          <span style={{ color: "#D98B58", fontStyle: "italic", fontFamily: "serif", fontSize: 26 }}>You talk. It writes.</span>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
