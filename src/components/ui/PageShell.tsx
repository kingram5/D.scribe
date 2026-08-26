"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGenerationBusy, subscribeGenerationBusy } from "@/lib/generation-guard";
import { TUTORIALS } from "@/components/tutorial/tutorial-content";
import { hasSeenTutorial, markTutorialSeen, isTutorialAutoShowOn } from "@/components/tutorial/tutorial-state";
import StepTutorialModal from "@/components/tutorial/StepTutorialModal";
import CoachmarkTour from "@/components/tutorial/CoachmarkTour";

interface PageShellProps {
  children: React.ReactNode;
  projectId?: string;
  currentStep?: string;
  hideFooterNav?: boolean;
  disableNextStep?: boolean;
  /** Override the next-step button click (e.g. to trigger an action before navigating) */
  onNextClick?: () => void;
  /** Step keys that should appear greyed-out / non-navigable in the step markers */
  disabledStepKeys?: string[];
}

const STEPS = [
  { key: "upload", label: "Upload", path: "upload" },
  { key: "transcript", label: "Transcript", path: "transcript" },
  { key: "structure", label: "Structure", path: "structure" },
  { key: "analysis", label: "Analysis", path: "analysis" },
  { key: "generate", label: "Generate", path: "generate" },
  { key: "editor", label: "Editor", path: "editor" },
  { key: "export", label: "Export", path: "export" },
];

/** Project title for the header rail, cached per session so every step page
 *  doesn't re-fetch it. Falls back to empty (rail renders without a title). */
function useProjectTitle(projectId?: string): string {
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (!projectId) return;
    const cacheKey = `ds_title_${projectId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setTitle(cached);
        return;
      }
    } catch { /* storage unavailable — fetch anyway */ }
    let cancelled = false;
    fetch(`/api/project/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (cancelled || !p?.title) return;
        setTitle(p.title);
        try { sessionStorage.setItem(cacheKey, p.title); } catch { /* ignore */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);
  return title;
}

/** Furthest pipeline step this project has reached, remembered across navigation.
 *  Completion used to be inferred from the CURRENT position, so stepping backward erased the
 *  done-marks on steps the user had genuinely finished and made them unreachable — you had to
 *  click forward one at a time to get back. */
function useReachedStep(projectId: string | undefined, currentIdx: number): number {
  const [reached, setReached] = useState(currentIdx);
  useEffect(() => {
    if (!projectId || currentIdx < 0) return;
    const key = `ds_reached_${projectId}`;
    let stored = -1;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) stored = parseInt(raw, 10);
    } catch { /* storage unavailable — fall back to position only */ }
    const next = Math.max(Number.isNaN(stored) ? -1 : stored, currentIdx);
    setReached(next);
    if (next > stored) {
      try { localStorage.setItem(key, String(next)); } catch { /* ignore */ }
    }
  }, [projectId, currentIdx]);
  return Math.max(reached, currentIdx);
}

function useIsMobile(maxWidth = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);
  return isMobile;
}

function busyProgressNoun(busy: string): string {
  if (/generat/i.test(busy)) return "generation";
  if (/enrich|quote/i.test(busy)) return "enrichment";
  return "analysis";
}

function formatBusyMessage(busy: string, isMobile: boolean): string {
  if (!isMobile) {
    return `${busy} — leaving this page will lose progress`;
  }
  const busySentence = busy.endsWith(".") ? busy : `${busy}.`;
  const progressNoun = busyProgressNoun(busy);
  return `WARNING: ${busySentence} Do not close this page or lock your phone or ${progressNoun} will lose its progress`;
}

