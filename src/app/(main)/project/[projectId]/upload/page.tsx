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
        <LeftPanel
          isRecording={engine.isRecording}
          seconds={engine.seconds}
          onToggleRecording={engine.toggleRecording}
          onStopRecording={engine.stopRecording}
        />
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
