"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MeetTheoPanel from "@/components/upload/MeetTheoPanel";
import PageShell from "@/components/ui/PageShell";
import IntakeGrid from "@/components/upload/IntakeGrid";
import { useUploadEngine } from "./useUploadEngine";

export default function UploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const engine = useUploadEngine(projectId);
  const [showBrainstorm, setShowBrainstorm] = useState(false);

  function handleInitialize() {
    if (engine.allDone) {
      router.push(`/project/${projectId}/transcript`);
      return;
    }
    if (engine.files.length > 0) {
      engine.uploadAll();
    } else if (engine.youtubeUrl.trim()) {
      engine.handleYoutubeSubmit();
    }
  }

  return (
    <PageShell projectId={projectId} currentStep="upload">
      {!showBrainstorm && (
        <div className="ds-upload-stage" style={{ flex: 1, minHeight: 0, overflow: "hidden auto", padding: "6px 40px 32px" }}>
          {/* Stage head — editorial headline over the intake, per the Resonant recomposition */}
          <header style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "8px 40px",
            borderBottom: "1px solid rgba(44,36,25,0.1)",
            padding: "6px 2px 18px",
            margin: "0 0 18px",
          }}>
            <h1 style={{
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: "clamp(28px, 3.2vw, 40px)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--ds-ink)",
              margin: 0,
              textWrap: "balance",
            }}>
              Give us the raw voice.
            </h1>
            <p style={{
              fontSize: 13.5,
              color: "var(--text-secondary)",
              fontFamily: "var(--font-manrope), sans-serif",
              lineHeight: 1.55,
              maxWidth: 420,
              margin: 0,
            }}>
              Combine anything. A rough voice note and a three-hour interview can belong to the same book.
            </p>
          </header>

          <IntakeGrid
            isRecording={engine.isRecording}
            recordingError={engine.recordingError}
            seconds={engine.seconds}
            onToggleRecording={engine.toggleRecording}
            onStopRecording={engine.stopRecording}
            files={engine.files}
            uploading={engine.uploading}
            uploadPercent={engine.uploadPercent}
            uploadError={engine.uploadError}
            progressEntries={engine.progressEntries}
            dragging={engine.dragging}
            setDragging={engine.setDragging}
            handleDrop={engine.handleDrop}
            handleFileInput={engine.handleFileInput}
            youtubeUrl={engine.youtubeUrl}
            setYoutubeUrl={engine.setYoutubeUrl}
            youtubeError={engine.youtubeError}
            setYoutubeError={engine.setYoutubeError}
            onYoutubeFetch={engine.handleYoutubeSubmit}
            canInitialize={engine.canInitialize}
            allDone={engine.allDone}
            onInitialize={handleInitialize}
            onBrainstorm={() => setShowBrainstorm(true)}
          />

          {/* Action bar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "18px 2px 0",
          }}>
            <span style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-geist-mono), monospace",
              letterSpacing: "0.04em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#a0978a" strokeWidth="1.2" aria-hidden="true">
                <rect x="2" y="4" width="8" height="6" rx="1" />
                <path d="M4 4V3a2 2 0 014 0v1" />
              </svg>
              End-to-End Encrypted
            </span>
            <button
              onClick={handleInitialize}
              disabled={(!engine.canInitialize && !engine.allDone) || engine.uploading}
              className={`transcribe-btn${engine.allDone ? " ds-cta-pulse" : ""}`}
            >
              {engine.uploading ? "Processing..." : engine.allDone ? "View Transcripts →" : "Transcribe →"}
            </button>
          </div>
        </div>
      )}
      {showBrainstorm && (
        // Meet T.H.E.O — variant C full-bleed, static pitch per the design pass.
        // To make the CTA launch the live brainstorm later: re-add
        // `import BrainstormChat from "@/components/upload/BrainstormChat"` and render it
        // when MeetTheoPanel's onStart fires (a `chatting` state swap).
        <div className="flex" style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
          <MeetTheoPanel onBack={() => setShowBrainstorm(false)} />
        </div>
      )}
    </PageShell>
  );
}