export default function PageShell({ children, projectId, currentStep, hideFooterNav, disableNextStep, onNextClick, disabledStepKeys }: PageShellProps) {
  const router = useRouter();
  // Leave-guard: while a page reports generation in progress, every navigation
  // out of the step gets an explicit confirm instead of silently losing work.
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<{ href?: string; action?: () => void } | null>(null);
  useEffect(() => {
    setBusy(getGenerationBusy());
    return subscribeGenerationBusy(() => setBusy(getGenerationBusy()));
  }, []);
  function guardNav(e: React.MouseEvent, href: string) {
    if (!busy) return;
    e.preventDefault();
    setPendingLeave({ href });
  }
  function confirmLeave() {
    const p = pendingLeave;
    setPendingLeave(null);
    if (p?.href) router.push(p.href);
    else if (p?.action) p.action();
  }

  const projectTitle = useProjectTitle(projectId && currentStep ? projectId : undefined);
  const isMobile = useIsMobile();
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const reachedIdx = useReachedStep(projectId, currentIdx);
  const currentLabel = currentIdx >= 0 ? STEPS[currentIdx].label : "";
  const prevStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const nextStep = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;
  const showStepNav = projectId && currentStep && !hideFooterNav && currentIdx >= 0;

  // Step tutorial: an illustrated intro modal shown automatically on the first
  // visit to each step (per browser, across projects), re-openable anytime via
  // the "?" button, with an optional on-page coachmark tour after it.
  const tutorial = currentStep ? TUTORIALS[currentStep] : undefined;
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    if (!tutorial || !currentStep) return;
    if (!isTutorialAutoShowOn() || hasSeenTutorial(currentStep)) return;
    // Small delay so the page renders under the modal first
    const t = setTimeout(() => setTutorialOpen(true), 500);
    return () => clearTimeout(t);
  }, [tutorial, currentStep]);
  function closeTutorial(opts?: { startTour?: boolean }) {
    if (currentStep) markTutorialSeen(currentStep);
    setTutorialOpen(false);
    if (opts?.startTour) setTourOpen(true);
  }

  return (
    <div className={`ds-page-shell ${currentStep ? "paper-theme" : ""} ${showStepNav ? "ds-page-shell--stepnav" : ""}`} style={{ position: "relative", zIndex: 10, paddingTop: 88, display: "flex", flexDirection: "column" }}>
      {projectId && currentStep && (
        <nav
          aria-label="Pipeline steps"
          className="ds-header-rail"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 10,
            padding: "0 40px 14px",
            margin: "0 0 4px",
            borderBottom: "1px solid var(--ds-divider, rgba(44,36,25,0.08))",
            fontFamily: "var(--font-manrope), sans-serif",
          }}
        >
          <div
            className="ds-header-rail__row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
              width: "100%",
            }}
          >
          {/* Back + project identity block */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 auto" }}>
            <Link
              href={`/project/${projectId}`}
              onClick={(e) => guardNav(e, `/project/${projectId}`)}
              aria-label="Back to progress dashboard"
              title="Back to Progress dashboard"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(0,0,0,0.04)",
                textDecoration: "none",
                color: "var(--text-secondary, #6B644F)",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2L4 7l5 5" />
              </svg>
            </Link>
            <div style={{ minWidth: 0 }}>
              {projectTitle && (
                <div className="ds-label" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                  {projectTitle}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{
                  fontSize: 17,
                  fontWeight: 400,
                  color: "var(--text-primary, #2C2419)",
                  fontFamily: "var(--font-playfair), var(--font-lora), serif",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                }}>
                  {currentLabel}
                </span>
                <span className="ds-label ds-label--accent" style={{ whiteSpace: "nowrap" }}>
                  Step {currentIdx + 1} of {STEPS.length}
                </span>
              </div>
            </div>
            {!isMobile && busy && (
              <span
                role="status"
                className="ds-generation-busy-pill"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(193,122,71,0.12)",
                  border: "1px solid rgba(193,122,71,0.35)",
                  color: "#C17A47",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <span className="ds-generation-busy-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#C17A47" }} />
                {formatBusyMessage(busy, false)}
              </span>
            )}
            <style>{`
              @keyframes ds-busy-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
              @media (prefers-reduced-motion: reduce) { .ds-generation-busy-dot { animation: none !important; } }
              @media (prefers-reduced-motion: no-preference) { .ds-generation-busy-dot { animation: ds-busy-pulse 1.2s ease-in-out infinite; } }
              @media (max-width: 900px) { .ds-header-rail .ds-rail-markers { order: 3; width: 100%; justify-content: flex-start; } }
              @media (max-width: 640px) { .ds-header-rail .ds-rail-marker-num { width: 22px; height: 22px; } }
              @media (max-width: 768px) { .ds-rail-ctl { display: none !important; } }
              @media (min-width: 769px) { .ds-mobile-stepnav { display: none !important; } }
              @media (max-width: 768px) { .ds-page-shell--stepnav { padding-bottom: calc(64px + env(safe-area-inset-bottom)); } }
            `}</style>
          </div>

          {/* Numbered step markers */}
          <div className="ds-rail-markers" style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            {STEPS.map((step, i) => {
              const isStepDisabled = disabledStepKeys?.includes(step.key);
              const isCurrent = i === currentIdx;
              // Done and reachable both key off the furthest step reached, not the current
              // one, so navigating backward no longer strips checks off finished steps or
              // traps the user into clicking forward one at a time.
              const isDone = !isCurrent && i <= reachedIdx;
              const isClickable = !isStepDisabled && !isCurrent
                && (i <= reachedIdx || (i === currentIdx + 1 && !disableNextStep));
              const marker = (
                <span
                  className="ds-rail-marker-num"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontSize: 10.5,
                    fontWeight: 700,
                    border: isCurrent
                      ? "1px solid #C17A47"
                      : isDone
                        ? "1px solid rgba(193,122,71,0.55)"
                        : "1px solid var(--ds-input-border, rgba(44,36,25,0.12))",
                    background: isCurrent ? "#C17A47" : "transparent",
                    color: isCurrent
                      ? "#F9F7F2"
                      : isDone
                        ? "#A05526"
                        : isStepDisabled
                          ? "rgba(113,106,83,0.4)"
                          : "var(--text-tertiary, #716A53)",
                    transition: "all 0.2s",
                  }}
                >
                  {isDone ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
              );
              if (isClickable) {
                return (
                  <Link
                    key={step.key}
                    href={`/project/${projectId}/${step.path}`}
                    onClick={(e) => guardNav(e, `/project/${projectId}/${step.path}`)}
                    title={step.label}
                    aria-label={`Go to step ${i + 1}: ${step.label}`}
                    style={{ textDecoration: "none", display: "block" }}
                  >
                    {marker}
                  </Link>
                );
              }
              return (
                <span key={step.key} title={step.label} aria-label={`Step ${i + 1}: ${step.label}${isCurrent ? " (current)" : ""}`}>
                  {marker}
                </span>
              );
            })}
            {tutorial && (
              <button
                onClick={() => { setTourOpen(false); setTutorialOpen(true); }}
                title={`How ${currentLabel} works`}
                aria-label={`Open the guide for the ${currentLabel} step`}
                style={{
                  width: 24,
                  height: 24,
                  marginLeft: 8,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  border: "1px dashed rgba(193,122,71,0.6)",
                  background: "rgba(193,122,71,0.08)",
                  color: "#A05526",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#C17A47"; e.currentTarget.style.color = "#F9F7F2"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(193,122,71,0.08)"; e.currentTarget.style.color = "#A05526"; }}
              >
                ?
              </button>
            )}
          </div>

          {/* Prev / Next controls, in the band (desktop; mobile uses the bottom bar) */}
          {showStepNav && (
            <div className="ds-rail-ctl" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {prevStep && (
                <Link
                  href={`/project/${projectId}/${prevStep.path}`}
                  onClick={(e) => guardNav(e, `/project/${projectId}/${prevStep.path}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 13, fontWeight: 600,
                    color: "var(--text-primary, #2C2419)",
                    textDecoration: "none", transition: "all 0.2s",
                    padding: "9px 16px", minHeight: 38, borderRadius: 9999,
                    border: "1px solid var(--ds-input-border, rgba(44,36,25,0.15))",
                    background: "transparent",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 2L4 7l5 5" />
                  </svg>
                  {prevStep.label}
                </Link>
              )}
              {nextStep && (
                disableNextStep ? (
                  <button
                    disabled
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 13, fontWeight: 600, color: "#F9F7F2",
                      border: "none", cursor: "not-allowed", padding: "9px 18px",
                      minHeight: 38, borderRadius: 9999,
                      background: "var(--ds-accent-400, #C17A47)",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.12)", opacity: 0.4,
                      fontFamily: "var(--font-manrope), sans-serif",
                    }}
                  >
                    {nextStep.label}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 2l5 5-5 5" />
                    </svg>
                  </button>
                ) : onNextClick ? (
                  <button
                    onClick={() => {
                      if (busy && onNextClick) setPendingLeave({ action: onNextClick });
                      else onNextClick?.();
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 13, fontWeight: 600, color: "#F9F7F2",
                      border: "none", cursor: "pointer", padding: "9px 18px",
                      minHeight: 38, borderRadius: 9999,
                      background: "var(--ds-accent-400, #C17A47)",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.12)", transition: "all 0.2s",
                      fontFamily: "var(--font-manrope), sans-serif",
                    }}
                  >
                    {nextStep.label}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 2l5 5-5 5" />
                    </svg>
                  </button>
                ) : (
                  <Link
                    href={`/project/${projectId}/${nextStep.path}`}
                    onClick={(e) => guardNav(e, `/project/${projectId}/${nextStep.path}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 13, fontWeight: 600, color: "#F9F7F2",
                      textDecoration: "none", transition: "all 0.2s", padding: "9px 18px",
                      minHeight: 38, borderRadius: 9999,
                      background: "var(--ds-accent-400, #C17A47)",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                    }}
                  >
                    {nextStep.label}
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 2l5 5-5 5" />
                    </svg>
                  </Link>
                )
              )}
            </div>
          )}
          </div>

          {isMobile && busy && (
            <div role="status" className="ds-generation-busy-banner" aria-live="polite">
              <span className="ds-generation-busy-dot" aria-hidden />
              <span>{formatBusyMessage(busy, true)}</span>
            </div>
          )}
        </nav>
      )}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {children}
      </div>

      {/* Mobile step navigation — fixed to the bottom edge, thumb-reachable.
          Safe-area padding keeps the controls out of the iPhone home-indicator
          strip (requires viewportFit: "cover" in layout.tsx). Hidden on
          desktop, where the header rail carries prev/next. */}
      {showStepNav && (
        <nav
          aria-label="Step navigation"
          className="ds-mobile-stepnav"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "calc(64px + env(safe-area-inset-bottom))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px env(safe-area-inset-bottom)",
            background: "var(--ds-card-bg, rgba(44,36,25,0.95))",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderTop: "1px solid var(--ds-card-border, rgba(249,247,242,0.1))",
            fontFamily: "var(--font-manrope), sans-serif",
            zIndex: 50,
          }}
        >
          {prevStep ? (
            <Link
              href={`/project/${projectId}/${prevStep.path}`}
              onClick={(e) => guardNav(e, `/project/${projectId}/${prevStep.path}`)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 14, fontWeight: 600,
                color: "var(--text-primary, #2C2419)",
                textDecoration: "none", padding: "10px 16px", minHeight: 44,
                borderRadius: 9999,
                border: "1px solid var(--ds-input-border, rgba(44,36,25,0.15))",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2L4 7l5 5" />
              </svg>
              {prevStep.label}
            </Link>
          ) : (
            <div />
          )}
          <span className="ds-label">
            Step {currentIdx + 1} of {STEPS.length}
          </span>
          {nextStep ? (
            disableNextStep ? (
              <button
                disabled
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 14, fontWeight: 600, color: "#F9F7F2",
                  border: "none", cursor: "not-allowed", padding: "10px 18px",
                  minHeight: 44, borderRadius: 9999,
                  background: "var(--ds-accent-400, #C17A47)", opacity: 0.4,
                  fontFamily: "var(--font-manrope), sans-serif",
                }}
              >
                {nextStep.label}
              </button>
            ) : onNextClick ? (
              <button
                onClick={() => {
                  if (busy && onNextClick) setPendingLeave({ action: onNextClick });
                  else onNextClick?.();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 14, fontWeight: 600, color: "#F9F7F2",
                  border: "none", cursor: "pointer", padding: "10px 18px",
                  minHeight: 44, borderRadius: 9999,
                  background: "var(--ds-accent-400, #C17A47)",
                  fontFamily: "var(--font-manrope), sans-serif",
                }}
              >
                {nextStep.label}
              </button>
            ) : (
              <Link
                href={`/project/${projectId}/${nextStep.path}`}
                onClick={(e) => guardNav(e, `/project/${projectId}/${nextStep.path}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 14, fontWeight: 600, color: "#F9F7F2",
                  textDecoration: "none", padding: "10px 18px", minHeight: 44,
                  borderRadius: 9999,
                  background: "var(--ds-accent-400, #C17A47)",
                }}
              >
                {nextStep.label}
              </Link>
            )
          ) : (
            <div />
          )}
        </nav>
      )}

      {/* Leave-while-generating confirm */}
      {pendingLeave && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generation in progress"
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(15,11,7,0.6)", backdropFilter: "blur(4px)",
            padding: 24,
          }}
          onClick={() => setPendingLeave(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 420, width: "100%",
              background: "var(--ds-card-bg, #2C2419)",
              border: "1px solid var(--ds-card-border, rgba(249,247,242,0.15))",
              borderRadius: 20, padding: 32,
              fontFamily: "var(--font-manrope), sans-serif",
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary, #F9F7F2)", margin: 0 }}>
              Still working on this step
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-secondary, #A89F94)", margin: "10px 0 24px" }}>
              {busy || "Generation is in progress"}. If you leave now, this progress will be lost and you&apos;ll have to start it again.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                onClick={() => setPendingLeave(null)}
                autoFocus
                style={{
                  padding: "12px 24px", minHeight: 44, borderRadius: 9999, border: "none",
                  background: "var(--ds-accent-400, #C17A47)", color: "#F9F7F2",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  fontFamily: "var(--font-manrope), sans-serif",
                }}
              >
                Stay on this page
              </button>
              <button
                onClick={confirmLeave}
                style={{
                  padding: "12px 24px", minHeight: 44, borderRadius: 9999,
                  border: "1px solid var(--ds-card-border, rgba(249,247,242,0.2))",
                  background: "transparent", color: "var(--text-secondary, #A89F94)",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  fontFamily: "var(--font-manrope), sans-serif",
                }}
              >
                Continue and leave this page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step guide: intro slides, then the optional on-page spotlight tour */}
      {tutorialOpen && tutorial && (
        <StepTutorialModal
          stepLabel={currentLabel}
          slides={tutorial.slides}
          hasTour={tutorial.coachmarks.length > 0}
          onClose={closeTutorial}
        />
      )}
      {tourOpen && tutorial && (
        <CoachmarkTour steps={tutorial.coachmarks} onClose={() => setTourOpen(false)} />
      )}
    </div>
  );
}
