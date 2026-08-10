"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ThinkingOrb } from "thinking-orbs";
import PageShell from "@/components/ui/PageShell";
import IntakeGrid from "@/components/upload/IntakeGrid";
import BrainstormChat from "@/components/upload/BrainstormChat";
import { useUploadEngine } from "./useUploadEngine";

export default function UploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const engine = useUploadEngine(projectId);
  const [showBrainstorm, setShowBrainstorm] = useState(false);
  const [triggerBrainstormFinish, setTriggerBrainstormFinish] = useState(false);
  // The studio intro introduces T.H.E.O as tuned to THIS book's reader.
  const [audience, setAudience] = useState<string>("");
  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.audience) setAudience(d.audience); })
      .catch(() => {});
  }, [projectId]);

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
    <PageShell
      projectId={projectId}
      currentStep="upload"
      onNextClick={showBrainstorm ? () => setTriggerBrainstormFinish(true) : undefined}
    >
      <style>{`
        @media (max-width: 768px) {
          .ds-upload-split {
            flex-direction: column !important;
            overflow-y: auto !important;
            height: auto !important;
          }
          .ds-upload-split .upload-slide-left {
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            border-right: none !important;
            border-bottom: 1px solid rgba(0,0,0,0.06) !important;
            box-shadow: none !important;
            padding-bottom: 24px !important;
          }
          .ds-upload-split .upload-slide-right {
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
          }
        }
      `}</style>
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
      <div className="flex ds-upload-split" style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {showBrainstorm ? (
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
              // Fixed at height:100% inside a viewport-locked shell, so `hidden` clipped the
              // bottom of the panel on a short window with no way to reach it (measured:
              // 331px unreachable at 753px tall).
              overflow: "hidden auto",
            }}
          >
            <div style={{ padding: "28px 32px 0" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--ds-ink)", fontFamily: "var(--font-manrope), sans-serif" }}>D.</span>
                <span style={{ fontSize: 22, fontWeight: 300, color: "var(--ds-ink)", fontFamily: "var(--font-lora), serif", fontStyle: "italic" }}>scribe</span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 22, overflow: "hidden auto", minHeight: 0 }}>
              {/* T.H.E.O's portrait: the live orb on its own dark disc. `dark` theme paints
                  light ink, which is what this disc needs even though the panel is paper. */}
              <div style={{
                width: 150,
                height: 150,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "radial-gradient(circle at 32% 22%, #3A3023 0%, #2C2419 65%, #241D14 100%)",
                boxShadow: "0 0 0 1px rgba(193,122,71,0.35), 0 0 40px rgba(193,122,71,0.22)",
                flexShrink: 0,
              }}>
                <ThinkingOrb state="listening" size={64} speed={0.6} theme="dark" aria-label="T.H.E.O, listening" />
              </div>

              <div style={{ textAlign: "center" }}>
                <h1 style={{
                  fontFamily: "var(--font-lora), serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: "2.3rem",
                  lineHeight: 1.1,
                  color: "var(--ds-ink)",
                  letterSpacing: "-0.02em",
                  marginBottom: 6,
                }}>
                  Meet T.H.E.O
                </h1>
                <p style={{
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: 10.5,
                  letterSpacing: "0.09em",
                  color: "#A05526",
                  marginBottom: 14,
                }}>
                  TECHNICAL HUMAN EXPRESSION ORGANIZER
                </p>
                <p style={{
                  fontSize: 14.5,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  maxWidth: 330,
                  margin: "0 auto",
                  lineHeight: 1.6,
                }}>
                  Your ghostwriter, not a chatbot. T.H.E.O interviews the way a good editor does:
                  he listens for the book inside the way you tell it, then asks the question that
                  pulls the next chapter out of you.
                </p>
              </div>

              <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", gap: 9 }}>
                {[
                  audience && audience !== "General"
                    ? `Pre-tuned for ${audience} — his questions already fit this book's reader`
                    : "Tuned to your book's reader the moment you chose one",
                  "Speak or type — he keeps up either way",
                  "Everything you say becomes source material when you hit Finish",
                ].map((tip, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 13.5,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-manrope), sans-serif",
                    lineHeight: 1.5,
                  }}>
                    <span style={{ color: "#C17A47", flexShrink: 0, marginTop: 2 }}>&#8226;</span>
                    {tip}
                  </div>
                ))}
              </div>
            </div>
            <div style={{
              padding: "0 32px 20px",
              fontSize: 10,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-geist-mono), monospace",
              letterSpacing: "0.06em",
            }}>
              D.SCRIBE v1.0
            </div>
          </div>
        ) : null}
        {showBrainstorm ? (
          <div className="upload-slide-right" style={{
            width: "55%",
            height: "100%",
            background: "var(--ds-surface)",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            overflow: "hidden",
          }}>
            <BrainstormChat
              projectId={projectId}
              onComplete={() => router.push(`/project/${projectId}/transcript`)}
              onBack={() => setShowBrainstorm(false)}
              triggerFinish={triggerBrainstormFinish}
              onFinishTriggered={() => setTriggerBrainstormFinish(false)}
            />
          </div>
        ) : null}
      </div>
      )}
    </PageShell>
  );
}
