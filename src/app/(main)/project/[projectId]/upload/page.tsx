"use client";

import { useParams, useRouter } from "next/navigation";
import PageShell from "@/components/ui/PageShell";
import LeftPanel from "@/components/upload/LeftPanel";
import RightPanel from "@/components/upload/RightPanel";
import { useUploadEngine } from "./useUploadEngine";

export default function UploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const engine = useUploadEngine(projectId);

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
      <div className="flex ds-upload-split" style={{ height: "calc(100vh - 108px)" }}>
        <LeftPanel
          isRecording={engine.isRecording}
          seconds={engine.seconds}
          onToggleRecording={engine.toggleRecording}
          onStopRecording={engine.stopRecording}
        />
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
        />
      </div>
    </PageShell>
  );
}
