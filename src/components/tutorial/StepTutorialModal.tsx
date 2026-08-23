"use client";

import { useEffect, useRef, useState } from "react";
import type { TutorialSlide } from "./tutorial-content";
import { isTutorialAutoShowOn, setTutorialAutoShow } from "./tutorial-state";

interface StepTutorialModalProps {
  stepLabel: string;
  slides: TutorialSlide[];
  /** Whether this step has an on-page coachmark tour to hand off to. */
  hasTour: boolean;
  onClose: (opts?: { startTour?: boolean }) => void;
}

/** Illustrated slide carousel shown on first visit to a pipeline step (and any
 *  time via the header "?" button). Dialog semantics follow InkUpgradeModal:
 *  focus moves in on open, Escape and backdrop click close, focus restores. */
export default function StepTutorialModal({ stepLabel, slides, hasTour, onClose }: StepTutorialModalProps) {
  const [idx, setIdx] = useState(0);
  // Lazy init is safe: the modal only ever mounts client-side, post-hydration.
  const [autoShow, setAutoShow] = useState(() => isTutorialAutoShowOn());
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  const slide = slides[idx];
  const isLast = idx === slides.length - 1;
  const multi = slides.length > 1;

  function toggleAutoShow() {
    const next = !autoShow;
    setAutoShow(next);
    setTutorialAutoShow(next);
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
        background: "rgba(15,11,7,0.55)",
        backdropFilter: "blur(4px)",
        padding: 20,
      }}
      onClick={() => onClose()}
    >
      {/* Keyframes for the illustration animations (ds-tut-anim-*) */}
      <style>{`
        @keyframes dsTutPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        @keyframes dsTutBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes dsTutBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes dsTutNudge { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-5px, -5px); } }
        @keyframes dsTutDrag {
          0%, 12% { transform: translate(0, 0); opacity: 1; }
          55%, 82% { transform: translate(146px, -30px); opacity: 1; }
          92% { transform: translate(146px, -30px); opacity: 0; }
          100% { transform: translate(0, 0); opacity: 0; }
        }
        @keyframes dsTutToggle { 0%, 40%, 100% { transform: translateX(0); } 55%, 85% { transform: translateX(-18px); } }
        @keyframes dsTutShimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .ds-tut-anim-pulse { animation: dsTutPulse 1.8s ease-in-out infinite; }
        .ds-tut-anim-blink { animation: dsTutBlink 1.6s ease-in-out infinite; }
        .ds-tut-anim-bob { animation: dsTutBob 2.2s ease-in-out infinite; }
        .ds-tut-anim-nudge { animation: dsTutNudge 1.8s ease-in-out infinite; }
        .ds-tut-anim-drag { animation: dsTutDrag 3.6s ease-in-out infinite; }
        .ds-tut-anim-toggle { animation: dsTutToggle 3s ease-in-out infinite; }
        .ds-tut-anim-shimmer { animation: dsTutShimmer 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ds-tut-anim-pulse, .ds-tut-anim-blink, .ds-tut-anim-bob, .ds-tut-anim-nudge,
          .ds-tut-anim-drag, .ds-tut-anim-toggle, .ds-tut-anim-shimmer { animation: none !important; }
        }
      `}</style>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-tut-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
          width: "100%",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          background: "#F9F7F2",
          border: "1px solid rgba(44,36,25,0.12)",
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          outline: "none",
          fontFamily: "var(--font-manrope), sans-serif",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0" }}>
          <span style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#C17A47",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          }}>
            How {stepLabel} works
          </span>
          <button
            onClick={() => onClose()}
            aria-label="Close guide"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "rgba(44,36,25,0.06)",
              color: "#716A53",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Illustration */}
        {slide.art && (
          <div style={{
            margin: "14px 20px 0",
            padding: "14px 18px",
            background: "#F1EDE3",
            border: "1px solid rgba(44,36,25,0.08)",
            borderRadius: 14,
          }}>
            {slide.art}
          </div>
        )}

        {/* Copy */}
        <div style={{ padding: "18px 24px 0", flex: 1 }}>
          <h2 id="ds-tut-title" style={{
            fontSize: 21,
            fontWeight: 500,
            color: "#2C2419",
            margin: 0,
            fontFamily: "var(--font-playfair), var(--font-lora), serif",
            letterSpacing: "-0.01em",
          }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "#6B644F", margin: "10px 0 0" }}>
            {slide.body}
          </p>
        </div>

        {/* Slide nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 24px 0" }}>
          {multi ? (
            <div style={{ display: "flex", gap: 6 }} aria-label={`Slide ${idx + 1} of ${slides.length}`}>
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  style={{
                    width: i === idx ? 20 : 8,
                    height: 8,
                    borderRadius: 4,
                    border: "none",
                    padding: 0,
                    background: i === idx ? "#C17A47" : "rgba(44,36,25,0.18)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                />
              ))}
            </div>
          ) : <div />}
          <div style={{ display: "flex", gap: 8 }}>
            {multi && idx > 0 && (
              <button
                onClick={() => setIdx(idx - 1)}
                style={{
                  padding: "10px 18px",
                  minHeight: 40,
                  borderRadius: 9999,
                  border: "1px solid rgba(44,36,25,0.15)",
                  background: "transparent",
                  color: "#2C2419",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Back
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setIdx(idx + 1)}
                autoFocus
                style={{
                  padding: "10px 22px",
                  minHeight: 40,
                  borderRadius: 9999,
                  border: "none",
                  background: "#C17A47",
                  color: "#F9F7F2",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: "0 2px 10px rgba(193,122,71,0.3)",
                }}
              >
                Next
              </button>
            ) : (
              <>
                <button
                  onClick={() => onClose()}
                  style={{
                    padding: "10px 18px",
                    minHeight: 40,
                    borderRadius: 9999,
                    border: hasTour ? "1px solid rgba(44,36,25,0.15)" : "none",
                    background: hasTour ? "transparent" : "#C17A47",
                    color: hasTour ? "#2C2419" : "#F9F7F2",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Got it
                </button>
                {hasTour && (
                  <button
                    onClick={() => onClose({ startTour: true })}
                    autoFocus
                    style={{
                      padding: "10px 22px",
                      minHeight: 40,
                      borderRadius: 9999,
                      border: "none",
                      background: "#C17A47",
                      color: "#F9F7F2",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 2px 10px rgba(193,122,71,0.3)",
                    }}
                  >
                    Show me on the page →
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Auto-show toggle */}
        <div style={{ padding: "16px 24px 20px" }}>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 12,
            color: "#716A53",
            cursor: "pointer",
            userSelect: "none",
            width: "fit-content",
          }}>
            <button
              role="switch"
              aria-checked={autoShow}
              onClick={toggleAutoShow}
              style={{
                width: 34,
                height: 19,
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: autoShow ? "#C17A47" : "rgba(44,36,25,0.2)",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
                padding: 0,
              }}
            >
              <span style={{
                position: "absolute",
                top: 2.5,
                left: autoShow ? 17 : 3,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }} />
            </button>
            <span onClick={toggleAutoShow}>
              Show these guides automatically on new pages
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
