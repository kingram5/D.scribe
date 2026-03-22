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

  return (
    <div style={{ position: "relative", zIndex: 10, minHeight: "100vh", paddingTop: 88 }}>
      {projectId && currentStep && (
        <nav aria-label="Pipeline steps" style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "0 40px 20px",
          fontFamily: "var(--font-manrope), sans-serif",
        }}>
          <Link
            href={`/project/${projectId}`}
            style={{
              fontSize: 11,
              color: "#a0978a",
              textDecoration: "none",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Project
          </Link>
          {STEPS.map((step, i) => {
            const isCurrent = step.key === currentStep;
            const isDone = i < currentIdx;

            return (
              <span key={step.key} style={{ display: "flex", alignItems: "center" }}>
                <span style={{
                  width: 24,
                  height: 1,
                  background: isDone ? "#E05D3A" : "rgba(0,0,0,0.12)",
                  margin: "0 8px",
                  transition: "background 0.2s",
                }} />
                <Link
                  href={`/project/${projectId}/${step.path}`}
                  aria-current={isCurrent ? "page" : undefined}
                  style={{
                    fontSize: 11,
                    color: isCurrent ? "#191816" : isDone ? "#E05D3A" : "#a0978a",
                    fontWeight: isCurrent ? 700 : 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    transition: "color 0.15s",
                    cursor: "pointer",
                  }}
                >
                  {step.label}
                </Link>
              </span>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
