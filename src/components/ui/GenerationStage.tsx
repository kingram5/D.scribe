"use client";

// Full-attention generation overlay (Kyle's note 11, 2026-08-09): a centred panel at
// ~50% of the viewport that owns the screen while chapters are being written, so the
// work is obviously happening and clicking away feels like the wrong move.
//
// The orb states come from `thinking-orbs` — a canvas component, hence client-only.
// Theme is pinned `dark` because this panel is always on the near-black stage; `auto`
// would resolve against the host page and paint dark ink on dark.

import { useEffect, useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { createPortal } from "react-dom";

/** The cycle. Order is the felt order of the work, not the literal pipeline. */
const PHASES: { state: OrbState; text: string }[] = [
  { state: "composing", text: "Composing the narrative..." },
  { state: "searching", text: "Gathering context..." },
  { state: "shaping", text: "Finding the right shape..." },
  { state: "working", text: "Following the thread..." },
  { state: "connecting", text: "Connecting the key points..." },
  { state: "solving", text: "Citing sources..." },
];

/** The coherence pass is a real, nameable stage — when it's running, say so and stop cycling. */
const COHERENCE = { state: "solving" as OrbState, text: "Performing coherence pass..." };

const PHASE_MS = 4200;

interface GenerationStageProps {
  open: boolean;
  /** Pins the panel to the coherence phase instead of cycling. */
  coherence?: boolean;
  /** e.g. "Chapter 3 of 8" — the honest progress line under the phase. */
  progressLabel?: string;
  /** 0–1; omitted renders no bar. */
  progress?: number;
  /** Lets the author drop back to watch the prose stream in. */
  onWatch?: () => void;
}

export default function GenerationStage({ open, coherence, progressLabel, progress, onWatch }: GenerationStageProps) {
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Cycle phases while open. Coherence pins, so no timer runs then.
  useEffect(() => {
    if (!open || coherence) return;
    const t = setInterval(() => setI((n) => (n + 1) % PHASES.length), PHASE_MS);
    return () => clearInterval(t);
  }, [open, coherence]);

  // Reset to the first phase on each new run so it never opens mid-cycle.
  useEffect(() => { if (open) setI(0); }, [open]);

  // Keep focus inside the panel while it owns the screen.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || !mounted) return null;

  const phase = coherence ? COHERENCE : PHASES[i];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Writing your chapters"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 220,
        display: "grid",
        placeItems: "center",
        background: "rgba(20, 16, 11, 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        padding: 24,
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ds-gen-stage"
        style={{
          width: "min(72vw, 720px)",
          minHeight: "min(52vh, 460px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          padding: "48px 44px",
          borderRadius: 18,
          background: "radial-gradient(circle at 50% 12%, #3A3023 0%, #2C2419 55%, #241D14 100%)",
          border: "1px solid rgba(193,122,71,0.35)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.5)",
          outline: "none",
          textAlign: "center",
        }}
      >
        <span className="ds-label" style={{ color: "rgba(249,247,242,0.5)", letterSpacing: "0.14em", fontSize: 10 }}>
          {coherence ? "FINAL PASS" : "WRITING LIVE"}
        </span>

        <ThinkingOrb key={phase.state} state={phase.state} size={64} theme="dark" />

        <p
          key={phase.text}
          className="ds-gen-phase"
          style={{
            fontFamily: "var(--font-lora), serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: "clamp(22px, 2.6vw, 30px)",
            lineHeight: 1.2,
            color: "#F9F7F2",
            margin: 0,
            textWrap: "balance",
          }}
        >
          {phase.text}
        </p>

        {progressLabel && (
          <p style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "rgba(249,247,242,0.6)",
            margin: 0,
          }}>
            {progressLabel}
          </p>
        )}

        {typeof progress === "number" && (
          <div style={{ width: "min(320px, 70%)", height: 3, background: "rgba(249,247,242,0.14)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: "100%",
              transform: `scaleX(${Math.max(0, Math.min(1, progress))})`,
              transformOrigin: "left",
              background: "#C17A47",
              transition: "transform 0.4s ease",
            }} />
          </div>
        )}

        <p style={{ fontSize: 12.5, color: "rgba(249,247,242,0.45)", margin: 0, maxWidth: 420, lineHeight: 1.5 }}>
          Leaving this page stops the run. This usually takes a few minutes.
        </p>

        {onWatch && (
          <button
            type="button"
            onClick={onWatch}
            style={{
              border: "1px solid rgba(249,247,242,0.25)",
              background: "transparent",
              color: "rgba(249,247,242,0.8)",
              fontFamily: "var(--font-manrope), sans-serif",
              fontSize: 13,
              borderRadius: 9999,
              padding: "9px 18px",
              cursor: "pointer",
            }}
          >
            Watch it write instead
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
