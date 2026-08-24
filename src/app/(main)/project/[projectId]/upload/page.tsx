"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MeetTheoPanel from "@/components/upload/MeetTheoPanel";
import BrainstormChat from "@/components/upload/BrainstormChat";
import PageShell from "@/components/ui/PageShell";
import IntakeGrid from "@/components/upload/IntakeGrid";
import { useUploadEngine } from "./useUploadEngine";
import {
  formatRelativeTouched,
  type BrainstormMessage,
  type BrainstormSessionRecord,
} from "@/lib/brainstorm-session";

export default function UploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const engine = useUploadEngine(projectId);
  const [showBrainstorm, setShowBrainstorm] = useState(false);
  // The lobby is the doorway; "Start Brainstorming" opens the studio over it.
  const [chatting, setChatting] = useState(false);
  const [triggerBrainstormFinish, setTriggerBrainstormFinish] = useState(false);
  const [pausedSession, setPausedSession] = useState<BrainstormSessionRecord | null>(null);
  const [skipResumePrompt, setSkipResumePrompt] = useState(false);
  const [finishingPaused, setFinishingPaused] = useState(false);

  const refreshPausedSession = useCallback(() => {
    fetch(`/api/brainstorm/session?project_id=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPausedSession((d?.session as BrainstormSessionRecord | null) ?? null))
      .catch(() => setPausedSession(null));
  }, [projectId]);

  useEffect(() => {
    if (chatting || showBrainstorm) return;
    refreshPausedSession();
  }, [chatting, showBrainstorm, refreshPausedSession]);

  // A studio is an overlay, not a new route. Give it one history entry so a
  // phone Back gesture closes the overlay before it leaves the upload journey.
  // The session itself persists its draft, so closing is safe recovery rather
  // than a destructive escape hatch.
  useEffect(() => {
    if (!chatting) return;
    const studioState = { ...window.history.state, dsStudio: true };
    window.history.pushState(studioState, "", window.location.href);
    const onPopState = () => setChatting(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [chatting]);

  const closeStudio = useCallback(() => {
    if (window.history.state?.dsStudio) {
      window.history.back();
    } else {
      setChatting(false);
    }
  }, []);

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
      onNextClick={chatting ? () => setTriggerBrainstormFinish(true) : undefined}
    >
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
            isPaused={engine.isPaused}
            recordingError={engine.recordingError}
            seconds={engine.seconds}
            onToggleRecording={engine.toggleRecording}
            onStopRecording={engine.stopRecording}
            recordings={engine.recordings}
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
            onBrainstorm={() => {
              setSkipResumePrompt(false);
              setShowBrainstorm(true);
            }}
            pausedBrainstorm={pausedSession ? {
              turn_count: pausedSession.turn_count,
              updated_at: formatRelativeTouched(pausedSession.updated_at),
            } : null}
            onContinueBrainstorm={() => {
              setSkipResumePrompt(true);
              setShowBrainstorm(true);
              setChatting(true);
            }}
            finishingPausedBrainstorm={finishingPaused}
            onFinishPausedBrainstorm={async () => {
              if (!pausedSession || finishingPaused) return;
              const messages = (pausedSession.messages ?? []) as BrainstormMessage[];
              if (messages.filter((m) => m.role === "user").length < 2) return;
              setFinishingPaused(true);
              try {
                const res = await fetch("/api/brainstorm/summarize", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ messages, project_id: projectId }),
                });
                if (res.ok) {
                  void fetch("/api/brainstorm/session", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project_id: projectId, status: "finished" }),
                  }).catch(() => {});
                  try { localStorage.removeItem(`brainstorm_session_${projectId}`); } catch { /* storage blocked */ }
                  setPausedSession(null);
                  router.push(`/project/${projectId}/transcript`);
                }
              } finally {
                setFinishingPaused(false);
              }
            }}
            onDiscardPausedBrainstorm={() => {
              if (!window.confirm("Throw this conversation away? You can always start a new one.")) return;
              void fetch("/api/brainstorm/session", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_id: projectId, status: "discarded" }),
              }).catch(() => {});
              try { localStorage.removeItem(`brainstorm_session_${projectId}`); } catch { /* storage blocked */ }
              setPausedSession(null);
            }}
          />

          {/* Action bar */}
          <div className="ds-upload-action-bar" style={{
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
              data-tut="upload-transcribe"
            >
              {engine.uploading ? "Processing..." : engine.allDone ? "View Transcripts →" : "Transcribe →"}
            </button>
          </div>
        </div>
      )}
      {showBrainstorm && (
        // The Meet T.H.E.O lobby. Its CTA opens the brainstorm studio, which
        // portals to <body> and covers the lobby while the session runs.
        <div
          className="flex"
          inert={chatting}
          aria-hidden={chatting || undefined}
          style={{ flex: 1, overflow: "hidden", minHeight: 0 }}
        >
          <MeetTheoPanel
            onStart={() => setChatting(true)}
            onBack={() => setShowBrainstorm(false)}
            paused={chatting}
          />
          {chatting && (
            <BrainstormChat
              projectId={projectId}
              autoStart
              skipResumePrompt={skipResumePrompt}
              onComplete={() => router.push(`/project/${projectId}/transcript`)}
              onBack={closeStudio}
              triggerFinish={triggerBrainstormFinish}
              onFinishTriggered={() => setTriggerBrainstormFinish(false)}
            />
          )}
        </div>
      )}
    </PageShell>
  );
}
