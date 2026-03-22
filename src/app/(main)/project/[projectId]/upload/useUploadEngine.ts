"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type InputMode = "file" | "youtube";

export function useUploadEngine(projectId: string) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeError, setYoutubeError] = useState("");

  // Recording state (UI-only)
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      // Pause
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
    } else {
      // Start/resume
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setSeconds(0);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("audio/")
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      }
    },
    []
  );

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

    const label =
      youtubeUrl.length > 50
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
      setProgress((p) => ({
        ...p,
        [label]: result.transcribed ? "done" : "failed",
      }));
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

  const canInitialize =
    files.length > 0 || youtubeUrl.trim().length > 5 || seconds > 0;

  return {
    // File state
    files,
    uploading,
    progress,
    dragging,
    setDragging,
    inputMode,
    setInputMode,
    youtubeUrl,
    setYoutubeUrl,
    youtubeError,
    setYoutubeError,

    // Recording state
    isRecording,
    seconds,
    toggleRecording,
    stopRecording,

    // Handlers
    handleDrop,
    handleFileInput,
    uploadAll,
    handleYoutubeSubmit,

    // Computed
    progressEntries,
    allDone,
    canInitialize,
  };
}
