"use client";
import Link from "next/link";

interface PageShellProps {
  children: React.ReactNode;
  projectId?: string;
  currentStep?: string;
}

const STEPS = [
  { key: "upload", label: "Upload", path: "upload" },
  { key: "transcript", label: "Transcripts", path: "transcript" },
  { key: "analysis", label: "Analysis", path: "analysis" },
  { key: "generate", label: "Generate", path: "generate" },
  { key: "editor", label: "Editor", path: "editor" },
  { key: "export", label: "Export", path: "export" },
];

export default function PageShell({ children, projectId, currentStep }: PageShellProps) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const currentLabel = currentIdx >= 0 ? STEPS[currentIdx].label : "";

  return (
    <div style={{ position: "relative", zIndex: 10, minHeight: "100vh", paddingTop: 88 }}>
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
                color: "#7a7369",
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
              color: "#191816",
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
                      ? "#E05D3A"
                      : i < currentIdx
                        ? "#191816"
                        : "rgba(0,0,0,0.1)",
                    transition: "all 0.2s",
                    display: "block",
                  }}
                />
              ))}
            </div>
            <span style={{
              fontSize: 11,
              color: "#a0978a",
              fontWeight: 500,
            }}>
              {currentIdx + 1} of {STEPS.length}
            </span>
          </div>
        </nav>
      )}
      {children}
    </div>
  );
}
