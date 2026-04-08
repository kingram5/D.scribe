"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import LeftPanel from "@/components/upload/LeftPanel";
import RightPanel from "@/components/upload/RightPanel";
import BrainstormChat from "@/components/upload/BrainstormChat";
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
      <div className="flex ds-upload-split" style={{ flex: 1, overflow: "hidden" }}>
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
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "28px 32px 0" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--ds-ink)", fontFamily: "var(--font-manrope), sans-serif" }}>D.</span>
                <span style={{ fontSize: 22, fontWeight: 300, color: "var(--ds-ink)", fontFamily: "var(--font-lora), serif", fontStyle: "italic" }}>scribe</span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", gap: 28 }}>
              <div style={{ textAlign: "center" }}>
                <h1 style={{
                  fontFamily: "var(--font-lora), serif",
                  fontStyle: "italic",
                  fontWeight: 400,
                  fontSize: "2.4rem",
                  lineHeight: 1.15,
                  color: "var(--ds-ink)",
                  letterSpacing: "-0.02em",
                  marginBottom: 12,
                }}>
                  Brainstorm Studio
                </h1>
                <p style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  fontWeight: 400,
                  maxWidth: 280,
                  margin: "0 auto",
                  lineHeight: 1.5,
                }}>
                  Talk through your ideas with AI. Speak or type — the AI asks questions to draw out your best thinking.
                </p>
              </div>
              <div style={{ maxWidth: 500, display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                {[
                  "Tap \"Speak\" and talk naturally — no need to type",
                  "The AI asks follow-up questions to deepen your ideas",
                  "When you're done, hit \"Finish\" to create your source material",
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
        ) : (
          <LeftPanel
            isRecording={engine.isRecording}
            seconds={engine.seconds}
            onToggleRecording={engine.toggleRecording}
            onStopRecording={engine.stopRecording}
          />
        )}
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
            />
          </div>
        ) : (
          <RightPanel
            files={engine.files}
            uploading={engine.uploading}
            progress={engine.progress}
            progressEntries={engine.progressEntries}
            dragging={engine.dragging}
            setDragging={engine.setDragging}
            youtubeUrl={engine.youtubeUrl}
            setYoutubeUrl={engine.setYoutubeUrl}
            youtubeError={engine.youtubeError}
            setYoutubeError={engine.setYoutubeError}
            handleDrop={engine.handleDrop}
            handleFileInput={engine.handleFileInput}
            canInitialize={engine.canInitialize}
            allDone={engine.allDone}
            onInitialize={handleInitialize}
            onBrainstorm={() => setShowBrainstorm(true)}
          />
        )}
      </div>
    </PageShell>
  );
}
