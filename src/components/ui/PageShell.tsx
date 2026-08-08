"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGenerationBusy, subscribeGenerationBusy } from "@/lib/generation-guard";

interface PageShellProps {
  children: React.ReactNode;
  projectId?: string;
  currentStep?: string;
  hideFooterNav?: boolean;
  disableNextStep?: boolean;
  /** Override the next-step button click (e.g. to trigger an action before navigating) */
  onNextClick?: () => void;
  /** Step keys that should appear greyed-out / non-navigable in the dot progress bar */
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

  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const currentLabel = currentIdx >= 0 ? STEPS[currentIdx].label : "";
  const prevStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const nextStep = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;
  const showFooter = projectId && currentStep && !hideFooterNav && currentIdx >= 0;

  return (
    <div className={`ds-page-shell ${currentStep ? "paper-theme" : ""}`} style={{ position: "relative", zIndex: 10, paddingTop: 88, paddingBottom: showFooter ? 80 : 0, display: "flex", flexDirection: "column" }}>
      {projectId && currentStep && (
        <nav
          aria-label="Pipeline steps"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 40px 20px",
            fontFamily: "var(--font-manrope), sans-serif",
          }}
        >
          {/* Back arrow + current step label */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              href={`/project/${projectId}`}
              onClick={(e) => guardNav(e, `/project/${projectId}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px 5px 8px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.04)",
                textDecoration: "none",
                color: "var(--text-secondary, #A89F94)",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
              title="Back to Progress dashboard"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2L4 7l5 5" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                Progress dashboard
              </span>
            </Link>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary, #F9F7F2)",
              letterSpacing: "-0.01em",
            }}>
              {currentLabel}
            </span>
            {busy && (
              <span
                role="status"
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
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C17A47", animation: "ds-busy-pulse 1.2s ease-in-out infinite" }} />
                {busy} — leaving this page will lose progress
              </span>
            )}
            <style>{`
              @keyframes ds-busy-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
              @media (prefers-reduced-motion: reduce) { .ds-page-shell [role="status"] span { animation: none !important; } }
            `}</style>
          </div>

          {/* Step indicator: "Step 2 of 6" with mini progress dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {STEPS.map((step, i) => {
                const isStepDisabled = disabledStepKeys?.includes(step.key);
                const isClickable = !isStepDisabled && (i < currentIdx || (i === currentIdx + 1 && !disableNextStep));
                const dotStyle = {
                  width: i === currentIdx ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === currentIdx
                    ? "#C17A47"
                    : i < currentIdx
                      ? "var(--text-primary, #F9F7F2)"
                      : "rgba(0,0,0,0.08)",
                  transition: "all 0.2s",
                  display: "block",
                  cursor: isClickable ? "pointer" : "default",
                };
                if (isClickable) {
                  return (
                    <Link
                      key={step.key}
                      href={`/project/${projectId}/${step.path}`}
                      onClick={(e) => guardNav(e, `/project/${projectId}/${step.path}`)}
                      title={step.label}
                      style={dotStyle}
                    />
                  );
                }
                return (
                  <span
                    key={step.key}
                    title={step.label}
                    style={dotStyle}
                  />
                );
              })}
            </div>
            <span style={{
              fontSize: 11,
              color: "rgba(168,159,148,0.7)",
              fontWeight: 500,
            }}>
              {currentIdx + 1} of {STEPS.length}
            </span>
          </div>
        </nav>
      )}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {children}
      </div>

      {/* Prev / Next footer bar */}
      {showFooter && (
        <nav
          aria-label="Step navigation"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            // Safe-area padding keeps the Prev/Next controls out of the iPhone
            // home-indicator strip (requires viewportFit: "cover" in layout.tsx,
            // without which the inset resolves to 0 and this is a no-op on
            // desktop). Height grows by the same amount so content is unmoved.
            height: "calc(80px + env(safe-area-inset-bottom))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 48px env(safe-area-inset-bottom)",
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
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary, #F9F7F2)",
                textDecoration: "none",
                transition: "all 0.2s",
                padding: "12px 24px",
                borderRadius: 9999,
                border: "1px solid var(--ds-card-border, rgba(249,247,242,0.15))",
                background: "transparent",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2L4 7l5 5" />
              </svg>
              {prevStep.label}
            </Link>
          ) : (
            <div />
          )}

          <span style={{ fontSize: 12, color: "rgba(168,159,148,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Step {currentIdx + 1} of {STEPS.length}
          </span>

          {nextStep ? (
            disableNextStep ? (
              <button
                disabled
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  fontSize: 15, fontWeight: 600, color: "#F9F7F2",
                  border: "none", cursor: "not-allowed", padding: "12px 28px",
                  borderRadius: 9999, background: "var(--ds-accent-400, #C17A47)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.2)", opacity: 0.4,
                  fontFamily: "var(--font-manrope), sans-serif",
                }}
              >
                {nextStep.label}
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  display: "flex", alignItems: "center", gap: 12,
                  fontSize: 15, fontWeight: 600, color: "#F9F7F2",
                  border: "none", cursor: "pointer", padding: "12px 28px",
                  borderRadius: 9999, background: "var(--ds-accent-400, #C17A47)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.2)", transition: "all 0.2s",
                  fontFamily: "var(--font-manrope), sans-serif",
                }}
              >
                {nextStep.label}
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 2l5 5-5 5" />
                </svg>
              </button>
            ) : (
              <Link
                href={`/project/${projectId}/${nextStep.path}`}
                onClick={(e) => guardNav(e, `/project/${projectId}/${nextStep.path}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  fontSize: 15, fontWeight: 600, color: "#F9F7F2",
                  textDecoration: "none", transition: "all 0.2s", padding: "12px 28px",
                  borderRadius: 9999, background: "var(--ds-accent-400, #C17A47)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                }}
              >
                {nextStep.label}
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 2l5 5-5 5" />
                </svg>
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
    </div>
  );
}
