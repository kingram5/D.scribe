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
    <div style={{ width: "100%", maxWidth: 380 }}>
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
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: isRecording ? "#ef4444" : seconds > 0 ? "#f59e0b" : "#a0978a",
              boxShadow: isRecording ? "0 0 8px rgba(239,68,68,0.6)" : "none",
              transition: "all 0.3s",
            }}
          />
          <span
            style={{
              fontSize: 11,
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
            fontSize: 12,
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
          borderRadius: 16,
          padding: 14,
          boxShadow:
            "0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.04)",
          display: "flex",
          gap: 12,
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
            minHeight: 140,
            borderRadius: 10,
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
              borderRadius: 8,
              padding: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              height: 56,
              position: "relative",
            }}
          >
            {/* Left reel */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              style={{
                animation: isRecording ? "reelSpin 2s linear infinite" : "none",
              }}
            >
              <circle cx="16" cy="16" r="14" fill="none" stroke="#444" strokeWidth="1.5" />
              <circle cx="16" cy="16" r="10" fill="none" stroke="#555" strokeWidth="1" />
              <circle cx="16" cy="16" r="4" fill="#666" />
              <line x1="16" y1="2" x2="16" y2="6" stroke="#555" strokeWidth="1" />
              <line x1="16" y1="26" x2="16" y2="30" stroke="#555" strokeWidth="1" />
              <line x1="2" y1="16" x2="6" y2="16" stroke="#555" strokeWidth="1" />
              <line x1="26" y1="16" x2="30" y2="16" stroke="#555" strokeWidth="1" />
            </svg>

            {/* Tape head light */}
            <div
              style={{
                width: 4,
                height: 4,
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
              width="32"
              height="32"
              viewBox="0 0 32 32"
              style={{
                animation: isRecording ? "reelSpin 3s linear infinite" : "none",
              }}
            >
              <circle cx="16" cy="16" r="14" fill="none" stroke="#444" strokeWidth="1.5" />
              <circle cx="16" cy="16" r="10" fill="none" stroke="#555" strokeWidth="1" />
              <circle cx="16" cy="16" r="4" fill="#666" />
              <line x1="16" y1="2" x2="16" y2="6" stroke="#555" strokeWidth="1" />
              <line x1="16" y1="26" x2="16" y2="30" stroke="#555" strokeWidth="1" />
              <line x1="2" y1="16" x2="6" y2="16" stroke="#555" strokeWidth="1" />
              <line x1="26" y1="16" x2="30" y2="16" stroke="#555" strokeWidth="1" />
            </svg>
          </div>

          {/* LED display */}
          <div
            style={{
              background: "var(--ds-device-dark, #1A1A1A)",
              borderRadius: 6,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 32,
            }}
          >
            <span
              style={{
                fontSize: 9,
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
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="wave-bar"
                  style={{
                    width: 2,
                    background: isRecording ? "#ef4444" : "#444",
                    borderRadius: 1,
                    height: isRecording ? undefined : 4,
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
              gap: 8,
              justifyContent: "center",
              paddingTop: 4,
            }}
          >
            {/* Stop button */}
            <button
              onClick={onStopRecording}
              className="btn-3d"
              style={{
                width: 36,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: "pointer",
                borderRadius: 6,
              }}
              aria-label="Stop"
            >
              <div
                style={{
                  width: 10,
                  height: 10,
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
                width: 36,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: "pointer",
                borderRadius: 6,
              }}
              aria-label={isRecording ? "Pause" : "Record"}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
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
