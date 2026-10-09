"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Only mounted after the server enables Live; legacy TTS is unmounted while this is active. */
export default function LiveInterview({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}) {
  const peer = useRef<RTCPeerConnection | null>(null),
    mic = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    id = useRef<string | null>(null);
  const stopping = useRef(false);
  const seen = useRef(new Set<string>()),
    pulse = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState("idle"),
    [error, setError] = useState(""),
    [lines, setLines] = useState<{ role: string; text: string }[]>([]);
  const [question, setQuestion] = useState(""),
    [answerId, setAnswerId] = useState<string | null>(null),
    [typed, setTyped] = useState("");
  const api = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const response = await fetch("/api/publisher-ready/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          action,
          id: id.current,
          ...extra,
        }),
        keepalive: action === "stop",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message ?? data.error ?? "Live unavailable");
      return data;
    },
    [runId],
  );
  const release = useCallback(() => {
    if (pulse.current) clearInterval(pulse.current);
    pulse.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    peer.current?.close();
    peer.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
  }, []);
  const stop = useCallback(async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (!id.current) {
      release();
      setState("closed");
      stopping.current = false;
      return;
    }
    setState("stopping");
    mic.current?.getTracks().forEach((track) => {
      track.enabled = false;
    });
    audio.current?.pause();
    try {
      await api("stop");
      for (let i = 0; i < 15; i++) {
        const status = await api("status");
        if (status.state === "closed") {
          release();
          setAnswerId(status.answerId);
          id.current = null;
          setState("closed");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      release();
      setError(
        "Audio stopped. Your session still needs confirmation; your words are retained for recovery.",
      );
      setState("reconcile");
    } catch {
      release();
      setError(
        "Audio stopped. The server will close the session when its heartbeat expires. You can continue typing here.",
      );
      setState("reconcile");
    } finally {
      stopping.current = false;
    }
  }, [api, release]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && id.current) void stop();
    };
    const pagehide = () => {
      if (id.current) void api("stop").catch(() => {});
      release();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pagehide);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pagehide);
      if (id.current) void api("stop").catch(() => {});
      release();
    };
  }, [api, release, stop]);
  async function start() {
    setError("");
    setState("starting");
    setAnswerId(null);
    seen.current.clear();
    setLines([]);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
        throw new Error(
          "This browser does not support Live audio. Continue with the standard interview.",
        );
      // Playback unlock stays inside the user's click on Safari; only one audio element/path.
      audio.current ??= new Audio();
      audio.current.autoplay = true;
      mic.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = new RTCPeerConnection();
      peer.current = pc;
      mic.current.getTracks().forEach((t) => pc.addTrack(t, mic.current!));
      pc.ontrack = (e) => {
        audio.current!.srcObject = e.streams[0];
        void audio
          .current!.play()
          .catch(() => setError("Tap Play Theo to enable sound."));
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc.connectionState))
          void stop();
      };
      const channel = pc.createDataChannel("oai-events");
      channel.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.event_id && seen.current.has(event.event_id)) return;
          if (event.event_id) seen.current.add(event.event_id);
          if (
            event.type === "session.input_transcript.delta" ||
            event.type === "session.output_transcript.delta"
          )
            setLines((old) => [
              ...old,
              {
                role:
                  event.type === "session.input_transcript.delta"
                    ? "You"
                    : "Theo",
                text: event.delta,
              },
            ]);
          if (event.type === "session.closed") void stop();
        } catch {
          /* Unknown events do not alter manuscript state. */
        }
      };
      await pc.setLocalDescription(await pc.createOffer());
      if (pc.iceGatheringState !== "complete")
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Audio connection timed out")),
            10000,
          );
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(timer);
              resolve();
            }
          };
        });
      const data = await api("start", { sdp: pc.localDescription?.sdp });
      id.current = data.id;
      setQuestion(data.questionId);
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      setState("active");
      pulse.current = setInterval(() => {
        void api("pulse").catch(() => {
          void stop();
        });
      }, 10000);
    } catch (e) {
      release();
      setState("error");
      setError(e instanceof Error ? e.message : "Live failed");
      if (id.current) void stop();
    }
  }
  async function saveTyped() {
    if (!typed.trim() || !question) return;
    const response = await fetch("/api/publisher-ready/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        action: "answer",
        question_id: question,
        transcript: typed,
        source: "typed",
        follow_up_of: answerId,
      }),
    });
    if (response.ok) {
      setTyped("");
      setError("Typed answer saved.");
    } else
      setError("Could not save the typed answer. Your text is still here.");
  }
  return (
    <section
      aria-label="Theo live interview"
      style={{ padding: 24, maxWidth: 700, margin: "auto" }}
    >
      <h2>Talk with Theo</h2>
      <p>
        Pause ends the audio session and saves your words. Start again to resume
        with your saved answers.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => void start()}
          disabled={!["idle", "closed", "error"].includes(state)}
        >
          Start audio
        </button>
        <button
          onClick={() => void stop()}
          disabled={!["active", "reconcile"].includes(state)}
        >
          Pause / save
        </button>
        <button onClick={() => void audio.current?.play().catch(() => {})}>
          Play Theo
        </button>
        <button
          onClick={onClose}
          disabled={["active", "starting", "stopping", "reconcile"].includes(
            state,
          )}
        >
          Return to interview
        </button>
      </div>
      <p role="status">
        {state === "active"
          ? "Listening"
          : state === "stopping"
            ? "Saving your session…"
            : state === "closed"
              ? "Audio ended and saved"
              : ""}
      </p>
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite">
        {lines.map((line, i) => (
          <span key={i}>
            <strong>{line.role}: </strong>
            {line.text}{" "}
          </span>
        ))}
      </div>
      <label>
        Continue in writing
        <textarea
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          style={{ display: "block", width: "100%", minHeight: 100 }}
        />
      </label>
      <button
        onClick={() => void saveTyped()}
        disabled={!question || !typed.trim() || state === "active"}
      >
        Save typed answer
      </button>
    </section>
  );
}
