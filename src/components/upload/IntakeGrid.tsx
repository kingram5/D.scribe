"use client";

// The upload step's four-source intake (2026-08-09, Kyle's ruling on the Resonant inspo):
// numbered plate cards in a print-shop grid — 01 record (the cassette graphic, kept),
// 02 audio files with live per-file transcription rows, 03 YouTube, 04 brainstorm studio.
// Replaces the old 45/55 LeftPanel/RightPanel split. All engine logic arrives via props.

import { ThinkingOrb } from "thinking-orbs";
import CassetteTape from "./CassetteTape";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";

interface IntakeGridProps {
  // record
  isRecording: boolean;
  recordingError?: string;
  seconds: number;
  onToggleRecording: () => void;
  onStopRecording: () => void;
  // files
  files: File[];
  uploading: boolean;
  uploadPercent?: Record<string, number>;
  uploadError?: Record<string, string>;
  progressEntries: [string, string][];
  dragging: boolean;
  setDragging: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // youtube
  youtubeUrl: string;
  setYoutubeUrl: (v: string) => void;
  youtubeError: string;
  setYoutubeError: (v: string) => void;
  onYoutubeFetch: () => void;
  // flow
  canInitialize: boolean;
  allDone: boolean;
  onInitialize: () => void;
  onBrainstorm: () => void;
}

/** Mono label strip across the top of every card: number + name left, state right. */
function CardTop({ l, r, hot, light }: { l: string; r: string; hot?: boolean; light?: boolean }) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 10.5,
        letterSpacing: "0.08em",
        color: light ? "rgba(249,247,242,0.55)" : "var(--text-tertiary)",
        marginBottom: 4,
      }}
    >
      <span>{l}</span>
      <b style={{ fontWeight: 700, color: hot ? "#C17A47" : "inherit", whiteSpace: "nowrap" }}>{r}</b>
    </header>
  );
}

const cardBase: React.CSSProperties = {
  border: "1px solid var(--ds-card-border, rgba(44,36,25,0.1))",
  borderRadius: 14,
  background: "var(--ds-card-bg, rgba(255,255,255,0.6))",
  padding: "20px 24px 24px",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  minHeight: 0,
};

const serifH3: React.CSSProperties = {
  fontFamily: "var(--font-lora), serif",
  fontStyle: "italic",
  fontWeight: 400,
  fontSize: 24,
  lineHeight: 1.1,
  color: "var(--ds-ink)",
  letterSpacing: "-0.01em",
  margin: "14px 0 8px",
  textWrap: "balance" as never,
};

