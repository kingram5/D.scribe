"use client";

interface CassetteTapeProps {
  isRecording: boolean;
  seconds: number;
  onToggleRecording: () => void;
  onStopRecording: () => void;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function CassetteTape({
  isRecording,
  seconds,
  onToggleRecording,
  onStopRecording,
}: CassetteTapeProps) {
  const status = isRecording ? "Recording" : seconds > 0 ? "Paused" : "Standby";

  return (
    <div className="ds-cassette-wrap" style={{ width: "100%", maxWidth: 700 }}>
      <style>{`
        @media (max-width: 768px) {
          .ds-cassette-wrap { max-width: 100% !important; transform: scale(0.65); transform-origin: top center; margin-bottom: -40px; }
        }
      `}</style>
      {/* Status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isRecording ? "#ef4444" : seconds > 0 ? "#f59e0b" : "#a0978a",
              boxShadow: isRecording ? "0 0 8px rgba(239,68,68,0.6)" : "none",
              transition: "all 0.3s",
            }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: isRecording ? "#ef4444" : "var(--text-secondary)",
              fontFamily: "var(--font-manrope), sans-serif",
            }}
          >
            {status}
          </span>
        </div>
        <span
          style={{
            fontSize: 16,
            fontFamily: "var(--font-geist-mono), monospace",
            color: isRecording ? "#ef4444" : "var(--text-tertiary)",
            fontWeight: 500,
          }}
        >
          {formatTime(seconds)}
        </span>
      </div>

      {/* Device shell */}
      <div
        style={{
          background: "var(--ds-device-base, #EAE8DF)",
          borderRadius: 24,
          padding: 28,
          boxShadow:
            "0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.04)",
          display: "flex",
          gap: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glare overlay */}
        <div className="tape-glare" />

        {/* Left — Speaker grille */}
        <div
          style={{
            width: "35%",
            minHeight: 280,
            borderRadius: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="grill-pattern" />
        </div>

        {/* Right — Tape window + controls */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Tape window */}
          <div
            style={{
              background: "var(--ds-device-dark, #1A1A1A)",
              borderRadius: 14,
              padding: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 32,
              height: 112,
              position: "relative",
            }}
          >
            {/* Left reel */}
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              style={{
                animation: isRecording ? "reelSpin 2s linear infinite" : "none",
              }}
            >
              <circle cx="32" cy="32" r="28" fill="none" stroke="#444" strokeWidth="1.5" />
              <circle cx="32" cy="32" r="20" fill="none" stroke="#555" strokeWidth="1" />
              <circle cx="32" cy="32" r="8" fill="#666" />
              <line x1="32" y1="4" x2="32" y2="12" stroke="#555" strokeWidth="1" />
              <line x1="32" y1="52" x2="32" y2="60" stroke="#555" strokeWidth="1" />
              <line x1="4" y1="32" x2="12" y2="32" stroke="#555" strokeWidth="1" />
              <line x1="52" y1="32" x2="60" y2="32" stroke="#555" strokeWidth="1" />
            </svg>

            {/* Tape head light */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isRecording ? "#ef4444" : "#333",
                boxShadow: isRecording
                  ? "0 0 6px rgba(239,68,68,0.8)"
                  : "none",
                transition: "all 0.3s",
              }}
            />

            {/* Right reel */}
            <svg
              width="64"
              height="64"
              viewBox="0 0 64 64"
              style={{
                animation: isRecording ? "reelSpin 3s linear infinite" : "none",
              }}
            >
              <circle cx="32" cy="32" r="28" fill="none" stroke="#444" strokeWidth="1.5" />
              <circle cx="32" cy="32" r="20" fill="none" stroke="#555" strokeWidth="1" />
              <circle cx="32" cy="32" r="8" fill="#666" />
              <line x1="32" y1="4" x2="32" y2="12" stroke="#555" strokeWidth="1" />
              <line x1="32" y1="52" x2="32" y2="60" stroke="#555" strokeWidth="1" />
              <line x1="4" y1="32" x2="12" y2="32" stroke="#555" strokeWidth="1" />
              <line x1="52" y1="32" x2="60" y2="32" stroke="#555" strokeWidth="1" />
            </svg>
          </div>

          {/* LED display */}
          <div
            style={{
              background: "var(--ds-device-dark, #1A1A1A)",
              borderRadius: 10,
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 56,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontFamily: "var(--font-geist-mono), monospace",
                color: isRecording ? "#ef4444" : "#666",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {isRecording ? "● REC" : "READY"}
            </span>

            {/* Waveform bars */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="wave-bar"
                  style={{
                    width: 4,
                    background: isRecording ? "#ef4444" : "#444",
                    borderRadius: 1,
                    height: isRecording ? undefined : 8,
                    animation: isRecording
                      ? `wavePulse 0.8s ease-in-out ${i * 0.1}s infinite alternate`
                      : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Control buttons */}
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "center",
              paddingTop: 4,
            }}
          >
            {/* Stop button */}
            <button
              onClick={onStopRecording}
              className="btn-3d"
              style={{
                width: 64,
                height: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: "pointer",
                borderRadius: 10,
              }}
              aria-label="Stop"
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  background: "#555",
                  borderRadius: 1,
                }}
              />
            </button>

            {/* Record button */}
            <button
              onClick={onToggleRecording}
              className="btn-3d"
              style={{
                width: 64,
                height: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: "pointer",
                borderRadius: 10,
              }}
              aria-label={isRecording ? "Pause" : "Record"}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  background: isRecording ? "#ef4444" : "#c44",
                  borderRadius: "50%",
                  boxShadow: isRecording
                    ? "0 0 8px rgba(239,68,68,0.5)"
                    : "none",
                  transition: "all 0.2s",
                }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
