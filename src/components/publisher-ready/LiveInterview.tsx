"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { liveDraftKey, readLiveDraft, writeLiveDraft, subscribeLiveDraft, isDraftSavePending, beginDraftSave, finishDraftSave, isLiveDraftAccount } from "@/lib/live-draft-storage";

interface TypedDraft { text: string; questionId: string; answerId: string | null }
const EMPTY_DRAFT: TypedDraft = { text: "", questionId: "", answerId: null };
const buttonStyle: CSSProperties = {
  minHeight: 44, padding: "10px 16px", borderRadius: 10,
  border: "1px solid var(--ds-input-border, #aaa)", cursor: "pointer",
};
// Session-scoped recovery keeps private author text out of durable localStorage.
function parseDraft(raw: string): TypedDraft {
  try {
    const value = JSON.parse(raw);
    if (typeof value.text === "string" && typeof value.questionId === "string")
      return { text: value.text, questionId: value.questionId, answerId: typeof value.answerId === "string" ? value.answerId : null };
  } catch { /* Missing or invalid recovery data. */ }
  return EMPTY_DRAFT;
}
/** Only mounted after the server enables Live; legacy TTS is unmounted while this is active. */
export default function LiveInterview({
  runId,
  accountId,
  onClose,
}: {
  runId: string;
  accountId: string;
  onClose: () => void;
}) {
  const peer = useRef<RTCPeerConnection | null>(null),
    mic = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    id = useRef<string | null>(null);
  const stopping = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const starting = useRef(false);
  const saving = useRef(false);
  const [savingTyped, setSavingTyped] = useState(false);
  const draftKey = liveDraftKey(accountId, runId);
  const accountActive = useSyncExternalStore(subscribeLiveDraft, () => isLiveDraftAccount(accountId), () => false);
  const pendingSave = useSyncExternalStore(subscribeLiveDraft, () => isDraftSavePending(draftKey), () => false);
  const rawDraft = useSyncExternalStore(subscribeLiveDraft, () => readLiveDraft(accountId, draftKey), () => "");
  const draft = parseDraft(rawDraft);
  const volatileDraft = useRef<TypedDraft | null>(null);
  const [fallbackDraft, setFallbackDraft] = useState<TypedDraft | null>(null);
  const currentDraft = accountActive ? fallbackDraft ?? draft : EMPTY_DRAFT;
  const updateDraft = useCallback((next: TypedDraft) => {
    try {
      if (!writeLiveDraft(accountId, draftKey, JSON.stringify(next))) return;
      volatileDraft.current = null;
      setFallbackDraft(null);
    } catch {
      volatileDraft.current = next;
      setFallbackDraft(next);
      setError("This browser cannot keep a recovery copy. Save your writing before leaving this tab.");
    }
  }, [accountId, draftKey]);
  const seen = useRef(new Set<string>()),
    pulse = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState("idle"),
    [error, setError] = useState(""),
    [lines, setLines] = useState<{ role: string; text: string }[]>([]);
  const sessionQuestion = useRef("");
  const [question, setQuestion] = useState(""),
    [answerId, setAnswerId] = useState<string | null>(null);
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
    generation.current += 1;
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
          const latest = volatileDraft.current ?? parseDraft(readLiveDraft(accountId, draftKey));
          if (latest.text && (!latest.questionId || latest.questionId === sessionQuestion.current)) {
            updateDraft({ ...latest, questionId: sessionQuestion.current, answerId: status.answerId ?? null });
          }
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
  }, [api, release, accountId, draftKey, updateDraft]);
  useEffect(() => {
    if (!accountActive) return;
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) void stop();
    };
    const pagehide = () => {
      generation.current += 1;
      if (id.current) void api("stop").catch(() => {});
      release();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pagehide);
    return () => {
      mounted.current = false;
      generation.current += 1;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", pagehide);
      if (id.current) void api("stop").catch(() => {});
      release();
    };
  }, [api, release, stop, accountActive]);
  async function start() {
    if (starting.current || !mounted.current || !isLiveDraftAccount(accountId)) return;
    starting.current = true;
    const attempt = ++generation.current;
    const isCurrent = () => mounted.current && generation.current === attempt;
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent()) { stream.getTracks().forEach((track) => track.stop()); return; }
      mic.current = stream;
      const pc = new RTCPeerConnection();
      peer.current = pc;
      mic.current.getTracks().forEach((t) => pc.addTrack(t, mic.current!));
      pc.ontrack = (e) => {
        if (!isCurrent()) return;
        audio.current!.srcObject = e.streams[0];
        void audio
          .current!.play()
          .catch(() => setError("Tap Play Theo to enable sound."));
      };
      pc.onconnectionstatechange = () => {
        if (!isCurrent()) return;
        if (["failed", "disconnected"].includes(pc.connectionState))
          void stop();
      };
      const channel = pc.createDataChannel("oai-events");
      channel.onmessage = (e) => {
        if (!isCurrent()) return;
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
      const offer = await pc.createOffer();
      if (!isCurrent()) return;
      await pc.setLocalDescription(offer);
      if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      // Do not abort this request: a late allocated session must be explicitly closed.
      const data = await api("start", { sdp: pc.localDescription?.sdp });
      if (!isCurrent()) {
        void api("stop", { id: data.id }).catch(() => {});
        return;
      }
      id.current = data.id;
      sessionQuestion.current = data.questionId;
      setQuestion(data.questionId);
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      if (!isCurrent()) return;
      setState("active");
      pulse.current = setInterval(() => {
        void api("pulse").catch(() => {
          void stop();
        });
      }, 10000);
    } catch (e) {
      if (!isCurrent()) return;
      release();
      setState("error");
      setError(e instanceof Error ? e.message : "Live failed");
      if (id.current) void stop();
    } finally {
      starting.current = false;
    }
  }
  async function saveTyped() {
    const submitted = {
      ...currentDraft,
      questionId: currentDraft.questionId || question,
      answerId: currentDraft.questionId && currentDraft.questionId !== question
        ? currentDraft.answerId : answerId ?? currentDraft.answerId,
    };
    if (["active", "starting", "stopping"].includes(state) || !submitted.text.trim() || !submitted.questionId || saving.current || !beginDraftSave(accountId, draftKey)) return;
    saving.current = true;
    setSavingTyped(true);
    try {
      const response = await fetch("/api/publisher-ready/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, action: "answer", question_id: submitted.questionId,
          transcript: submitted.text, source: "typed", follow_up_of: submitted.answerId }),
      });
      if (!response.ok) throw new Error("Save failed");
      const latest = volatileDraft.current ?? parseDraft(readLiveDraft(accountId, draftKey));
      if (latest.text === submitted.text && latest.questionId === currentDraft.questionId) {
        // Clear only the submitted revision, even if the component has since unmounted.
        const cleared = { ...submitted, text: "" };
        if (mounted.current) updateDraft(cleared);
        else {
          writeLiveDraft(accountId, draftKey, JSON.stringify(cleared));
        }
      }
      if (mounted.current) setError("Typed answer saved.");
    } catch {
      if (mounted.current) setError("Could not save the typed answer. Your text is still here. Try again.");
    } finally {
      saving.current = false;
      finishDraftSave(draftKey);
      if (mounted.current) setSavingTyped(false);
    }
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
          style={buttonStyle}
          onClick={() => void start()}
          disabled={!accountActive || !["idle", "closed", "error"].includes(state)}
        >
          Start audio
        </button>
        <button
          style={buttonStyle}
          onClick={() => void stop()}
          disabled={!["active", "reconcile"].includes(state)}
        >
          Pause / save
        </button>
        <button style={buttonStyle} onClick={() => void audio.current?.play().catch(() => {})}>
          Play Theo
        </button>
        <button
          style={buttonStyle}
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
      <label style={{ display: "block", marginTop: 16, marginBottom: 12 }}>
        Continue in writing
        <textarea
          value={currentDraft.text}
          onChange={(e) => updateDraft({ text: e.target.value, questionId: currentDraft.text ? currentDraft.questionId || question : question, answerId: currentDraft.text ? currentDraft.answerId : answerId })}
          style={{ display: "block", width: "100%", minHeight: 100, fontSize: 16, padding: 12, border: "1px solid var(--ds-input-border, #aaa)", borderRadius: 8 }}
        />
      </label>
      <button
        style={buttonStyle}
        onClick={() => void saveTyped()}
        disabled={!accountActive || savingTyped || pendingSave || !(currentDraft.questionId || question) || !currentDraft.text.trim() || ["active", "starting", "stopping"].includes(state)}
      >
        {savingTyped || pendingSave ? "Saving…" : "Save typed answer"}
      </button>
    </section>
  );
}
