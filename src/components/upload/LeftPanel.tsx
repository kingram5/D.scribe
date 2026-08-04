"use client";

import CassetteTape from "./CassetteTape";

interface LeftPanelProps {
  isRecording: boolean;
  recordingError?: string;
  seconds: number;
  onToggleRecording: () => void;
  onStopRecording: () => void;
}

export default function LeftPanel({
  isRecording,
  recordingError,
  seconds,
  onToggleRecording,
  onStopRecording,
}: LeftPanelProps) {
  return (
    <div
      className="upload-slide-left"
      style={{
        width: "45%",
        height: "100%",
        background: "var(--ds-paper)",
        borderRight: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "4px 0 24px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "28px 32px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--ds-ink)",
              fontFamily: "var(--font-manrope), sans-serif",
            }}
          >
            D.
          </span>
          <span
            style={{
              fontSize: 22,
              fontWeight: 300,
              color: "var(--ds-ink)",
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
            }}
          >
            scribe
          </span>
        </div>
      </div>

      {/* Centered content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 32px",
          gap: 28,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: "2.4rem",
              lineHeight: 1.15,
              color: "var(--ds-ink)",
              letterSpacing: "-0.02em",
              marginBottom: 12,
            }}
          >
            Live Recording Studio
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-manrope), sans-serif",
              fontWeight: 400,
              maxWidth: 280,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            Your voice becomes your manuscript. Hit record and speak naturally — the AI handles the rest.
          </p>
        </div>

        <CassetteTape
          isRecording={isRecording}
          seconds={seconds}
          onToggleRecording={onToggleRecording}
          onStopRecording={onStopRecording}
        />

        {/* UX hint / status message */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          {!isRecording && seconds === 0 ? (
            <div
              style={{
                fontSize: 39,
                fontWeight: 600,
                color: "var(--ds-ink)",
                fontFamily: "var(--font-lora), serif",
                fontStyle: "italic",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                animation: "hintPulse 2s ease-in-out infinite",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="var(--ds-ink)" strokeWidth="1.5" fill="none" />
                <circle cx="8" cy="8" r="3" fill="var(--ds-ink)" />
              </svg>
              Press to record your audio live
            </div>
          ) : isRecording ? (
            <div
              style={{
                fontSize: 39,
                fontWeight: 600,
                color: "var(--ds-ink)",
                fontFamily: "var(--font-lora), serif",
                fontStyle: "italic",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#ef4444",
                  animation: "hintPulse 1s ease-in-out infinite",
                  boxShadow: "0 0 8px rgba(239,68,68,0.6)",
                  flexShrink: 0,
                }}
              />
              Recording in progress — speak naturally
            </div>
          ) : null}
          {recordingError && (
            <p
              role="alert"
              style={{
                marginTop: 12,
                fontSize: 14,
                fontWeight: 500,
                color: "#b3462e",
                maxWidth: 420,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {recordingError}
            </p>
          )}
        </div>

        <style>{`
          @keyframes hintPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>

        {/* Tips */}
        <div style={{
          maxWidth: 500,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 8,
        }}>
          {[
            "15-60 minutes of audio is the sweet spot",
            "Quiet environment = better transcription",
          ].map((tip, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 33,
              color: "var(--ds-ink)",
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
              lineHeight: 1.3,
            }}>
              <span style={{ color: "var(--ds-ink)", flexShrink: 0, marginTop: 2 }}>&#8226;</span>
              {tip}
            </div>
          ))}
        </div>

      </div>

      {/* Version label */}
      <div
        style={{
          padding: "0 32px 20px",
          fontSize: 10,
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-geist-mono), monospace",
          letterSpacing: "0.06em",
        }}
      >
        D.SCRIBE v1.0
      </div>
    </div>
  );
}
