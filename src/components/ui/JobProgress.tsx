"use client";

const STEP_LABELS: Record<string, string> = {
  loading: "Loading data...",
  key_points: "Extracting key points",
  voice_and_map: "Building voice profile & mind map",
  generating_outline: "Generating chapter outline...",
  preparing: "Preparing...",
  loading_context: "Loading context...",
  generating: "Writing chapter",
  generating_foreword: "Writing foreword...",
  coherence: "Reviewing transitions",
  applying: "Applying revisions...",
};

interface JobProgressProps {
  progress: { step: string; [key: string]: unknown } | null;
  error: string | null;
  status: string;
  onRetry?: () => void;
}

export default function JobProgress({ progress, error, status, onRetry }: JobProgressProps) {
  if (status === "failed" && error) {
    return (
      <div style={{
        padding: "16px 20px",
        background: "rgba(220,38,38,0.06)",
        border: "1px solid rgba(220,38,38,0.15)",
        borderRadius: "var(--radius-sm)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>Failed</div>
          <div style={{ fontSize: 12, color: "#7a7369", marginTop: 2 }}>{error}</div>
        </div>
        {onRetry && (
          <button onClick={onRetry} className="nodum-btn-ghost" style={{ fontSize: 12 }}>
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!progress && (status === "pending" || status === "running")) {
    return (
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div className="nodum-spinner" style={{ width: 16, height: 16 }} />
        <span style={{ fontSize: 13, color: "#7a7369" }}>Starting...</span>
      </div>
    );
  }

  if (!progress) return null;

  const label = STEP_LABELS[progress.step] || progress.step;
  const detail = progress.chunk
    ? ` (${progress.chunk}/${progress.totalChunks})`
    : progress.batch
      ? ` (batch ${progress.batch}/${progress.totalBatches})`
      : progress.chapter
        ? ` ${progress.chapter}`
        : "";

  return (
    <div style={{
      padding: "16px 20px",
      background: "rgba(25,24,22,0.03)",
      border: "1px solid rgba(0,0,0,0.06)",
      borderRadius: "var(--radius-sm)",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div className="nodum-spinner" style={{ width: 16, height: 16 }} />
      <span style={{ fontSize: 13, color: "#191816", fontWeight: 500 }}>
        {label}{detail}
      </span>
    </div>
  );
}