export default function IntakeGrid(p: IntakeGridProps) {
  const transcribing = p.progressEntries.filter(([, s]) => s === "transcribing").length;
  const failed = p.progressEntries.filter(([, s]) => s === "failed").length;
  const sourceState = p.allDone
    ? "✓ SOURCES READY"
    : failed > 0
      ? `${failed} FAILED`
      : transcribing > 0
        ? `TRANSCRIBING · ${transcribing}`
        : p.uploading
          ? "UPLOADING"
          : "DROP OR BROWSE";

  return (
    <div className="ds-intake">
      {/* ── 01 · BRAINSTORM STUDIO — the featured way in (Kyle 2026-08-09:
             "the brainstorm should really be the primarily featured option") ── */}
      <article className="ds-intake-brain" style={{
        ...cardBase,
        background: "radial-gradient(circle at 28% 0%, #3A3023 0%, #2C2419 55%, #241D14 100%)",
        border: "1px solid rgba(193,122,71,0.4)",
        padding: "22px 28px 26px",
      }}>
        <CardTop l="01 / BRAINSTORM STUDIO" r="● LIVE" hot light />
        <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap", marginTop: 12 }}>
          {/* T.H.E.O's live identity. `dark` paints light ink for this near-black card;
              `auto` would resolve against the page and disappear. */}
          <div style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 92, height: 92 }}>
            <ThinkingOrb state="listening" size={64} speed={0.6} theme="dark" aria-label="T.H.E.O, listening" />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ ...serifH3, color: "#F9F7F2", fontSize: 30, margin: "0 0 8px" }}>
              Talk your book into existence.
            </h3>
            <p style={{ fontSize: 14, color: "rgba(249,247,242,0.75)", lineHeight: 1.6, maxWidth: 560, margin: 0 }}>
              Sit down with T.H.E.O, your ghostwriter — already tuned to this book&apos;s reader.
              No script, no blank page. He listens for the book inside the way you tell it.
            </p>
          </div>
          <button
            type="button"
            onClick={p.onBrainstorm}
            style={{
              flexShrink: 0,
              border: "none",
              borderRadius: 12,
              background: "#C17A47",
              color: "#241D14",
              fontFamily: "var(--font-manrope), sans-serif",
              fontSize: 16,
              fontWeight: 700,
              padding: "17px 26px",
              cursor: "pointer",
              boxShadow: "0 0 24px rgba(193,122,71,0.35)",
            }}
          >
            Enter the studio ↗
          </button>
        </div>
      </article>

      {/* ── 02 · RECORD — the cassette stays ─────────────────────────────── */}
      <article className="ds-intake-record" style={{ ...cardBase, background: "var(--ds-paper)", alignItems: "center" }}>
        <div style={{ alignSelf: "stretch" }}>
          <CardTop l="02 / RECORD LIVE" r={p.isRecording ? "● RECORDING" : "STANDBY"} hot={p.isRecording} />
        </div>
        <h3 style={{ ...serifH3, fontSize: 30, textAlign: "center", marginTop: 22 }}>
          Give it your voice, live.
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 300, textAlign: "center", lineHeight: 1.55, marginBottom: 18 }}>
          Hit record and speak naturally. The AI handles the rest.
        </p>

        <CassetteTape
          isRecording={p.isRecording}
          seconds={p.seconds}
          onToggleRecording={p.onToggleRecording}
          onStopRecording={p.onStopRecording}
        />

        <div style={{ marginTop: 18, textAlign: "center", minHeight: 34 }}>
          {!p.isRecording && p.seconds === 0 ? (
            <div className="ds-record-hint" style={{
              fontSize: 19,
              fontWeight: 500,
              color: "var(--ds-ink)",
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6" stroke="var(--ds-ink)" strokeWidth="1.5" fill="none" />
                <circle cx="8" cy="8" r="3" fill="#C17A47" />
              </svg>
              Press to record
            </div>
          ) : p.isRecording ? (
            <div style={{
              fontSize: 19,
              fontWeight: 500,
              color: "var(--ds-ink)",
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}>
              <span className="ds-rec-dot" aria-hidden="true" />
              Recording — speak naturally
            </div>
          ) : null}
          {p.recordingError && (
            <p role="alert" style={{ marginTop: 10, fontSize: 13, fontWeight: 500, color: "#b3462e", maxWidth: 340 }}>
              {p.recordingError}
            </p>
          )}
        </div>

        <div style={{
          marginTop: "auto",
          paddingTop: 18,
          alignSelf: "stretch",
          borderTop: "1px solid rgba(44,36,25,0.08)",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 10,
          letterSpacing: "0.05em",
          color: "var(--text-tertiary)",
        }}>
          <span>15–60 MIN IS THE SWEET SPOT</span>
          <span>QUIET ROOM = CLEANER TEXT</span>
        </div>
      </article>

      {/* ── 02 · AUDIO FILES + the live source ledger ────────────────────── */}
      <article
        style={{
          ...cardBase,
          ...(p.dragging ? { borderColor: "#C17A47", background: "rgba(193,122,71,0.06)" } : null),
        }}
        onDrop={p.handleDrop}
        onDragOver={(e) => { e.preventDefault(); p.setDragging(true); }}
        onDragLeave={() => p.setDragging(false)}
      >
        <CardTop l="03 / AUDIO FILES" r={sourceState} hot={p.allDone || transcribing > 0 || failed > 0} />
        <h3 style={serifH3}>Drop the recordings you already have.</h3>
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {p.dragging ? "Drop to add them to this book." : "MP3, WAV, M4A, MP4 — up to 500 MB each. Combine as many as the book needs."}
        </p>
        <div style={{ marginTop: 14 }}>
          <button type="button" className="transcribe-btn" style={{ padding: "10px 18px" }}
            onClick={() => document.getElementById("file-input-new")?.click()}>
            Choose audio
          </button>
          {p.files.length > 0 && (
            <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 600, color: "var(--ds-accent-500, #A05526)" }}>
              {p.files.length} file{p.files.length !== 1 ? "s" : ""} staged
            </span>
          )}
        </div>
        <input
          id="file-input-new"
          type="file"
          accept="audio/*,video/webm,video/mp4,.mp3,.wav,.m4a,.mp4,.webm,.ogg"
          multiple
          onChange={p.handleFileInput}
          style={{ display: "none" }}
        />

        {/* Source ledger: every staged file / import with its live state */}
        {(p.progressEntries.length > 0 || p.files.length > 0) && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(44,36,25,0.1)", maxHeight: 168, overflowY: "auto" }}>
            {(p.progressEntries.length > 0
              ? p.progressEntries
              : p.files.map((f) => [f.name, "staged"] as [string, string])
            ).map(([name, status]) => {
              const pct = status === "uploading" ? p.uploadPercent?.[name] : undefined;
              const color = STATUS_COLORS[status] || "var(--text-tertiary)";
              return (
                <div key={name} style={{ paddingTop: 12, paddingBottom: 4 }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontSize: 10.5,
                    letterSpacing: "0.04em",
                  }}>
                    <span style={{ color: "var(--ds-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <b style={{ color: status === "staged" ? "var(--text-tertiary)" : color, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {status === "staged"
                        ? "STAGED"
                        : `${(STATUS_LABELS[status] || status).toUpperCase()}${pct != null ? ` · ${pct}%` : ""}`}
                    </b>
                  </div>
                  <div style={{ marginTop: 8, height: 3, background: "rgba(44,36,25,0.08)", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      className={status === "transcribing" ? "ds-bar-active" : undefined}
                      style={{
                        height: "100%",
                        background: color,
                        borderRadius: 2,
                        transformOrigin: "left",
                        transform: `scaleX(${
                          status === "completed" ? 1
                          : status === "uploading" ? (pct ?? 0) / 100
                          : status === "transcribing" ? 1
                          : status === "failed" ? 1
                          : 0
                        })`,
                        transition: "transform 0.3s ease",
                      }}
                    />
                  </div>
                  {status === "failed" && p.uploadError?.[name] && (
                    <p style={{ marginTop: 4, fontSize: 10, color: "#b3462e" }}>{p.uploadError[name]}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>

      {/* ── 03 · YOUTUBE ─────────────────────────────────────────────────── */}
      <article style={cardBase}>
        <CardTop l="04 / YOUTUBE" r="2 INK" hot />
        <h3 style={serifH3}>Bring a public conversation in.</h3>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <input
            type="url"
            placeholder="Paste a YouTube URL"
            aria-label="YouTube URL"
            value={p.youtubeUrl}
            onChange={(e) => { p.setYoutubeUrl(e.target.value); p.setYoutubeError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && p.youtubeUrl.trim()) p.onYoutubeFetch(); }}
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              borderBottom: "1px solid rgba(44,36,25,0.25)",
              background: "none",
              padding: "10px 2px",
              // 16px floor: anything smaller makes iOS focus-zoom the page (M27).
              fontSize: 16,
              color: "var(--ds-ink)",
              outline: "none",
              fontFamily: "var(--font-manrope), sans-serif",
            }}
          />
          <button
            type="button"
            className="transcribe-btn"
            style={{ padding: "8px 16px", flexShrink: 0 }}
            disabled={!p.youtubeUrl.trim() || p.uploading}
            onClick={p.onYoutubeFetch}
          >
            Fetch →
          </button>
        </div>
        {p.youtubeError && (
          <p role="alert" style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{p.youtubeError}</p>
        )}
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 12 }}>
          We import the transcript — never the video.
        </p>
      </article>

    </div>
  );
}
