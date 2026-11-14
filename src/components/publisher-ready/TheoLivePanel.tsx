"use client";
import { useEffect, useRef, useState } from "react";
import {
  transcriptText,
  type TranscriptEvent,
} from "@/lib/theo/live-transcript";
interface Snapshot {
  last_answer_ms?: number;
  answers?: { id: string; transcript: string }[];
  state: string;
  answer?: string | null;
  used_seconds: number;
  reserved_seconds: number;
  failure?: string | null;
  events: { event_type: string; payload: TranscriptEvent }[];
}
export function TheoLivePanel({
  runId,
  onBack,
  onTyped,
}: {
  runId: string;
  onBack: () => void;
  onTyped: () => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remainder, setRemainder] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const session = useRef<string | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const applied = useRef(false);
  const active = useRef(true);
  const cleanup = () => {
    peer.current?.close();
    peer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (audio.current) audio.current.srcObject = null;
  };
  const end = async () => {
    cleanup();
    if (session.current) {
      setSnapshot((s) => (s ? { ...s, state: "closing" } : s));
      await fetch("/api/theo/live", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.current, action: "end" }),
        keepalive: true,
      }).catch(() =>
        setError(
          "Connection lost. The server will close voice when its heartbeat expires.",
        ),
      );
    }
  };
  useEffect(() => {
    active.current = true;
    let polling = false;
    const timer = setInterval(() => {
      if (!session.current || polling) return;
      polling = true;
      void (async () => {
        const res = await fetch(
          `/api/theo/live?session_id=${encodeURIComponent(session.current!)}`,
        );
        if (!res.ok)
          throw new Error(
            "Could not read voice status. Your saved words are retained.",
          );
        const s = (await res.json()) as Snapshot;
        if (!active.current) return;
        setSnapshot(s);
        if (s.answer && !applied.current && peer.current) {
          applied.current = true;
          await peer.current.setRemoteDescription({
            type: "answer",
            sdp: s.answer,
          });
        }
        if (s.state === "closed") {
          cleanup();
          return;
        }
        await fetch("/api/theo/live", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: session.current,
            action: "heartbeat",
          }),
        });
      })()
        .catch((e) => {
          if (active.current) setError(e.message);
        })
        .finally(() => {
          polling = false;
        });
    }, 3000);
    const hidden = () => {
      if (document.hidden) void end();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      void end();
    };
    // This controller owns one provider/session. A new session requires a new mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const start = async () => {
    if (busy || session.current) return;
    setBusy(true);
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const pc = new RTCPeerConnection();
      peer.current = pc;
      for (const track of media.getTracks()) pc.addTrack(track, media);
      pc.ontrack = (e) => {
        if (audio.current) {
          audio.current.srcObject = e.streams[0] ?? new MediaStream([e.track]);
          void audio.current
            .play()
            .catch(() => setError("Tap Play voice to enable Theo’s audio."));
        }
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc.connectionState)) {
          setError("Voice disconnected. End voice to continue typing.");
          void end();
        }
      };
      pc.createDataChannel("oai-events");
      await pc.setLocalDescription(await pc.createOffer());
      const res = await fetch("/api/theo/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, sdp: pc.localDescription?.sdp }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Voice is unavailable");
      session.current = body.session_id;
      setSnapshot({
        state: "queued",
        used_seconds: 0,
        reserved_seconds: 0,
        events: [],
      });
      if (!active.current) await end();
    } catch (e) {
      cleanup();
      setError(
        e instanceof Error
          ? e.message
          : "Microphone unavailable. Continue typing.",
      );
    } finally {
      setBusy(false);
    }
  };
  const closed = !session.current || snapshot?.state === "closed";
  const input = (snapshot?.events ?? [])
    .filter((e) => e.event_type === "session.input_transcript.delta")
    .map((e) => e.payload);
  const output = (snapshot?.events ?? [])
    .filter((e) => e.event_type === "session.output_transcript.delta")
    .map((e) => e.payload);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Theo live interview"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--ds-card-bg, #171c20)",
        color: "var(--text-primary, white)",
        padding: "24px",
        overflowY: "auto",
      }}
    >
      <h2>Your conversation with Theo</h2>
      <p>
        Speak naturally. You can end voice and continue typing at any time.
        Leaving this screen pauses the conversation by ending voice.
      </p>
      <audio ref={audio} autoPlay />
      {snapshot && (
        <p role="status">
          {snapshot.state === "active"
            ? "Listening"
            : snapshot.state === "closed"
              ? "Voice ended"
              : snapshot.state === "closing"
                ? "Ending voice…"
                : snapshot.state === "reconciliation"
                  ? "Confirming voice has ended…"
                  : "Connecting…"}
          {snapshot.reserved_seconds > 0
            ? ` · ${Math.max(0, Math.floor(snapshot.reserved_seconds - snapshot.used_seconds))} seconds remaining`
            : ""}
        </p>
      )}
      {(error || snapshot?.failure) && (
        <p role="alert">{error || snapshot?.failure}</p>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {!session.current && (
          <button onClick={() => void start()} disabled={busy}>
            {busy ? "Connecting…" : "Start voice"}
          </button>
        )}
        {!closed && <button onClick={() => void end()}>End voice</button>}
        <button
          onClick={() =>
            void audio.current
              ?.play()
              .catch(() =>
                setError(
                  "Audio could not start. End voice and continue typing.",
                ),
              )
          }
        >
          Play voice
        </button>
        <button disabled={!closed || busy} onClick={onTyped}>
          Continue typing
        </button>
        <button disabled={!closed || busy} onClick={onBack}>
          Back
        </button>
      </div>
      {closed &&
        !confirmed &&
        transcriptText(input, snapshot?.last_answer_ms ?? -1).trim() && (
          <div>
            <label htmlFor="live-remainder">
              Review your final words before saving this answer
            </label>
            <textarea
              id="live-remainder"
              maxLength={8000}
              style={{ display: "block", width: "100%", minHeight: 90 }}
              value={
                remainder ??
                transcriptText(input, snapshot?.last_answer_ms ?? -1)
              }
              onChange={(e) => setRemainder(e.target.value)}
            />
            <button
              onClick={() =>
                void fetch("/api/theo/live", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    session_id: session.current,
                    action: "confirm",
                    transcript:
                      remainder ??
                      transcriptText(input, snapshot?.last_answer_ms ?? -1),
                  }),
                })
                  .then((r) => {
                    if (!r.ok) throw new Error("Answer could not be saved");
                    setConfirmed(true);
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Save final answer
            </button>
          </div>
        )}
      <h3>Theo</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{transcriptText(output)}</p>
      {closed &&
        (snapshot?.answers ?? []).map((answer) => (
          <div key={answer.id} style={{ marginTop: 16 }}>
            <label htmlFor={answer.id}>
              Saved answer — correct any wording before continuing
            </label>
            <textarea
              id={answer.id}
              value={corrections[answer.id] ?? answer.transcript}
              maxLength={8000}
              onChange={(e) =>
                setCorrections((c) => ({ ...c, [answer.id]: e.target.value }))
              }
              style={{ display: "block", width: "100%", minHeight: 90 }}
            />
            <button
              onClick={() =>
                void fetch("/api/theo/live", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    session_id: session.current,
                    action: "correct",
                    answer_id: answer.id,
                    transcript: corrections[answer.id] ?? answer.transcript,
                  }),
                })
                  .then((r) => {
                    if (!r.ok) throw new Error("Correction could not be saved");
                    setError("Correction saved.");
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Save correction
            </button>
          </div>
        ))}
      <h3>Your words</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{transcriptText(input)}</p>
      <p>
        Saved voice fragments appear here as they arrive. Tell Theo any
        corrections, or continue typing to clarify your answer.
      </p>
    </div>
  );
}
