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

  // Recording state with real MediaRecorder
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Pause — stop the MediaRecorder and timer
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          // Convert chunks to a File and add to files list
          if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const ext = mimeType.includes("webm") ? "webm" : "ogg";
            const file = new File([blob], `recording-${timestamp}.${ext}`, {
              type: mimeType,
            });
            setFiles((prev) => [...prev, file]);
          }
          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000); // collect data every second
        setIsRecording(true);
        setSeconds(0);
        timerRef.current = setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      } catch (err) {
        console.error("Microphone access denied:", err);
      }
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
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
      try {
        // Step 1: Get presigned R2 URL
        setProgress((p) => ({ ...p, [file.name]: "preparing" }));

        const urlRes = await fetch("/api/audio/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            file_name: file.name,
            file_size: file.size,
            content_type: file.type,
          }),
        });

        if (!urlRes.ok) {
          const err = await urlRes.json();
          console.error("Upload URL error:", err);
          setProgress((p) => ({ ...p, [file.name]: "failed" }));
          continue;
        }

        const { upload_url, upload_id } = await urlRes.json();

        // Step 2: Upload directly to R2
        setProgress((p) => ({ ...p, [file.name]: "uploading" }));

        const r2Res = await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!r2Res.ok) {
          setProgress((p) => ({ ...p, [file.name]: "failed" }));
          continue;
        }

        // Step 3: Confirm upload
        await fetch("/api/audio/confirm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upload_id }),
        });

        // Step 4: Trigger transcription
        setProgress((p) => ({ ...p, [file.name]: "transcribing" }));

        const txRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_upload_id: upload_id }),
        });

        setProgress((p) => ({
          ...p,
          [file.name]: txRes.ok ? "done" : "failed",
        }));
      } catch (err) {
        console.error("Upload error:", err);
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
