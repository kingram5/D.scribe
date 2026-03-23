"use client";

import CassetteTape from "./CassetteTape";

interface LeftPanelProps {
  isRecording: boolean;
  seconds: number;
  onToggleRecording: () => void;
  onStopRecording: () => void;
}

export default function LeftPanel({
  isRecording,
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
            Record live
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
            Speak naturally — the AI adapts to your voice, pacing, and style.
          </p>
        </div>

        <CassetteTape
          isRecording={isRecording}
          seconds={seconds}
          onToggleRecording={onToggleRecording}
          onStopRecording={onStopRecording}
        />

        {/* Recording tips */}
        <div style={{
          maxWidth: 280,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          {[
            "Sermons, keynotes, and podcast episodes work best",
            "15-60 minutes of audio is the sweet spot",
            "Quiet environment = better transcription",
          ].map((tip, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 11,
              color: "var(--text-tertiary)",
              lineHeight: 1.4,
            }}>
              <span style={{ color: "var(--ds-accent-500)", flexShrink: 0, marginTop: 1 }}>&#8226;</span>
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
