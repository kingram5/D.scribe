"use client";

import { useEffect, useRef } from "react";
import TheoIntroVideo from "./TheoIntroVideo";
import TheoOrb from "../ui/TheoOrb";

/**
 * Meet T.H.E.O — the game-lobby scene (Kyle's 8/11 vision, from the
 * "Meet THEO Variant C" design draft). T.H.E.O stands IN a firelit library like
 * a character in a game lobby, not a video on a static page.
 *
 * Layers, back to front:
 *  1. Library scene: a 10s seamless fire/lamp-flicker loop (Seedance-animated
 *     from the FLUX still; the still doubles as poster + reduced-motion fallback)
 *  2. Grade: dim vignette + bottom fade + pulsing ember glow low-left
 *  3. The figure: TheoIntroVideo mode="lobby" — talking intro then idle loop,
 *     edges feathered so his baked-in backdrop dissolves into the scene
 *  4. UI: wordmark, ONLINE status + title bottom-left, frosted-glass pitch panel right
 */
export default function MeetTheoPanel({
  onStart,
  onBack,
}: {
  onStart?: () => void;
  onBack?: () => void;
}) {
  const bgRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Reduced motion: hold the scene on the still; TheoIntroVideo already
    // holds itself on its poster under the same setting.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    bgRef.current?.play().catch(() => {});
  }, []);

  return (
    <>
      <style>{`
        @keyframes theo-ember { 0%, 100% { opacity: .72; } 45% { opacity: 1; } }
        .theo-lobby-cta { background: var(--ds-accent-500); transition: background .15s, transform .15s; }
        .theo-lobby-cta:hover { background: var(--ds-accent-600); transform: translateY(-2px); }
        .theo-lobby-back { transition: color .15s; }
        .theo-lobby-back:hover { color: var(--ds-ink); }
        @media (max-width: 900px) {
          .theo-lobby-panel { position: static !important; width: auto !important; margin: 0 20px 32px !important; }
          .theo-lobby-scene { justify-content: flex-end !important; align-items: flex-end !important; }
          .theo-lobby-figure { opacity: .5 !important; }
          .theo-lobby-title { left: 24px !important; top: 24px !important; }
        }
      `}</style>
      <main
        className="theo-lobby-scene"
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          background: "#1A1610",
          fontFamily: "var(--font-manrope), system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {/* 1 — the library, alive: seamless flicker loop over its own still */}
        <video
          ref={bgRef}
          src="/theo-library.mp4"
          poster="/theo-library.jpg"
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 40%", transform: "scaleX(-1)" }}
        />

        {/* 2 — grade: vignette, ember pulse, bottom fade */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 100% at 50% 30%, rgba(26,22,16,0) 40%, rgba(26,22,16,0.5) 100%)" }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(80% 60% at 82% 78%, rgba(224,140,72,0.28) 0%, rgba(224,140,72,0) 62%)", animation: "theo-ember 7s ease-in-out infinite" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "30%", background: "linear-gradient(to bottom, rgba(26,22,16,0), rgba(20,17,12,0.85))" }} />

        {/* 3 — T.H.E.O, standing in the room */}
        <div
          className="theo-lobby-figure"
          style={{ position: "absolute", left: "10%", bottom: 0, height: "96%", aspectRatio: "816 / 1104" }}
        >
          {/* grounding shadow so he stands on the floor instead of floating */}
          <div aria-hidden="true" style={{ position: "absolute", left: "8%", right: "8%", bottom: 0, height: 80, background: "radial-gradient(50% 50% at 50% 100%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 70%)" }} />
          <TheoIntroVideo mode="lobby" />
        </div>

        {/* 4 — UI. Title block sits top-left, in the wordmark slot. */}
        <div className="theo-lobby-title" style={{ position: "absolute", left: 44, top: 34, zIndex: 2, textShadow: "0 4px 26px rgba(0,0,0,0.85)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 12px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8FBF7F", boxShadow: "0 0 10px #8FBF7F" }} />
            <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, letterSpacing: "0.18em", color: "rgba(249,247,242,0.62)" }}>
              ONLINE — IN THE STUDY
            </span>
          </div>
          <h1 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 400, fontSize: "3rem", lineHeight: 1.02, color: "#F9F7F2", letterSpacing: "-0.02em", margin: "0 0 10px" }}>
            Meet T.H.E.O
          </h1>
          <p style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10.5, letterSpacing: "0.09em", color: "var(--ds-accent-500)", margin: 0 }}>
            TECHNICAL HUMAN EXPRESSION ORGANIZER
          </p>
        </div>

        {/* Frosted-glass pitch panel */}
        <div
          className="theo-lobby-panel"
          style={{
            position: "relative",
            zIndex: 3,
            width: "min(46vw, 600px)",
            marginRight: "10vw",
            padding: "44px 46px 40px",
            borderRadius: 32,
            background: "rgba(30,25,18,0.62)",
            backdropFilter: "blur(26px)",
            WebkitBackdropFilter: "blur(26px)",
            border: "1px solid rgba(249,247,242,0.12)",
            boxShadow: "0 32px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(249,247,242,0.14)",
            display: "flex",
            flexDirection: "column",
            gap: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <TheoOrb state="listening" size={64} display={60} speed={0.5} aria-label="T.H.E.O, listening" style={{ flexShrink: 0 }} />
            <h2 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 400, fontSize: "2.1rem", lineHeight: 1.1, color: "#F9F7F2", margin: 0, letterSpacing: "-0.01em" }}>
              Brainstorm with T.H.E.O
            </h2>
          </div>

          <p style={{ fontSize: 16, color: "#C3B9AC", lineHeight: 1.65, margin: 0, textWrap: "pretty" }}>
            Your specialized ghostwriter. T.H.E.O interviews the way a good editor does: he listens for the book inside the way you tell it, then asks the question that pulls the next chapter out of you.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid rgba(249,247,242,0.1)", paddingTop: 26 }}>
            {[
              "Tuned to your book's reader the moment you chose one",
              "Speak or type — he keeps up either way",
              "Everything you say becomes source material when you hit Finish",
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <span style={{ color: "var(--ds-accent-400)", flexShrink: 0, marginTop: 2 }}>•</span>
                {t}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <button
              className="theo-lobby-cta"
              onClick={onStart}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: "24px 48px",
                color: "#fff",
                border: "none",
                borderRadius: 100,
                font: "600 24px var(--font-manrope), sans-serif",
                cursor: "pointer",
                boxShadow: "0 10px 38px rgba(224,93,58,0.35)",
              }}
            >
              Start Brainstorming →
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(168,159,148,0.75)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="1" width="6" height="9" rx="3" />
                  <path d="M3 7v1a5 5 0 0010 0V7" />
                  <path d="M8 13v2" />
                </svg>
                Voice enabled — tap the mic to speak
              </div>
              <button
                className="theo-lobby-back"
                onClick={onBack}
                style={{ background: "none", border: "none", fontSize: 13, color: "rgba(168,159,148,0.75)", cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif" }}
              >
                ← Back to upload options
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
