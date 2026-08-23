"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoachmarkStep } from "./tutorial-content";

interface CoachmarkTourProps {
  steps: CoachmarkStep[];
  onClose: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 320;
const GAP = 14;

function findTarget(step: CoachmarkStep): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tut="${step.target}"]`);
}

/** On-page spotlight tour: dims the page with a cutout over the real UI
 *  element for each stop and anchors an explainer card beside it. Stops whose
 *  target isn't in the DOM (state-dependent panels) are skipped silently. */
export default function CoachmarkTour({ steps, onClose }: CoachmarkTourProps) {
  // Resolve which stops are actually on this screen, once, at tour start.
  const available = useMemo(() => steps.filter((s) => findTarget(s)), [steps]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const step = available[idx] as CoachmarkStep | undefined;

  // Nothing to point at (e.g. empty state) — bail out immediately.
  useEffect(() => {
    if (available.length === 0) onCloseRef.current();
  }, [available]);

  const measure = useCallback(() => {
    if (!step) return;
    const el = findTarget(step);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Bring the target into view, then track it through scroll/resize/layout.
  useEffect(() => {
    if (!step) return;
    const el = findTarget(step);
    if (el) {
      const r = el.getBoundingClientRect();
      const fullyVisible = r.top >= 0 && r.bottom <= window.innerHeight;
      if (!fullyVisible) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // First measurement happens on the rAF loop's first frame below.
    // Capture-phase scroll listener catches nested scroll containers too
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    const ro = el ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    // Smooth scrolling settles over ~300-500ms; a short rAF loop keeps the
    // spotlight glued to the target while it travels.
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      measure();
      if (performance.now() - start < 700) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [step, measure]);

  // Keyboard: Escape closes, arrows navigate.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, available.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [available.length]);

  if (!step || !rect) return null;

  const isLast = idx === available.length - 1;

  // Card placement: below the target if it fits, otherwise above; clamped to
  // the viewport horizontally. Falls back to vertical centering when the
  // target dominates the screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(CARD_W, vw - 24);
  const estCardH = 170;
  let cardTop: number;
  const spaceBelow = vh - (rect.top + rect.height + PAD);
  const spaceAbove = rect.top - PAD;
  if (spaceBelow >= estCardH + GAP) cardTop = rect.top + rect.height + PAD + GAP;
  else if (spaceAbove >= estCardH + GAP) cardTop = rect.top - PAD - GAP - estCardH;
  else cardTop = Math.max(12, Math.min(vh - estCardH - 12, rect.top + rect.height / 2 - estCardH / 2));
  const cardLeft = Math.max(12, Math.min(vw - cardW - 12, rect.left + rect.width / 2 - cardW / 2));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: "var(--z-toast)" }}>
      {/* Click shield — keeps the page inert during the tour; clicking the
          dimmed area advances, which is the least surprising affordance. */}
      <div
        onClick={() => (isLast ? onClose() : setIdx(idx + 1))}
        style={{ position: "absolute", inset: 0, cursor: "pointer" }}
        aria-hidden="true"
      />
      {/* Spotlight cutout */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(15,11,7,0.6)",
          border: "2px solid #C17A47",
          pointerEvents: "none",
          transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease",
        }}
      />
      {/* Explainer card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={step.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: cardTop,
          left: cardLeft,
          width: cardW,
          background: "#F9F7F2",
          border: "1px solid rgba(44,36,25,0.14)",
          borderRadius: 16,
          padding: "18px 20px 16px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
          fontFamily: "var(--font-manrope), sans-serif",
          outline: "none",
          transition: "top 0.25s ease, left 0.25s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{
            fontSize: 15.5,
            fontWeight: 500,
            color: "#2C2419",
            margin: 0,
            fontFamily: "var(--font-playfair), var(--font-lora), serif",
          }}>
            {step.title}
          </h3>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#C17A47",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            whiteSpace: "nowrap",
          }}>
            {idx + 1} / {available.length}
          </span>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "#6B644F", margin: "8px 0 14px" }}>
          {step.body}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              fontSize: 12,
              fontWeight: 600,
              color: "#948C75",
              cursor: "pointer",
              padding: "6px 0",
              fontFamily: "inherit",
            }}
          >
            Skip tour
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {idx > 0 && (
              <button
                onClick={() => setIdx(idx - 1)}
                style={{
                  padding: "8px 14px",
                  minHeight: 36,
                  borderRadius: 9999,
                  border: "1px solid rgba(44,36,25,0.15)",
                  background: "transparent",
                  color: "#2C2419",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? onClose() : setIdx(idx + 1))}
              style={{
                padding: "8px 18px",
                minHeight: 36,
                borderRadius: 9999,
                border: "none",
                background: "#C17A47",
                color: "#F9F7F2",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 2px 10px rgba(193,122,71,0.3)",
              }}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
