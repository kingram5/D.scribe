"use client";

import InputCard from "./InputCard";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";

interface RightPanelProps {
  files: File[];
  uploading: boolean;
  progress: Record<string, string>;
  progressEntries: [string, string][];
  dragging: boolean;
  setDragging: (v: boolean) => void;
  youtubeUrl: string;
  setYoutubeUrl: (v: string) => void;
  youtubeError: string;
  setYoutubeError: (v: string) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  canInitialize: boolean;
  allDone: boolean;
  onInitialize: () => void;
  onBrainstorm?: () => void;
}

export default function RightPanel({
  files,
  uploading,
  progress,
  progressEntries,
  dragging,
  setDragging,
  youtubeUrl,
  setYoutubeUrl,
  youtubeError,
  setYoutubeError,
  handleDrop,
  handleFileInput,
  canInitialize,
  allDone,
  onInitialize,
  onBrainstorm,
}: RightPanelProps) {
  return (
    <div
      className="upload-slide-right"
      style={{
        width: "55%",
        height: "100%",
        background: "var(--ds-surface)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Grid pattern overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* System Ready badge */}
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 28,
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(0,0,0,0.06)",
            borderRadius: "var(--radius-pill)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-manrope), sans-serif",
            letterSpacing: "0.04em",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
            }}
          />
          System Ready
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 48px",
          position: "relative",
          zIndex: 1,
          gap: 20,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: "0.02em",
            marginBottom: 4,
          }}
        >
          Or provide a source.
        </h2>

        {/* File upload card */}
        <InputCard
          onClick={() => document.getElementById("file-input-new")?.click()}
        >
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "20px 24px",
            }}
          >
            {/* Upload icon */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: dragging
                  ? "var(--ds-accent-400)"
                  : "rgba(0,0,0,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke={dragging ? "#fff" : "#7a7369"}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 12V3" />
                <path d="M5 7l4-4 4 4" />
                <path d="M2 13v1a2 2 0 002 2h10a2 2 0 002-2v-1" />
              </svg>
            </div>
            <div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ds-ink)",
                  marginBottom: 2,
                }}
              >
                Upload Audio File
              </p>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {dragging
                  ? "Drop to add files"
                  : "MP3, WAV, M4A, MP4 — up to 500 MB"}
              </p>
            </div>
            {files.length > 0 && (
              <div
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ds-accent-500)",
                  background: "var(--accent-light)",
                  padding: "3px 10px",
                  borderRadius: "var(--radius-pill)",
                }}
              >
                {files.length} file{files.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
          <input
            id="file-input-new"
            type="file"
            accept="audio/*,video/webm,video/mp4,.mp3,.wav,.m4a,.mp4,.webm,.ogg"
            multiple
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
        </InputCard>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "0 4px",
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background: "rgba(0,0,0,0.08)",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-tertiary)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Or
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: "rgba(0,0,0,0.08)",
            }}
          />
        </div>

        {/* YouTube card */}
        <InputCard>
          <div style={{ padding: "20px 24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: youtubeUrl || youtubeError ? 12 : 0,
              }}
            >
              {/* YouTube icon */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="#7a7369"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="14" height="10" rx="2" />
                  <path d="M7.5 7l3.5 2-3.5 2V7z" fill="#7a7369" stroke="none" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--ds-ink)",
                    marginBottom: 2,
                  }}
                >
                  YouTube Link
                </p>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  Paste a link — transcript pulled automatically
                </p>
              </div>
            </div>
            {/* URL input — always visible inside card */}
            <input
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => {
                setYoutubeUrl(e.target.value);
                setYoutubeError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && youtubeUrl.trim()) onInitialize();
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                fontSize: 13,
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 8,
                background: "rgba(255,255,255,0.6)",
                color: "var(--ds-ink)",
                outline: "none",
                fontFamily: "var(--font-manrope), sans-serif",
                display: youtubeUrl || youtubeError ? "block" : "none",
              }}
              onClick={(e) => e.stopPropagation()}
            />
            {/* Show input on click if hidden */}
            {!youtubeUrl && !youtubeError && (
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value=""
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                }}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 13,
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.6)",
                  color: "var(--ds-ink)",
                  outline: "none",
                  marginTop: 12,
                  fontFamily: "var(--font-manrope), sans-serif",
                }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {youtubeError && (
              <p
                style={{
                  fontSize: 12,
                  color: "#dc2626",
                  marginTop: 8,
                }}
              >
                {youtubeError}
              </p>
            )}
          </div>
        </InputCard>

        {/* Or divider */}
        {onBrainstorm && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 4px" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
          </div>
        )}

        {/* Brainstorm card */}
        {onBrainstorm && (
          <InputCard onClick={onBrainstorm}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "20px 24px",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7a7369"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ds-ink)", marginBottom: 2 }}>
                  Brainstorm with AI
                </p>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  Talk through your ideas — AI draws out the content
                </p>
              </div>
            </div>
          </InputCard>
        )}

        {/* Progress items */}
        {progressEntries.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 180,
              overflowY: "auto",
            }}
          >
            {progressEntries.map(([key, status]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.8)",
                  borderRadius: 10,
                  padding: "8px 16px",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--ds-ink)",
                    }}
                  >
                    {key}
                  </p>
                  {!files.some((f) => f.name === key) && (
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      YouTube
                    </p>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background:
                        STATUS_COLORS[status] || "#a0978a",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color:
                        STATUS_COLORS[status] || "#a0978a",
                    }}
                  >
                    {STATUS_LABELS[status] || status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* File list summary */}
        {files.length > 0 && progressEntries.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {files.map((file) => (
              <div
                key={file.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(255,255,255,0.5)",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 12,
                  color: "var(--ds-ink)",
                }}
              >
                <span style={{ fontWeight: 500 }}>{file.name}</span>
                <span style={{ color: "var(--text-tertiary)" }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 48px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-geist-mono), monospace",
            letterSpacing: "0.04em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="#a0978a"
            strokeWidth="1.2"
          >
            <rect x="2" y="4" width="8" height="6" rx="1" />
            <path d="M4 4V3a2 2 0 014 0v1" />
          </svg>
          End-to-End Encrypted
        </span>

        <button
          onClick={onInitialize}
          disabled={(!canInitialize && !allDone) || uploading}
          className="transcribe-btn"
        >
          {uploading
            ? "Processing..."
            : allDone
              ? "View Transcripts →"
              : "Transcribe → (1 credit)"}
        </button>
        {onBrainstorm && (
          <button
            onClick={onBrainstorm}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "13px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ds-ink)",
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(25,24,22,0.12)",
              borderRadius: 100,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            Brainstorm Instead →
          </button>
        )}
      </div>
    </div>
  );
}
