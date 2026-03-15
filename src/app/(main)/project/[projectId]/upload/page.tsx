"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import GlassCard from "@/components/ui/GlassCard";
import PageShell from "@/components/ui/PageShell";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";

type InputMode = "file" | "youtube";

export default function UploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeError, setYoutubeError] = useState("");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("audio/")
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  async function uploadAll() {
    setUploading(true);

    for (const file of files) {
      setProgress((p) => ({ ...p, [file.name]: "uploading" }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", projectId);

      const res = await fetch("/api/audio/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const upload = await res.json();
        setProgress((p) => ({ ...p, [file.name]: "transcribing" }));

        // Auto-transcribe
        const txRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_upload_id: upload.id }),
        });

        setProgress((p) => ({
          ...p,
          [file.name]: txRes.ok ? "done" : "failed",
        }));
      } else {
        setProgress((p) => ({ ...p, [file.name]: "failed" }));
      }
    }

    setUploading(false);
  }

  async function handleYoutubeSubmit() {
    if (!youtubeUrl.trim()) return;
    setYoutubeError("");
    setUploading(true);

    const label = youtubeUrl.length > 50
      ? youtubeUrl.substring(0, 50) + "..."
      : youtubeUrl;

    setProgress((p) => ({ ...p, [label]: "fetching" }));

    const res = await fetch("/api/audio/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtube_url: youtubeUrl, project_id: projectId }),
    });

    if (res.ok) {
      const result = await res.json();
      // Supadata returns transcript directly — no separate transcribe step needed
      setProgress((p) => ({ ...p, [label]: result.transcribed ? "done" : "failed" }));
    } else {
      const err = await res.json();
      setYoutubeError(err.error || "Failed to get transcript");
      setProgress((p) => ({ ...p, [label]: "failed" }));
    }

    setYoutubeUrl("");
    setUploading(false);
  }

  const progressEntries = Object.entries(progress);
  const allDone =
    progressEntries.length > 0 &&
    progressEntries.every(([, status]) => status === "done");

  return (
    <PageShell projectId={projectId} currentStep="upload">
      <div style={{ padding: "0 40px 40px" }}>
        <GlassCard style={{ maxWidth: 640, margin: "0 auto", padding: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#191816", marginBottom: 8 }}>
            Upload Audio
          </h1>
          <p style={{ fontSize: 14, color: "#7a7369", marginBottom: 24 }}>
            Upload sermons, lectures, or speeches. We support MP3, WAV, M4A, MP4, and YouTube links.
          </p>

          {/* Mode toggle */}
          <div style={{
            display: "flex",
            gap: 0,
            marginBottom: 24,
            background: "rgba(255,255,255,0.3)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}>
            <button
              onClick={() => setInputMode("file")}
              style={{
                flex: 1,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: inputMode === "file" ? "rgba(25,24,22,0.9)" : "transparent",
                color: inputMode === "file" ? "#fff" : "#7a7369",
                transition: "all 0.15s",
              }}
            >
              File Upload
            </button>
            <button
              onClick={() => setInputMode("youtube")}
              style={{
                flex: 1,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: inputMode === "youtube" ? "rgba(25,24,22,0.9)" : "transparent",
                color: inputMode === "youtube" ? "#fff" : "#7a7369",
                transition: "all 0.15s",
              }}
            >
              YouTube Link
            </button>
          </div>

          {/* File drop zone */}
          {inputMode === "file" && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => document.getElementById("file-input")?.click()}
              style={{
                marginBottom: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 180,
                background: dragging ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)",
                border: `1.5px dashed ${dragging ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.15)"}`,
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
                gap: 8,
              }}
            >
              <p style={{ fontSize: 15, fontWeight: 500, color: "#191816" }}>Drop audio files here</p>
              <p style={{ fontSize: 13, color: "#7a7369" }}>or click to browse</p>
              <input
                id="file-input"
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFileInput}
                style={{ display: "none" }}
              />
            </div>
          )}

          {/* YouTube URL input */}
          {inputMode === "youtube" && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => { setYoutubeUrl(e.target.value); setYoutubeError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !uploading) handleYoutubeSubmit(); }}
                  disabled={uploading}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    fontSize: 14,
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(255,255,255,0.6)",
                    color: "#191816",
                    outline: "none",
                  }}
                />
              </div>
              {youtubeError && (
                <p style={{ fontSize: 12, color: "#dc2626", marginTop: 8 }}>{youtubeError}</p>
              )}
              <p style={{ fontSize: 12, color: "#a0978a", marginTop: 8 }}>
                Paste a YouTube link and we'll pull the transcript automatically.
              </p>
            </div>
          )}

          {/* File list (for file mode) */}
          {inputMode === "file" && files.length > 0 && (
            <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              {files.map((file) => (
                <div
                  key={file.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.8)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 16px",
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#191816" }}>{file.name}</p>
                    <p style={{ fontSize: 11, color: "#a0978a" }}>
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  {progress[file.name] && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: STATUS_COLORS[progress[file.name]] || "#a0978a",
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: STATUS_COLORS[progress[file.name]] || "#a0978a" }}>
                        {STATUS_LABELS[progress[file.name]] || progress[file.name]}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Progress list (for youtube items and completed items) */}
          {progressEntries.filter(([key]) => !files.some((f) => f.name === key)).length > 0 && (
            <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
              {progressEntries
                .filter(([key]) => !files.some((f) => f.name === key))
                .map(([key, status]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "rgba(255,255,255,0.6)",
                      border: "1px solid rgba(255,255,255,0.8)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 16px",
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#191816" }}>{key}</p>
                      <p style={{ fontSize: 11, color: "#a0978a" }}>YouTube</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: STATUS_COLORS[status] || "#a0978a",
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: STATUS_COLORS[status] || "#a0978a" }}>
                        {STATUS_LABELS[status] || status}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            {!allDone && inputMode === "file" && (
              <button
                onClick={uploadAll}
                disabled={files.length === 0 || uploading}
                className="nodum-btn"
              >
                {uploading ? "Processing..." : `Upload & Transcribe (${files.length})`}
              </button>
            )}
            {!allDone && inputMode === "youtube" && (
              <button
                onClick={handleYoutubeSubmit}
                disabled={!youtubeUrl.trim() || uploading}
                className="nodum-btn"
              >
                {uploading ? "Fetching transcript..." : "Get Transcript"}
              </button>
            )}
            {allDone && (
              <button
                onClick={() => router.push(`/project/${projectId}/transcript`)}
                className="nodum-btn"
              >
                View Transcripts
              </button>
            )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
