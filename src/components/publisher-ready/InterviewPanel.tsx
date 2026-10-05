"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ServedQuestion {
  id: string;
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  question: string;
  why: string;
  round: number;
}

interface Progress {
  remaining: number;
  answered: number;
  skipped: number;
  round: number;
  chaptersWithQuestions: number;
}

interface Props {
  runId: string;
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onFinished: () => void;
}

/** Stay under the host's ~4.5 MB request-body limit (the studio uses the same bound). */
const MAX_CLIP_BYTES = 3_800_000;

const btn = (primary = false): React.CSSProperties => ({
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 16px",
  borderRadius: 10,
  border: primary ? "none" : "1px solid var(--ds-card-border)",
  background: primary ? "var(--ds-accent-500, #C17A47)" : "var(--ds-card-bg)",
  color: primary ? "#fff" : "var(--text-primary)",
  cursor: "pointer",
  fontFamily: "var(--font-manrope), sans-serif",
});

/**
 * The second interview. One question at a time, in round-robin order (at most
 * five in a row for any chapter). Typed or spoken answers; one follow-up when
 * an answer is vague. The author can skip, end a chapter, or end the interview.
 */
export default function InterviewPanel({ runId, guardedFetch, onFinished }: Props) {
  // Held in a ref: the parent passes a new function every render, and making
  // loadNext depend on it would re-fetch the question and wipe a typed answer.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const [question, setQuestion] = useState<ServedQuestion | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [followUp, setFollowUp] = useState<{ text: string; answerId: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [source, setSource] = useState<"typed" | "voice">("typed");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const res = await guardedFetch("/api/publisher-ready/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || "Something went wrong");
    return data;
  }, [guardedFetch, runId]);

  const loadNext = useCallback(async () => {
    setBusy(true);
    setError(null);
    setFollowUp(null);
    setAnswer("");
    setShowWhy(false);
    setSource("typed");
    try {
      const data = await call({ action: "next" });
      setQuestion(data.next);
      setProgress(data.progress);
      if (!data.next) onFinishedRef.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the next question");
    } finally {
      setBusy(false);
    }
  }, [call]);

  useEffect(() => { void loadNext(); }, [loadNext]);

  const submit = async () => {
    if (!question || !answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await call({
        action: "answer",
        question_id: question.id,
        transcript: answer,
        source,
        follow_up_of: followUp?.answerId ?? null,
      });
      if (data.followUp) {
        setFollowUp({ text: data.followUp, answerId: data.answerId });
        setAnswer("");
        setSource("typed");
        setBusy(false);
        return;
      }
      await loadNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your answer");
      setBusy(false);
    }
  };

  const act = async (body: Record<string, unknown>, after: () => Promise<void> | void) => {
    setBusy(true);
    setError(null);
    try {
      await call(body);
      await after();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Low bitrate keeps a long answer small; browsers that ignore the hint are
      // still covered by the byte guard below.
      const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32_000 });
      chunksRef.current = [];
      let bytes = 0;
      let hitSizeCap = false;
      rec.ondataavailable = (e) => {
        if (e.data.size <= 0) return;
        chunksRef.current.push(e.data);
        bytes += e.data.size;
        // The host rejects request bodies over ~4.5 MB (same bound as the
        // brainstorm studio): stop early, transcribe what we have, and let the
        // author press record again to keep going. Nothing is lost.
        if (bytes > MAX_CLIP_BYTES && rec.state === "recording") {
          hitSizeCap = true;
          rec.stop();
        }
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (hitSizeCap) setError("That was a long one. I saved what you said; press “Answer out loud” again to keep going.");
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        setBusy(true);
        try {
          const res = await guardedFetch(`/api/publisher-ready/stt?run_id=${runId}&seconds=${seconds}`, {
            method: "POST",
            headers: { "Content-Type": (rec.mimeType || "audio/webm").split(";")[0] },
            body: blob,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Couldn't transcribe that");
          if (data.transcript) {
            setAnswer((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
            setSource("voice");
          } else {
            setError("I didn't catch any words. Try again, or type your answer.");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't transcribe that");
        } finally {
          setBusy(false);
        }
      };
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start(1000); // 1s slices so the byte guard sees the size as it grows
      setRecording(true);
      // Cap one answer at 10 minutes.
      setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 600_000);
    } catch {
      setError("Microphone unavailable. You can type your answer instead.");
    }
  };

  if (!question) {
    return (
      <div style={{ padding: 24, color: "var(--text-secondary)" }}>
        {busy ? "Finding the next question..." : error ?? "No questions left."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {progress && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Chapter {question.chapter_number} · round {question.round} · {progress.remaining} question{progress.remaining === 1 ? "" : "s"} left · {progress.answered} answered
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-accent-500, #C17A47)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Chapter {question.chapter_number}: {question.chapter_title}
      </div>
      <div style={{ fontSize: 20, lineHeight: 1.45, color: "var(--text-primary)", fontFamily: "var(--font-playfair), serif" }}>
        {followUp ? followUp.text : question.question}
      </div>
      {!followUp && question.why && (
        <button onClick={() => setShowWhy(!showWhy)} style={{ ...btn(), alignSelf: "flex-start", fontSize: 12, padding: "5px 10px" }}>
          {showWhy ? "Hide" : "Why is the editor asking?"}
        </button>
      )}
      {showWhy && !followUp && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", background: "var(--ds-input-bg)", borderRadius: 8, padding: "10px 12px" }}>
          {question.why}
        </div>
      )}
      <textarea
        value={answer}
        onChange={(e) => { setAnswer(e.target.value); if (source === "voice" && !e.target.value) setSource("typed"); }}
        placeholder="Say it the way you'd tell a friend. Names, places, what was said."
        rows={6}
        disabled={busy}
        style={{
          width: "100%", padding: 14, borderRadius: 10, fontSize: 16, lineHeight: 1.5,
          border: "1px solid var(--ds-input-border)", background: "var(--ds-input-bg)", color: "var(--text-primary)",
          resize: "vertical", fontFamily: "inherit",
        }}
      />
      {error && <div role="alert" style={{ fontSize: 13, color: "#B4532A" }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button onClick={submit} disabled={busy || !answer.trim()} style={btn(true)}>
          {busy ? "Saving..." : followUp ? "Add to my answer" : "Save answer"}
        </button>
        <button onClick={toggleRecording} disabled={busy && !recording} style={btn()} aria-pressed={recording}>
          {recording ? "Stop recording" : "Answer out loud"}
        </button>
        {followUp ? (
          <button onClick={() => act({ action: "answer", question_id: question.id, transcript: "(no more detail)", follow_up_of: followUp.answerId }, loadNext)} disabled={busy} style={btn()}>
            That&apos;s all I&apos;ve got
          </button>
        ) : (
          <button onClick={() => act({ action: "skip", question_id: question.id }, loadNext)} disabled={busy} style={btn()}>
            Skip
          </button>
        )}
        <button onClick={() => act({ action: "finish_chapter", chapter_id: question.chapter_id }, loadNext)} disabled={busy} style={btn()}>
          Done with this chapter
        </button>
        <button onClick={() => act({ action: "finish" }, () => onFinishedRef.current())} disabled={busy} style={btn()}>
          Done with all questions
        </button>
      </div>
    </div>
  );
}
