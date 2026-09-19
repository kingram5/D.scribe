"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { parseYoutubeLinks } from "@/lib/youtube-links";

type InputMode = "file" | "youtube";

// MediaRecorder container support differs per engine: iOS/iPadOS Safari
// records audio/mp4 and supports NEITHER webm variant — a webm-only list
// left the record button silently dead on every iPhone. First supported
// candidate wins; the backend allowlist already accepts all of these.
const RECORDER_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function extForMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  return "ogg";
}

// fetch() cannot report upload progress; only XHR exposes upload.onprogress.
// A 30-90 minute talk over cellular is minutes of transfer — without progress
// the screen reads as frozen and users kill the tab, losing the whole upload.
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onPercent: (pct: number) => void
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.timeout = 30 * 60_000; // a stalled connection must not hang forever
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPercent(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.ontimeout = () => resolve({ ok: false, status: 0 });
    xhr.onabort = () => resolve({ ok: false, status: -1 });
    xhr.send(file);
  });
}

async function readServerError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || body?.message || fallback;
  } catch {
    return fallback;
  }
}

export function useUploadEngine(projectId: string) {
  const [files, setFiles] = useState<File[]>([]);
  // A recording is a source too, but it belongs to the recorder that created
  // it. Keeping it out of `files` prevents a finished recording from jumping
  // into the separate "Audio files" card and looking as though the app lost it.
  const [recordings, setRecordings] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});
  // Per-file transfer percentage (only meaningful while status is "uploading")
  const [uploadPercent, setUploadPercent] = useState<Record<string, number>>({});
  // Per-file server error messages — the server writes genuinely useful ones
  // ("File too large…", "Unsupported file type…", "out_of_ink") and they used
  // to die in a console that doesn't exist on a phone.
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("file");
  // A paste, not a URL: the intake accepts one link per line and imports the
  // whole batch in one run (each link still bills its own 2 Ink).
  const [youtubeInput, setYoutubeInput] = useState("");
  const [youtubeError, setYoutubeError] = useState("");
  const { urls: youtubeUrls } = parseYoutubeLinks(youtubeInput);

  // Recording state with real MediaRecorder
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingError, setRecordingError] = useState("");
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

  const releaseMicrophone = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // Pause without finalizing the file. Stopping here used to run onstop,
      // move a partial clip into the Upload card, and make "Pause" behave as
      // an irreversible save button.
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.pause();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      setIsPaused(true);
    } else if (isPaused) {
      if (mediaRecorderRef.current?.state === "paused") {
        mediaRecorderRef.current.resume();
        setIsRecording(true);
        setIsPaused(false);
        timerRef.current = setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      }
    } else {
      // Start recording
      setRecordingError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];

        const mimeType = RECORDER_MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c));
        if (!mimeType) {
          // Never leave the mic open on a failure path — the OS shows its
          // recording indicator while nothing records, which reads as spyware.
          releaseMicrophone();
          setRecordingError("This browser can't record audio. You can upload an audio file instead.");
          return;
        }
        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          // Keep finished clips where they were made. The Audio Files card is
          // for picked/dropped files; recording belongs to the Record card.
          if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const file = new File([blob], `recording-${timestamp}.${extForMime(mimeType)}`, {
              type: mimeType,
            });
            setRecordings((prev) => [...prev, file]);
          }
          releaseMicrophone();
        };

        mediaRecorderRef.current = recorder;
        recorder.start(1000); // collect data every second
        setIsRecording(true);
        setIsPaused(false);
        setSeconds(0);
        timerRef.current = setInterval(() => {
          setSeconds((s) => s + 1);
        }, 1000);
      } catch (err) {
        // Reaching here with a live stream means the RECORDER failed, not the
        // permission (NotSupportedError on an unsupported container, etc.) —
        // release the mic and tell the user the truth instead of logging
        // "access denied" for something that was granted.
        releaseMicrophone();
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        setRecordingError(
          denied
            ? "Microphone access was denied. Allow it in your browser settings to record."
            : "Recording couldn't start on this browser. You can upload an audio file instead."
        );
        console.error("Recording failed to start:", err);
      }
    }
  }, [isRecording, isPaused, releaseMicrophone]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("audio/") || f.type === "video/webm" || f.type === "video/mp4"
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

    for (const file of [...recordings, ...files]) {
      try {
        // Step 1: Get presigned R2 URL. Mobile browsers frequently report
        // file.type as "" for picker files — fall back to octet-stream, which
        // the server allowlist accepts.
        setProgress((p) => ({ ...p, [file.name]: "preparing" }));
        setUploadError((p) => {
          const next = { ...p };
          delete next[file.name];
          return next;
        });

        const declaredType = file.type || "application/octet-stream";
        const urlRes = await fetch("/api/audio/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            file_name: file.name,
            file_size: file.size,
            content_type: declaredType,
          }),
        });

        if (!urlRes.ok) {
          const message = await readServerError(urlRes, "Couldn't prepare the upload");
          setUploadError((p) => ({ ...p, [file.name]: message }));
          setProgress((p) => ({ ...p, [file.name]: "failed" }));
          continue;
        }

        const { upload_url, upload_id, content_type: signedType } = await urlRes.json();

        // Step 2: Upload directly to R2 — XHR for progress, one automatic
        // retry (tower handoffs and wifi→cellular transitions are the
        // EXPECTED case on mobile, not the exception). The Content-Type must
        // be exactly the value the server signed, never file.type.
        setProgress((p) => ({ ...p, [file.name]: "uploading" }));
        setUploadPercent((p) => ({ ...p, [file.name]: 0 }));

        const putOnce = () =>
          putWithProgress(upload_url, file, signedType || declaredType, (pct) =>
            setUploadPercent((p) => ({ ...p, [file.name]: pct }))
          );

        let r2Res = await putOnce();
        if (!r2Res.ok) {
          setUploadPercent((p) => ({ ...p, [file.name]: 0 }));
          r2Res = await putOnce();
        }

        if (!r2Res.ok) {
          setUploadError((p) => ({
            ...p,
            [file.name]:
              r2Res.status > 0
                ? `Storage rejected the upload (HTTP ${r2Res.status})`
                : "Connection dropped during upload — check your network and try again",
          }));
          setProgress((p) => ({ ...p, [file.name]: "failed" }));
          continue;
        }

        // Step 3: Trigger transcription
        setProgress((p) => ({ ...p, [file.name]: "transcribing" }));

        const txRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_upload_id: upload_id }),
        });

        if (!txRes.ok) {
          const message = await readServerError(txRes, "Transcription failed");
          setUploadError((p) => ({ ...p, [file.name]: message }));
        }
        setProgress((p) => ({
          ...p,
          [file.name]: txRes.ok ? "done" : "failed",
        }));
      } catch (err) {
        console.error("Upload error:", err);
        setUploadError((p) => ({ ...p, [file.name]: "Something went wrong — try again" }));
        setProgress((p) => ({ ...p, [file.name]: "failed" }));
      }
    }

    // YouTube links ride the same run as the audio files: "Transcribe" is one
    // action, and a book assembled from recordings plus interviews should not
    // need two clicks and two waits.
    await importYoutubeBatch();
    setUploading(false);
  }

  /**
   * One URL per request — the API takes a single link — so a batch is a
   * sequence. Failures are per-row; an out-of-Ink refusal stops the batch
   * because every remaining link would be refused the same way, and the
   * entries already imported must not be re-billed by a blind retry.
   */
  async function transcribeYoutube(url: string): Promise<"done" | "failed" | "stop"> {
    const label = url.length > 50 ? url.substring(0, 50) + "..." : url;

    setProgress((p) => ({ ...p, [label]: "fetching" }));
    setUploadError((p) => {
      const next = { ...p };
      delete next[label];
      return next;
    });

    const post = () =>
      fetch("/api/audio/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: url, project_id: projectId }),
      });

    let res = await post();

    // The limiter allows 10 per minute and a short video finishes in seconds;
    // a long batch can reach it. Wait out the window rather than failing rows
    // the user already paid attention to.
    if (res.status === 429) {
      const waited = Number(res.headers.get("Retry-After") || 0) * 1000;
      await new Promise((r) => setTimeout(r, Math.min(waited > 0 ? waited : 30_000, 65_000)));
      res = await post();
    }

    if (res.ok) {
      const result = await res.json();
      const ok = result.transcribed !== false;
      setProgress((p) => ({ ...p, [label]: ok ? "done" : "failed" }));
      return ok ? "done" : "failed";
    }

    const err = await res.json().catch(() => ({} as { error?: string; message?: string }));

    if (res.status === 402) {
      setYoutubeError(err.message || "You're out of Ink — top up to import more links.");
      setProgress((p) => ({ ...p, [label]: "failed" }));
      return "stop";
    }

    setUploadError((p) => ({ ...p, [label]: err.error || "Failed to get transcript" }));
    setYoutubeError(err.error || "Failed to get transcript");
    setProgress((p) => ({ ...p, [label]: "failed" }));
    return "failed";
  }

  /** Import every link in the paste, in order. Returns how many landed. */
  async function importYoutubeBatch(): Promise<number> {
    const { urls, invalid } = parseYoutubeLinks(youtubeInput);
    if (urls.length === 0) return 0;

    setYoutubeError(
      invalid.length > 0
        ? `${invalid.length} entr${invalid.length === 1 ? "y was" : "ies were"} not a YouTube link and skipped.`
        : ""
    );

    let done = 0;
    for (const url of urls) {
      const outcome = await transcribeYoutube(url);
      if (outcome === "stop") break;
      if (outcome === "done") done += 1;
    }

    setYoutubeInput("");
    return done;
  }

  async function handleYoutubeSubmit() {
    const { urls, invalid } = parseYoutubeLinks(youtubeInput);

    if (urls.length === 0) {
      setYoutubeError(
        invalid.length > 0
          ? `That doesn't look like a YouTube link: ${invalid[0]}`
          : "Paste at least one YouTube link."
      );
      return;
    }

    setUploading(true);
    await importYoutubeBatch();
    setUploading(false);
  }

  const progressEntries = Object.entries(progress);
  const allDone =
    progressEntries.length > 0 &&
    progressEntries.every(([, status]) => status === "done");

  const canInitialize =
    files.length > 0 || recordings.length > 0 || youtubeUrls.length > 0;

  return {
    // File state
    files,
    recordings,
    uploading,
    progress,
    uploadPercent,
    uploadError,
    dragging,
    setDragging,
    inputMode,
    setInputMode,
    youtubeInput,
    setYoutubeInput,
    youtubeUrls,
    youtubeUrlCount: youtubeUrls.length,
    youtubeError,
    setYoutubeError,

    // Recording state
    isRecording,
    isPaused,
    recordingError,
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
