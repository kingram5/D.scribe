"use client";

import { useEffect, useRef } from "react";

// The D.scribe wordmark on the hanging sign, in five readings. Kyle found the
// original (thin bars racing inside the letters) hard to read at sign size. Each
// variant trades some motion for legibility in a different way; the gallery at
// /dev/bookshelf?logos=1 shows them side by side.
//
//  wave      the original: letters clipped from a fast, busy waveform
//  wave-slow same idea, half the bars, a third the speed, cream on a dark inlay
//  underline solid cream wordmark, the waveform breathing as a strip beneath it
//  engraved  static wordmark carved into the wood, no motion at all
//  ink       solid wordmark with a slow copper sheen passing through the letters

export type WordmarkVariant = "wave" | "wave-slow" | "underline" | "engraved" | "ink";
export const WORDMARK_VARIANTS: WordmarkVariant[] = ["wave", "wave-slow", "underline", "engraved", "ink"];

export default function Wordmark({ variant = "underline", width = 260 }: { variant?: WordmarkVariant; width?: number }) {
  const height = Math.round(width * 0.25);
  switch (variant) {
    case "wave": return <WaveText width={width} height={height} bars={80} speed={1} fill="#F4E8D1" />;
    case "wave-slow": return <WaveText width={width} height={height} bars={36} speed={3} fill="#FFF3DC" inlay />;
    case "underline": return <Underline width={width} height={height} />;
    case "engraved": return <Engraved width={width} height={height} />;
    case "ink": return <Ink width={width} height={height} />;
  }
}

const SERIF = "var(--font-playfair),'Playfair Display',serif";

function WaveText({ width, height, bars, speed, fill, inlay }: { width: number; height: number; bars: number; speed: number; fill: string; inlay?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef(`wm${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vw = 500, vh = 120, bw = vw / bars, gap = bars > 50 ? 1 : 2;
    let rects = "";
    for (let i = 0; i < bars; i++) {
      const n = i / bars;
      const slow = Math.sin(n * Math.PI * 2);
      const fast = Math.sin(n * Math.PI * 8) * 0.4;
      const noise = (Math.random() - 0.5) * 0.2;
      const combined = (slow + fast + noise) / 1.5;
      const delay = n * -3.2 * speed;
      const dur = (1.5 + Math.random() * 1.5) * speed;
      const sMin = 0.35 + Math.abs(fast) * 0.3;
      const sMax = 0.75 + Math.abs(combined) * 0.25;
      rects += `<rect x="${i * bw}" y="0" width="${bw - gap}" height="100%" style="fill:${fill};transform-box:fill-box;transform-origin:center;animation:${id.current} ${dur}s cubic-bezier(0.4,0,0.2,1) ${delay}s infinite alternate;--smin:${sMin};--smax:${sMax}" />`;
    }
    el.innerHTML = `
      <style>@keyframes ${id.current} { 0% { transform: scaleY(var(--smin)); opacity: 0.85; } 100% { transform: scaleY(var(--smax)); opacity: 1; } }</style>
      <svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.6));">
        <defs><clipPath id="${id.current}c"><text x="50%" y="65%" text-anchor="middle" alignment-baseline="middle" font-family="${SERIF}" font-style="italic" font-weight="500" font-size="100px" letter-spacing="-0.02em">D. scribe</text></clipPath></defs>
        <text x="50%" y="65%" text-anchor="middle" alignment-baseline="middle" font-family="${SERIF}" font-style="italic" font-weight="500" font-size="100px" letter-spacing="-0.02em" fill="rgba(0,0,0,0.35)">D. scribe</text>
        <g clip-path="url(#${id.current}c)">${rects}</g>
      </svg>`;
  }, [bars, speed, fill]);
  return (
    <div style={{ width, height, borderRadius: 6, padding: inlay ? "2px 6px" : 0, background: inlay ? "rgba(20,12,6,0.45)" : "transparent", boxShadow: inlay ? "inset 0 2px 4px rgba(0,0,0,0.6), 0 1px 0 rgba(255,220,170,0.25)" : "none" }}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function Underline({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bars = 40;
    let rects = "";
    for (let i = 0; i < bars; i++) {
      const n = i / bars;
      const h = 0.35 + Math.abs(Math.sin(n * Math.PI * 3)) * 0.65;
      rects += `<rect x="${(i / bars) * 100}%" y="0" width="${100 / bars - 0.6}%" height="100%" rx="0.6" style="fill:#E29B6D;transform-box:fill-box;transform-origin:50% 100%;animation:wmu ${2.4 + (i % 5) * 0.4}s ease-in-out ${-(n * 4)}s infinite alternate;--h:${h.toFixed(2)}" />`;
    }
    el.innerHTML = `<style>@keyframes wmu { 0% { transform: scaleY(calc(var(--h) * 0.45)); opacity: 0.7; } 100% { transform: scaleY(var(--h)); opacity: 1; } }</style><svg width="100%" height="100%" style="display:block">${rects}</svg>`;
  }, []);
  return (
    <div style={{ width, height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: height * 0.66, lineHeight: 1, color: "#F7EBD3", letterSpacing: "-0.02em", textShadow: "0 1px 0 rgba(255,240,215,0.25), 0 2px 3px rgba(0,0,0,0.65)" }}>D. scribe</span>
      <div ref={ref} style={{ width: "72%", height: Math.max(8, height * 0.18) }} />
    </div>
  );
}

function Engraved({ width, height }: { width: number; height: number }) {
  return (
    <div style={{ width, height, display: "grid", placeItems: "center" }}>
      <span style={{
        fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: height * 0.72, lineHeight: 1, letterSpacing: "-0.02em",
        color: "#3A2410",
        textShadow: "0 1px 0 rgba(255,225,180,0.55), 0 -1px 0 rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.4)",
      }}>D. scribe</span>
    </div>
  );
}

function Ink({ width, height }: { width: number; height: number }) {
  return (
    <div style={{ width, height, display: "grid", placeItems: "center" }}>
      <style>{`@keyframes wm-sheen { 0% { background-position: 120% 0; } 100% { background-position: -20% 0; } }`}</style>
      <span style={{
        fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: height * 0.72, lineHeight: 1, letterSpacing: "-0.02em",
        backgroundImage: "linear-gradient(100deg, #F7EBD3 0%, #F7EBD3 38%, #FFD9A0 48%, #E29B6D 52%, #F7EBD3 62%, #F7EBD3 100%)",
        backgroundSize: "220% 100%", backgroundPosition: "120% 0",
        WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
        animation: "wm-sheen 6s ease-in-out infinite",
        filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.6))",
      }}>D. scribe</span>
    </div>
  );
}
