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
  return (
    <div style={{ position: "relative", zIndex: 10, minHeight: "100vh", paddingTop: 88 }}>
      {projectId && currentStep && (
        <nav aria-label="Pipeline steps" style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 6,
          padding: "0 40px 16px",
        }}>
          <Link
            href={`/project/${projectId}`}
            style={{
              fontSize: 12,
              color: "#a0978a",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Project
          </Link>
          {STEPS.map((step) => (
            <span key={step.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#d4b895" }}>/</span>
              <Link
                href={`/project/${projectId}/${step.path}`}
                aria-current={step.key === currentStep ? "page" : undefined}
                style={{
                  fontSize: 12,
                  color: step.key === currentStep ? "#191816" : "#a0978a",
                  fontWeight: step.key === currentStep ? 600 : 500,
                  textDecoration: "none",
                  transition: "color 0.15s",
                  cursor: "pointer",
                }}
              >
                {step.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
