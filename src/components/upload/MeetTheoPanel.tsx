"use client";

import TheoIntroVideo from "./TheoIntroVideo";

/**
 * Meet T.H.E.O — variant C (full-bleed), ported from the "D.Scribe Dark Dual Panel"
 * design. Left 38%: the talking-T.H.E.O clip fills the panel, wordmark top-left and
 * the "Meet T.H.E.O" title + org line overlaid at the bottom over a paper fade.
 * Right 62%: the static "Brainstorm with T.H.E.O" pitch (orb, copy, bullets, CTA).
 *
 * Static-pitch-only per Kyle: the CTA/back are wired to the passed callbacks but the
 * live brainstorm chat does not render here. Design tokens are the app's --ds-* set,
 * which defaults dark and matches the dark mockup 1:1.
 */
export default function MeetTheoPanel({
  onStart,
  onBack,
}: {
  onStart?: () => void;
  onBack?: () => void;
}) {
  return (
    <>
      <style>{`
        .mt-cta { background: var(--ds-accent-500); }
        .mt-cta:hover { background: var(--ds-accent-600); }
        .mt-back:hover { color: var(--ds-ink); }
        @media (max-width: 768px) {
          .mt-main { flex-direction: column !important; overflow-y: auto !important; }
          .mt-left, .mt-right { width: 100% !important; }
          .mt-left { min-height: 62vh !important; }
          .mt-right { padding: 40px 28px !important; }
        }
      `}</style>
      <main
        className="mt-main"
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          borderTop: "1px solid var(--ds-divider)",
        }}
      >
        {/* LEFT 38% — full-bleed talking T.H.E.O */}
        <section
          className="mt-left"
          style={{
            width: "38%",
            background: "var(--ds-paper)",
            borderRight: "1px solid var(--ds-divider)",
            boxShadow: "4px 0 24px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            // hidden auto (not bare hidden): a viewport-locked shell clips the panel
            // bottom at short heights otherwise.
            overflow: "hidden auto",
          }}
        >
          <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <TheoIntroVideo fill />
            </div>
            {/* Bottom fade so the overlaid title reads as the same surface */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "42%",
                background: "linear-gradient(to bottom, rgba(44,36,25,0) 0%, var(--ds-paper) 82%)",
                pointerEvents: "none",
              }}
            />
            {/* Wordmark, top-left */}
            <div style={{ position: "absolute", top: 26, left: 34, display: "flex", alignItems: "baseline", gap: 2, textShadow: "0 2px 14px rgba(0,0,0,0.55)" }}>
              <span style={{ font: "700 22px var(--font-manrope), sans-serif", color: "#F9F7F2" }}>D.</span>
              <span style={{ font: "300 italic 22px var(--font-lora), serif", color: "#F9F7F2" }}>scribe</span>
            </div>
            {/* Title + org, overlaid bottom */}
            <div style={{ position: "absolute", left: 40, right: 40, bottom: 34 }}>
              <h1 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 400, fontSize: "2.6rem", lineHeight: 1.05, color: "var(--ds-ink)", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
                Meet T.H.E.O
              </h1>
              <p style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10.5, letterSpacing: "0.09em", color: "var(--ds-accent-500)", margin: 0 }}>
                TECHNICAL HUMAN EXPRESSION ORGANIZER
              </p>
            </div>
          </div>
          <div style={{ padding: "18px 40px 20px", fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.06em" }}>
            D.SCRIBE v1.0
          </div>
        </section>

        {/* RIGHT 62% — static brainstorm pitch */}
        <section
          className="mt-right"
          style={{
            width: "62%",
            background: "var(--ds-surface)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 40,
            padding: "56px 6vw",
            position: "relative",
            overflow: "hidden auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <span
              aria-hidden="true"
              style={{
                alignSelf: "center",
                width: 112,
                height: 112,
                borderRadius: "50%",
                background: "radial-gradient(circle at 40% 35%, #F2B47A, #C17A47)",
                boxShadow: "0 0 60px var(--ds-accent-400)",
              }}
            />
            <h2 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 400, fontSize: "2.4rem", lineHeight: 1.1, color: "var(--ds-ink)", margin: 0, letterSpacing: "-0.01em", maxWidth: "34ch" }}>
              Brainstorm with T.H.E.O
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "40px 48px", alignItems: "start" }}>
            <p style={{ fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0, textWrap: "pretty" }}>
              Your specialized ghostwriter. T.H.E.O interviews the way a good editor does: he listens for the book inside the way you tell it, then asks the question that pulls the next chapter out of you.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, borderLeft: "1px solid var(--ds-divider)", paddingLeft: 28 }}>
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
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <button
              className="mt-cta"
              onClick={onStart}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 16,
                padding: "26px 60px",
                color: "#fff",
                border: "none",
                borderRadius: 100,
                font: "600 27px var(--font-manrope), sans-serif",
                cursor: "pointer",
                boxShadow: "0 8px 32px rgba(224,93,58,0.25)",
              }}
            >
              Start Brainstorming →
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="1" width="6" height="9" rx="3" />
                <path d="M3 7v1a5 5 0 0010 0V7" />
                <path d="M8 13v2" />
              </svg>
              Voice enabled — tap the mic to speak
            </div>
            <button
              className="mt-back"
              onClick={onBack}
              style={{ background: "none", border: "none", fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif" }}
            >
              ← Back to upload options
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
