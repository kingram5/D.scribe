"use client";
import Link from "next/link";

interface PageShellProps {
  children: React.ReactNode;
  projectId?: string;
  currentStep?: string;
  hideFooterNav?: boolean;
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

export default function PageShell({ children, projectId, currentStep, hideFooterNav }: PageShellProps) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const currentLabel = currentIdx >= 0 ? STEPS[currentIdx].label : "";
  const prevStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const nextStep = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;
  const showFooter = projectId && currentStep && !hideFooterNav && currentIdx >= 0;

  return (
    <div className={`ds-page-shell ${currentStep ? "paper-theme" : ""}`} style={{ position: "relative", zIndex: 10, paddingTop: 88, paddingBottom: showFooter ? 80 : 0, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
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
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(0,0,0,0.04)",
                textDecoration: "none",
                color: "var(--text-secondary, #A89F94)",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
              title="Back to project"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2L4 7l5 5" />
              </svg>
            </Link>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary, #F9F7F2)",
              letterSpacing: "-0.01em",
            }}>
              {currentLabel}
            </span>
          </div>

          {/* Step indicator: "Step 2 of 6" with mini progress dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {STEPS.map((step, i) => (
                <Link
                  key={step.key}
                  href={`/project/${projectId}/${step.path}`}
                  title={step.label}
                  style={{
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
                  }}
                />
              ))}
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
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
            height: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 48px",
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
            <Link
              href={`/project/${projectId}/${nextStep.path}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 15,
                fontWeight: 600,
                color: "#F9F7F2",
                textDecoration: "none",
                transition: "all 0.2s",
                padding: "12px 28px",
                borderRadius: 9999,
                background: "var(--ds-accent-400, #C17A47)",
                boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              }}
            >
              {nextStep.label}
              <svg width="18" height="18" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 2l5 5-5 5" />
              </svg>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      )}
    </div>
  );
}
