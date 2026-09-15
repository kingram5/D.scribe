"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InkUpgradeModal from "@/components/ui/InkUpgradeModal";
import { INTERVIEWER_NAME, interviewerRoleLine } from "@/lib/interviewer";
import {
  BRAINSTORM_LENGTH_NUDGE_TURNS,
  userTurnCount,
  type BrainstormMessage,
} from "@/lib/brainstorm-session";
import {
  buildLiveOpeningAppend,
  formatLiveResearchContext,
  groupTranscriptFragments,
  LIVE_DEFAULT_VOICE,
  type LiveTranscriptFragment,
  type LiveVoice,
} from "@/lib/brainstorm-live";
import { conversationDigest as digestMessages, manualResearchProbe, researchProbeAt } from "@/lib/research-corpus";
import type { ResearchItem } from "@/lib/research-corpus";

interface SavedBrainstormSession {
  messages: BrainstormMessage[];
  draft: string;
}

type StudioRetryAction = "start" | "finish";

const TTS_UNLOCK_AUDIO =
  "data:audio/wav;base64,UklGRogAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWQAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

function isMessage(value: unknown): value is BrainstormMessage {
  return typeof value === "object" && value !== null &&
    ((value as BrainstormMessage).role === "user" || (value as BrainstormMessage).role === "assistant") &&
    typeof (value as BrainstormMessage).content === "string";
}

function parseSavedSession(raw: string): SavedBrainstormSession | null {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return { messages: parsed.filter(isMessage), draft: "" };
  }
  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as SavedBrainstormSession).messages)) {
    return {
      messages: (parsed as SavedBrainstormSession).messages.filter(isMessage),
      draft: typeof (parsed as SavedBrainstormSession).draft === "string" ? (parsed as SavedBrainstormSession).draft : "",
    };
  }
  return null;
}

async function liveErrorMessage(res: Response): Promise<string> {
  let message = "";
  try {
    const payload = await res.json() as { message?: unknown; error?: unknown };
    message = typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string" ? payload.error : "";
  } catch { /* non-JSON gateway page */ }

  if (res.status === 401) return "HTTP 401 — your sign-in has expired. Reload this page, sign in again, then start again.";
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? `HTTP 429 — T.H.E.O. needs a short breather. Try again in about ${Math.ceil(retryAfter)} seconds.`
      : "HTTP 429 — T.H.E.O. needs a short breather. Please wait a moment, then try again.";
  }
  if (res.status === 402) return `HTTP 402 — ${message || "you are out of Ink for this session. Upgrade your plan to continue brainstorming."}`;
  if (res.status === 403) return `HTTP 403 — ${message || "Voice is a Pro feature. Upgrade to unlock the Live studio."}`;
  if (res.status >= 500) return `HTTP ${res.status} — ${message || "T.H.E.O.'s Live studio is temporarily unavailable. Try again shortly."}`;
  return `HTTP ${res.status} — ${message || "T.H.E.O. could not start the Live studio."}`;
}

function closeServerSession(projectId: string, status: "finished" | "discarded") {
  void fetch("/api/brainstorm/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, status }),
    keepalive: true,
  }).catch(() => {});
}

function putServerSession(projectId: string, messages: BrainstormMessage[]) {
  if (messages.length === 0) return Promise.resolve();
  return fetch("/api/brainstorm/session", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      messages,
      turn_count: userTurnCount(messages),
    }),
    keepalive: true,
  }).catch(() => {});
}

function useStudioViewport() {
  const [viewport, setViewport] = useState({ height: 0, offsetTop: 0 });
  useEffect(() => {
    const visualViewport = window.visualViewport;
    const update = () => {
      setViewport({
        height: Math.round(visualViewport?.height ?? window.innerHeight),
        offsetTop: Math.round(visualViewport?.offsetTop ?? 0),
      });
    };
    update();
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return {
    "--ds-studio-viewport-height": viewport.height ? `${viewport.height}px` : "100dvh",
    "--ds-studio-viewport-top": `${viewport.offsetTop}px`,
  } as React.CSSProperties;
}

function useStudioDialog(onExit: () => void, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    const dialog = dialogRef.current;
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, onExit]);
  return dialogRef;
}

function StudioBackdrop() {
  return (
    <div className="ds-studio-bg" aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden" }}>
      <div
        className="ds-studio-bg-image"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(/theo-library.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          transform: "scaleX(-1) scale(1.14)",
          filter: "blur(30px) brightness(0.5) saturate(1.05)",
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 20%, rgba(44,36,25,0.55) 0%, rgba(26,22,16,0.88) 100%)" }} />
    </div>
  );
}

function StudioShell({ children, onExit, label }: { children: React.ReactNode; onExit: () => void; label: string }) {
  const viewportStyle = useStudioViewport();
  const dialogRef = useStudioDialog(onExit);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="ds-studio-stage"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1A1610",
        color: "#F9F7F2",
        ...viewportStyle,
      }}
    >
      <StudioBackdrop />
      <div className="ds-studio-shell-content">{children}</div>
    </div>,
    document.body,
  );
}

interface BrainstormLiveChatProps {
  projectId: string;
  onComplete: () => void;
  onBack: () => void;
  triggerFinish?: boolean;
  onFinishTriggered?: () => void;
  autoStart?: boolean;
  skipResumePrompt?: boolean;
}

export default function BrainstormLiveChat({
  projectId,
  onComplete,
  onBack,
  triggerFinish,
  onFinishTriggered,
  autoStart,
  skipResumePrompt,
}: BrainstormLiveChatProps) {
  const [messages, setMessages] = useState<BrainstormMessage[]>([]);
  const [input, setInput] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [started, setStarted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [savedMessages, setSavedMessages] = useState<BrainstormMessage[]>([]);
  const [savedDraft, setSavedDraft] = useState("");
  const [pendingResume, setPendingResume] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [showVoiceGate, setShowVoiceGate] = useState(false);
  const [ttsAvail, setTtsAvail] = useState<"loading" | "available" | "locked">("loading");
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<StudioRetryAction | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);
  const [holdingThought, setHoldingThought] = useState(false);
  const [lengthNudgeDismissed, setLengthNudgeDismissed] = useState(false);
  const [showVoiceWall, setShowVoiceWall] = useState(false);
  const [showInkWall, setShowInkWall] = useState(false);
  const [audience, setAudience] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [researchEnabled, setResearchEnabled] = useState(false);
  const [researchNote, setResearchNote] = useState<"running" | "found" | null>(null);
  const [voice] = useState<LiveVoice>(LIVE_DEFAULT_VOICE);

  const sessionKey = `brainstorm_session_${projectId}`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const eventsRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const fragmentsRef = useRef<LiveTranscriptFragment[]>([]);
  const messagesRef = useRef<BrainstormMessage[]>([]);
  const draftRef = useRef("");
  const startedRef = useRef(false);
  const readyRef = useRef(false);
  const persistSessionOnUnmountRef = useRef(true);
  const serverSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageVisibleRef = useRef(true);
  const eventSeqRef = useRef(0);
  const liveSessionIdRef = useRef<string | null>(null);
  const connectedAtRef = useRef(0);
  const lastUsageSecondsRef = useRef(0);
  const billedRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const researchFiredRef = useRef<Set<number>>(new Set());
  const researchCompletedRef = useRef(false);
  const researchCompletedAtRef = useRef<number | null>(null);
  const researchDisabledRef = useRef(false);
  const pendingDelegationRef = useRef<string | null>(null);
  const typedRef = useRef(false);

  const studioViewportStyle = useStudioViewport();

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { draftRef.current = input; }, [input]);
  useEffect(() => { startedRef.current = started; }, [started]);
  useEffect(() => { readyRef.current = ready; }, [ready]);

  const nextEventId = () => {
    eventSeqRef.current += 1;
    return `evt_${eventSeqRef.current}`;
  };

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const channel = eventsRef.current;
    if (!channel || channel.readyState !== "open") return false;
    if (!event.event_id) event.event_id = nextEventId();
    channel.send(JSON.stringify(event));
    return true;
  }, []);

  const applyFragments = useCallback((next: LiveTranscriptFragment[]) => {
    fragmentsRef.current = next;
    const grouped = groupTranscriptFragments(next);
    setMessages(grouped);
    messagesRef.current = grouped;
  }, []);

  const persistSoon = useCallback(() => {
    if (serverSyncTimerRef.current) clearTimeout(serverSyncTimerRef.current);
    serverSyncTimerRef.current = setTimeout(() => {
      serverSyncTimerRef.current = null;
      void putServerSession(projectId, messagesRef.current);
      try {
        localStorage.setItem(sessionKey, JSON.stringify({
          version: 1,
          messages: messagesRef.current,
          draft: draftRef.current,
        }));
      } catch {
        setStorageBlocked(true);
      }
    }, 400);
  }, [projectId, sessionKey]);

  const settleUsage = useCallback(async (seconds: number) => {
    if (billedRef.current) return;
    const sessionId = liveSessionIdRef.current;
    if (!sessionId) return;
    billedRef.current = true;
    try {
      await fetch("/api/brainstorm/live/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          session_id: sessionId,
          usage: { seconds },
        }),
        keepalive: true,
      });
    } catch { /* billing is settled server-side when possible */ }
  }, [projectId]);

  const teardownMedia = useCallback(() => {
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    eventsRef.current?.close();
    eventsRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    readyRef.current = false;
    setReady(false);
  }, []);

  const kickResearch = useCallback((turns: number, msgs: BrainstormMessage[], force = false, delegationId: string | null = null) => {
    if (researchDisabledRef.current) return;
    const probe = force
      ? manualResearchProbe()
      : researchProbeAt(turns, {
          completed: researchCompletedRef.current,
          fired: researchFiredRef.current,
          completedAtTurns: researchCompletedAtRef.current,
        });
    if (!probe && !delegationId) return;
    if (probe && typeof probe.key === "number") researchFiredRef.current.add(probe.key);
    if (delegationId) pendingDelegationRef.current = delegationId;
    setResearchNote("running");
    void fetch("/api/research/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        digest: digestMessages(msgs),
        force: probe?.force ?? true,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (data.disabled) {
          researchDisabledRef.current = true;
          setResearchEnabled(false);
          setResearchNote(null);
          return;
        }
        if (data.done) {
          researchCompletedRef.current = true;
          researchCompletedAtRef.current = turns;
          const added = Number(data.items_added ?? 0);
          setResearchNote(added > 0 ? "found" : null);
          if (added > 0) {
            const itemsRes = await fetch(`/api/research/items?project_id=${encodeURIComponent(projectId)}`);
            const itemsPayload = itemsRes.ok ? await itemsRes.json() as { items?: ResearchItem[] } : { items: [] };
            const recent = msgs.filter((m) => m.role === "user").slice(-6).map((m) => m.content).join(" ");
            const content = formatLiveResearchContext(itemsPayload.items ?? [], recent)
              || "Sourced material was added for this book. Offer a relevant citation if it fits, then continue the interview.";
            sendEvent({
              type: "session.thinking.append",
              delegation_id: pendingDelegationRef.current,
              content,
            });
          } else if (pendingDelegationRef.current) {
            sendEvent({
              type: "session.thinking.append",
              delegation_id: pendingDelegationRef.current,
              content: "No additional sourced material was found. Continue the interview from the conversation.",
            });
          }
          pendingDelegationRef.current = null;
          return;
        }
        setResearchNote(null);
        pendingDelegationRef.current = null;
      })
      .catch(() => {
        setResearchNote(null);
        pendingDelegationRef.current = null;
      });
  }, [projectId, sendEvent]);

  const handleLiveEvent = useCallback((event: Record<string, unknown>) => {
    const type = typeof event.type === "string" ? event.type : "";
    if (type === "session.started") {
      const session = event.session as { id?: string } | undefined;
      if (session?.id) liveSessionIdRef.current = session.id;
      readyRef.current = true;
      setReady(true);
      setConnecting(false);
      connectedAtRef.current = Date.now();
      return;
    }
    if (type === "session.input_transcript.delta" || type === "session.output_transcript.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) return;
      applyFragments([
        ...fragmentsRef.current,
        {
          speaker: type === "session.input_transcript.delta" ? "user" : "assistant",
          delta,
          start_ms: typeof event.start_ms === "number" ? event.start_ms : 0,
          end_ms: typeof event.end_ms === "number" ? event.end_ms : 0,
        },
      ]);
      persistSoon();
      return;
    }
    if (type === "session.usage.updated") {
      const seconds = Number((event.usage as { seconds?: number } | undefined)?.seconds ?? 0);
      if (Number.isFinite(seconds)) lastUsageSecondsRef.current = seconds;
      return;
    }
    if (type === "session.delegation.created") {
      const delegation = event.delegation as { id?: string; target?: string } | undefined;
      if (delegation?.id) {
        kickResearch(userTurnCount(messagesRef.current), messagesRef.current, true, delegation.id);
      }
      return;
    }
    if (type === "session.closed") {
      const seconds = Number((event.usage as { seconds?: number } | undefined)?.seconds ?? lastUsageSecondsRef.current);
      void settleUsage(seconds);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      teardownMedia();
      return;
    }
    if (type === "error") {
      const err = event.error as { message?: string } | undefined;
      setSendError(err?.message || "The Live session reported an error.");
    }
  }, [applyFragments, persistSoon, kickResearch, settleUsage, teardownMedia]);

  const closeLiveSession = useCallback(async () => {
    if (!readyRef.current || !eventsRef.current || eventsRef.current.readyState !== "open") {
      teardownMedia();
      const elapsed = connectedAtRef.current ? (Date.now() - connectedAtRef.current) / 1000 : 0;
      await settleUsage(lastUsageSecondsRef.current || elapsed);
      return;
    }
    sendEvent({ type: "session.close" });
    await new Promise<void>((resolve) => {
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        const elapsed = connectedAtRef.current ? (Date.now() - connectedAtRef.current) / 1000 : 0;
        void settleUsage(lastUsageSecondsRef.current || elapsed).finally(() => {
          teardownMedia();
          resolve();
        });
      }, 8_000);
      const previous = handleLiveEvent;
      const channel = eventsRef.current;
      const onMessage = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as Record<string, unknown>;
          previous(parsed);
          if (parsed.type === "session.closed") resolve();
        } catch { /* ignore */ }
      };
      channel?.addEventListener("message", onMessage);
    });
  }, [handleLiveEvent, sendEvent, settleUsage, teardownMedia]);

  const unlockAudio = useCallback(() => {
    const audio = audioRef.current ?? new Audio();
    audio.autoplay = true;
    audioRef.current = audio;
    if (!document.body.contains(audio)) {
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
    }
    audio.src = TTS_UNLOCK_AUDIO;
    void audio.play().then(() => audio.pause()).catch(() => {});
  }, []);

  const startLiveSession = useCallback(async (resumeMessages: BrainstormMessage[]) => {
    setConnecting(true);
    setSendError(null);
    setRetryAction(null);
    billedRef.current = false;
    fragmentsRef.current = [];
    lastUsageSecondsRef.current = 0;
    unlockAudio();

    try {
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addEventListener("track", (event) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.srcObject = new MediaStream([event.track]);
        audio.play().catch(() => {});
      });

      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micRef.current = microphone;
      for (const track of microphone.getAudioTracks()) {
        peer.addTrack(track, microphone);
      }

      const events = peer.createDataChannel("oai-events");
      eventsRef.current = events;
      events.addEventListener("message", ({ data }) => {
        try {
          handleLiveEvent(JSON.parse(String(data)) as Record<string, unknown>);
        } catch { /* ignore malformed */ }
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (peer.iceGatheringState !== "complete") {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Timed out while gathering ICE candidates")), 10_000);
          const onState = () => {
            if (!peer || peer.iceGatheringState !== "complete") return;
            clearTimeout(timeout);
            peer.removeEventListener("icegatheringstatechange", onState);
            resolve();
          };
          peer.addEventListener("icegatheringstatechange", onState);
          onState();
        });
      }

      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Missing local SDP offer");

      const res = await fetch("/api/brainstorm/live/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp,
          project_id: projectId,
          messages: resumeMessages,
          voice,
        }),
      });
      if (!res.ok) throw new Error(await liveErrorMessage(res));
      const result = await res.json() as {
        session?: { id?: string };
        transport?: { sdp?: string };
        opening?: boolean;
      };
      if (!result.transport?.sdp) throw new Error("Live session returned no SDP answer.");
      if (result.session?.id) liveSessionIdRef.current = result.session.id;
      await peer.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });

      setStarted(true);
      setMessages(resumeMessages);
      messagesRef.current = resumeMessages;
      if (savedDraft) setInput(savedDraft);

      const waitReady = async () => {
        const startedAt = Date.now();
        while (!readyRef.current && Date.now() - startedAt < 12_000) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!readyRef.current) throw new Error("The Live session connected without becoming ready.");
        sendEvent({
          type: "session.commentary.append",
          delegation_id: null,
          content: buildLiveOpeningAppend(null, resumeMessages.length > 0),
        });
      };
      void waitReady().catch((err) => {
        setSendError(err instanceof Error ? err.message : "Couldn't start the Live studio.");
        setRetryAction("start");
        teardownMedia();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't start the Live studio.";
      setSendError(message);
      setRetryAction(/HTTP 401/.test(message) ? null : "start");
      if (/HTTP 402|out of Ink/.test(message)) setShowInkWall(true);
      if (/HTTP 403|tts_locked|Pro feature/.test(message)) setShowVoiceWall(true);
      setConnecting(false);
      teardownMedia();
    }
  }, [handleLiveEvent, projectId, savedDraft, sendEvent, teardownMedia, unlockAudio, voice]);

  const requestLeave = useCallback(() => {
    if (holdingThought || summarizing) return;
    const userTurns = userTurnCount(messagesRef.current);
    if (startedRef.current && userTurns >= 1) {
      setShowLeaveGuard(true);
      return;
    }
    void closeLiveSession().finally(onBack);
  }, [holdingThought, summarizing, onBack, closeLiveSession]);

  const dialogRef = useStudioDialog(requestLeave, started && !showResume && !showVoiceGate && !summarizing && !holdingThought);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!cancelled && p?.audience) setAudience(p.audience); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    let local: SavedBrainstormSession | null = null;
    try {
      const raw = localStorage.getItem(sessionKey);
      if (raw) local = parseSavedSession(raw);
    } catch {
      setStorageBlocked(true);
    }
    fetch(`/api/brainstorm/session?project_id=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const serverMessages = Array.isArray(data?.session?.messages)
          ? (data.session.messages as BrainstormMessage[]).filter(isMessage)
          : [];
        const localMessages = local?.messages ?? [];
        const winner = localMessages.length > serverMessages.length
          ? { messages: localMessages, draft: local?.draft ?? "" }
          : { messages: serverMessages, draft: localMessages.length === serverMessages.length ? local?.draft ?? "" : "" };
        if (winner.messages.length >= 2 || winner.draft.trim()) {
          setSavedMessages(winner.messages);
          setSavedDraft(winner.draft);
          if (skipResumePrompt) {
            setPendingResume(true);
            setShowVoiceGate(true);
          } else {
            setShowResume(true);
          }
        } else if (autoStart) {
          setShowVoiceGate(true);
        }
        setHydrating(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (local && (local.messages.length >= 2 || local.draft.trim())) {
          setSavedMessages(local.messages);
          setSavedDraft(local.draft);
          setShowResume(true);
        } else if (autoStart) {
          setShowVoiceGate(true);
        }
        setHydrating(false);
      });
    return () => { cancelled = true; };
  }, [autoStart, projectId, sessionKey, skipResumePrompt]);

  useEffect(() => {
    if (!showVoiceGate) return;
    setTtsAvail("loading");
    fetch("/api/ink/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) { setTtsAvail("locked"); return; }
        const extraVoice = Number(d.topup_tts_chars ?? 0);
        if (d.tts_limit === 0 && extraVoice <= 0) setTtsAvail("locked");
        else setTtsAvail("available");
      })
      .catch(() => setTtsAvail("locked"));
  }, [showVoiceGate]);

  useEffect(() => {
    fetch("/api/research/run")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.enabled === false || d?.disabled) {
          researchDisabledRef.current = true;
          setResearchEnabled(false);
        } else if (d?.enabled) {
          setResearchEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => {
    persistSessionOnUnmountRef.current && startedRef.current && messagesRef.current.length > 0 && (() => {
      try {
        localStorage.setItem(sessionKey, JSON.stringify({
          version: 1,
          messages: messagesRef.current,
          draft: draftRef.current,
        }));
      } catch { /* storage blocked */ }
      void putServerSession(projectId, messagesRef.current);
    })();
    teardownMedia();
  }, [projectId, sessionKey, teardownMedia]);

  useEffect(() => {
    const onVisibilityChange = () => {
      pageVisibleRef.current = document.visibilityState === "visible";
      if (!pageVisibleRef.current && readyRef.current) {
        sendEvent({ type: "session.input_audio.mute" });
        micRef.current?.getTracks().forEach((track) => { track.enabled = false; });
        void closeLiveSession();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [closeLiveSession, sendEvent]);

  const beginSession = useCallback(() => {
    const resume = pendingResume ? savedMessages : messages;
    setShowVoiceGate(false);
    setShowResume(false);
    setPendingResume(false);
    void startLiveSession(resume);
  }, [messages, pendingResume, savedMessages, startLiveSession]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    sendEvent({ type: next ? "session.input_audio.mute" : "session.input_audio.unmute" });
    micRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
  }, [muted, sendEvent]);

  const sendTyped = useCallback(() => {
    const text = input.trim();
    if (!text || !ready) return;
    typedRef.current = false;
    setInput("");
    const now = fragmentsRef.current.reduce((max, f) => Math.max(max, f.end_ms), 0) + 10;
    applyFragments([
      ...fragmentsRef.current,
      { speaker: "user", delta: text, start_ms: now, end_ms: now + 1 },
    ]);
    sendEvent({
      type: "session.commentary.append",
      delegation_id: null,
      content: `The author just typed the following. Treat it as their spoken turn and continue the interview:\n${text}`,
    });
    persistSoon();
    const nextMessages = groupTranscriptFragments(fragmentsRef.current);
    kickResearch(userTurnCount(nextMessages), nextMessages);
  }, [applyFragments, input, kickResearch, persistSoon, ready, sendEvent]);

  const finishBrainstorm = useCallback(async () => {
    const userMessages = messagesRef.current.filter((m) => m.role === "user");
    if (userMessages.length < 2) return;
    setSummarizing(true);
    setSendError(null);
    setRetryAction(null);
    await closeLiveSession();
    try {
      const res = await fetch("/api/brainstorm/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesRef.current, project_id: projectId }),
      });
      if (res.ok) {
        persistSessionOnUnmountRef.current = false;
        try { localStorage.removeItem(sessionKey); } catch { /* storage blocked */ }
        closeServerSession(projectId, "finished");
        onComplete();
      } else {
        const err = await res.json().catch(() => ({}));
        setSummarizing(false);
        setSendError(err.message || "Couldn't add this session to your sources. Your answers are still here — try again.");
        setRetryAction("finish");
      }
    } catch {
      setSummarizing(false);
      setSendError("Couldn't add this session to your sources. Your answers are still here — try again.");
      setRetryAction("finish");
    }
  }, [closeLiveSession, onComplete, projectId, sessionKey]);

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const canFinish = userMessageCount >= 2 && !connecting && !summarizing && ready;
  const canTakeABreak = userMessageCount >= 1 && !connecting && !summarizing && !holdingThought;

  useEffect(() => {
    if (triggerFinish && canFinish) {
      void finishBrainstorm();
      onFinishTriggered?.();
    } else if (triggerFinish) {
      onFinishTriggered?.();
    }
  }, [triggerFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  const takeABreak = useCallback(async () => {
    setShowLeaveGuard(false);
    setHoldingThought(true);
    await putServerSession(projectId, messagesRef.current);
    await closeLiveSession();
    window.setTimeout(() => { onBack(); }, 900);
  }, [closeLiveSession, onBack, projectId]);

  const discardConversation = useCallback((after: () => void) => {
    persistSessionOnUnmountRef.current = false;
    try { localStorage.removeItem(sessionKey); } catch { /* storage blocked */ }
    closeServerSession(projectId, "discarded");
    void closeLiveSession().finally(after);
  }, [closeLiveSession, projectId, sessionKey]);

  if (hydrating) {
    return (
      <StudioShell onExit={onBack} label="Brainstorm studio">
        <div className="brainstorm-spinner" />
        <style>{`.brainstorm-spinner { width: 32px; height: 32px; border: 2.5px solid rgba(0,0,0,0.08); border-top-color: var(--ds-accent-500); border-radius: 50%; animation: bspin 0.8s linear infinite; } @keyframes bspin { to { transform: rotate(360deg); } }`}</style>
      </StudioShell>
    );
  }

  if (holdingThought) {
    return (
      <StudioShell onExit={onBack} label="Holding your conversation">
        <p style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: "1.35rem", color: "var(--ds-ink)", textAlign: "center" }}>
          I&apos;ll hold that thought.
        </p>
      </StudioShell>
    );
  }

  if (showResume) {
    const lastMsg = [...savedMessages].reverse().find((m) => m.role === "user") ?? savedMessages[savedMessages.length - 1];
    const previewSource = savedDraft.trim() || lastMsg?.content || "";
    const preview = previewSource.slice(0, 110) + (previewSource.length > 110 ? "…" : "");
    return (
      <StudioShell onExit={onBack} label="Resume brainstorm studio">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, maxWidth: 620 }}>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: "1.4rem", fontWeight: 400, color: "var(--ds-ink)", marginBottom: 8 }}>
            Continue where you left off?
          </h2>
          <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--text-tertiary)", fontFamily: "var(--font-lora), serif", maxWidth: 320, lineHeight: 1.6 }}>
            &ldquo;{preview}&rdquo;
          </p>
          <button className="transcribe-btn" onClick={() => { setPendingResume(true); setShowVoiceGate(true); setShowResume(false); }}>
            Continue Session →
          </button>
          <button
            className="transcribe-btn"
            style={{ background: "rgba(249,247,242,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(249,247,242,0.22)" }}
            onClick={() => { setSavedMessages([]); setSavedDraft(""); setPendingResume(false); setShowVoiceGate(true); setShowResume(false); }}
          >
            Start fresh
          </button>
        </div>
      </StudioShell>
    );
  }

  if (showVoiceGate) {
    const locked = ttsAvail === "locked";
    return (
      <StudioShell onExit={onBack} label="Live brainstorm voice">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 420, textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: "1.4rem", fontWeight: 400, color: "var(--ds-ink)", margin: 0 }}>
            Live studio
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif", lineHeight: 1.5, margin: 0 }}>
            {locked
              ? "Live voice is available on Pro and Premium, or with a voice pack."
              : "T.H.E.O. listens and speaks at the same time. Interrupt him whenever you like."}
          </p>
          {locked ? (
            <>
              <button className="transcribe-btn" onClick={() => setShowVoiceWall(true)}>View plans</button>
              <button className="ds-studio-exit" onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                ← Back to upload options
              </button>
            </>
          ) : (
            <button className="transcribe-btn" disabled={ttsAvail === "loading" || connecting} onClick={beginSession}>
              {ttsAvail === "loading" || connecting ? "Connecting…" : "Start talking →"}
            </button>
          )}
          {showVoiceWall && <InkUpgradeModal reason="tts_locked" onClose={() => setShowVoiceWall(false)} />}
        </div>
      </StudioShell>
    );
  }

  if (summarizing) {
    return (
      <StudioShell onExit={onBack} label="Saving brainstorm session">
        <p style={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif" }}>
          Distilling your ideas into source material...
        </p>
      </StudioShell>
    );
  }

  interface Exchange { q?: string; a?: string }
  const exchanges: Exchange[] = [];
  for (const m of messages) {
    if (m.role === "assistant") exchanges.push({ q: m.content });
    else {
      const last = exchanges[exchanges.length - 1];
      if (last && last.a == null) last.a = m.content;
      else exchanges.push({ a: m.content });
    }
  }
  const live = exchanges[exchanges.length - 1];
  const receding = exchanges.slice(0, -1).slice(-2);
  const older = exchanges.slice(0, -1).slice(0, -2);
  const thinking = connecting || (!ready && started);
  const composing = input.trim().length > 0;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Live brainstorm studio"
      tabIndex={-1}
      className="ds-studio-stage"
      style={{ display: "flex", flexDirection: "column", background: "#1A1610", color: "#F9F7F2", ...studioViewportStyle }}
    >
      <StudioBackdrop />
      <div className="ds-studio-header">
        <button className="ds-studio-exit" onClick={requestLeave} aria-label="Exit studio" style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "rgba(249,247,242,0.6)", padding: 4 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
          <span className="ds-label" style={{ color: "rgba(249,247,242,0.6)" }}>Exit studio</span>
        </button>
        <span className="ds-label ds-studio-title" style={{ color: "rgba(249,247,242,0.75)", marginLeft: 8, maxWidth: "min(52vw, 640px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {INTERVIEWER_NAME} <span style={{ color: "rgba(249,247,242,0.4)" }}>· Live · {interviewerRoleLine(audience)}</span>
        </span>
        <div className="ds-studio-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {older.length > 0 && (
            <button onClick={() => setShowHistory((open) => !open)} aria-expanded={showHistory} aria-controls="ds-studio-history" style={{ background: showHistory ? "rgba(249,247,242,0.12)" : "none", color: "rgba(249,247,242,0.55)", border: "1px solid rgba(249,247,242,0.18)", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
              History
            </button>
          )}
        </div>
      </div>

      <div className="ds-studio-content">
        <div className="ds-studio-conversation" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", maxWidth: 880, width: "100%", margin: "0 auto" }}>
          {receding.map((ex, i) => (
            <div key={i} style={{ marginBottom: 26, opacity: i === receding.length - 1 ? 0.55 : 0.35 }}>
              {ex.q && <p style={{ fontFamily: "var(--font-lora), serif", fontSize: i === receding.length - 1 ? 19 : 16, lineHeight: 1.4, margin: 0, color: "#F9F7F2" }}>{ex.q}</p>}
              {ex.a && <p style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: i === receding.length - 1 ? 16 : 14, lineHeight: 1.45, margin: "8px 0 0", color: "rgba(249,247,242,0.75)" }}>{ex.a}</p>}
            </div>
          ))}
          <div style={{ marginBottom: 8 }}>
            <div className="ds-label ds-label--accent" style={{ marginBottom: 10 }}>
              {thinking ? `${INTERVIEWER_NAME} · connecting` : `${INTERVIEWER_NAME} · live`}
            </div>
            {thinking ? (
              <p aria-live="polite" style={{ fontFamily: "var(--font-lora), serif", fontSize: 30, margin: 0, color: "rgba(249,247,242,0.45)" }}>
                <span className="ds-stage-dots">· · ·</span>
              </p>
            ) : (
              <p aria-live="polite" style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(24px, 3.2vw, 38px)", lineHeight: 1.28, margin: 0, color: "#F9F7F2" }}>
                {live?.q}
              </p>
            )}
            {live?.a && (
              <p style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: "clamp(18px, 2.2vw, 24px)", lineHeight: 1.4, margin: "14px 0 0", color: "rgba(249,247,242,0.7)" }}>
                {live.a}
              </p>
            )}
          </div>
          {composing && (
            <div style={{ marginTop: 18 }}>
              <div className="ds-label" style={{ color: "rgba(249,247,242,0.45)", marginBottom: 8 }}>You · typing</div>
              <p style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(20px, 2.6vw, 30px)", lineHeight: 1.35, margin: 0, color: "rgba(249,247,242,0.65)" }}>
                {input}<span className="ds-stage-cursor" aria-hidden="true" />
              </p>
            </div>
          )}
        </div>
        {showHistory && (
          <aside id="ds-studio-history" className="ds-studio-history" aria-label="Full conversation">
            {messages.map((m, i) => (
              <p key={i} style={{ fontSize: 13, lineHeight: 1.55, margin: "0 0 12px", fontFamily: m.role === "assistant" ? "var(--font-lora), serif" : "var(--font-manrope), sans-serif", color: m.role === "assistant" ? "rgba(249,247,242,0.85)" : "rgba(249,247,242,0.55)" }}>
                <span className="ds-label" style={{ display: "block", fontSize: 9, color: m.role === "assistant" ? "#C17A47" : "rgba(249,247,242,0.35)", marginBottom: 3 }}>
                  {m.role === "assistant" ? INTERVIEWER_NAME : "You"}
                </span>
                {m.content}
              </p>
            ))}
          </aside>
        )}
      </div>

      {(sendError || storageBlocked) && (
        <div role="alert" style={{ maxWidth: 880, width: "100%", margin: "0 auto 10px", padding: "10px 16px", borderRadius: 10, background: "rgba(193,122,71,0.16)", border: "1px solid rgba(224,140,72,0.45)", color: "#F2D7C2", fontSize: 13, display: "flex", gap: 12 }}>
          <span style={{ flex: 1 }}>
            {sendError ?? "This browser is blocking storage, so this session won't be saved if you close the tab."}
          </span>
          {retryAction && (
            <button onClick={() => { const action = retryAction; setSendError(null); setRetryAction(null); if (action === "start") beginSession(); else void finishBrainstorm(); }} style={{ background: "var(--ds-accent-500)", color: "#fff", border: "none", borderRadius: 100, padding: "6px 16px", fontSize: 12, cursor: "pointer" }}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className="ds-studio-composer" style={{ maxWidth: 880, width: "100%", margin: "0 auto" }}>
        <div className="ds-studio-composer-form" style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button
            className="ds-studio-mic"
            onClick={toggleMute}
            aria-pressed={!muted}
            disabled={!ready}
            title={muted ? "Unmute microphone" : "Mute microphone"}
            style={{
              background: muted ? "rgba(249,247,242,0.08)" : "#ef4444",
              border: muted ? "1px solid rgba(249,247,242,0.18)" : "none",
              borderRadius: 12,
              height: 52,
              padding: "0 18px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: ready ? "pointer" : "default",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: muted ? "rgba(249,247,242,0.7)" : "#fff" }}>
              {muted ? "Muted" : "Listening"}
            </span>
          </button>
          <textarea
            className="ds-studio-textarea"
            ref={inputRef}
            value={input}
            onChange={(e) => { typedRef.current = true; setInput(e.target.value); }}
            onKeyDown={(e) => {
              const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendTyped();
              }
            }}
            placeholder={ready ? "Speak, or type while he listens…" : "Connecting…"}
            disabled={!ready}
            rows={1}
            aria-label="Your answer"
            style={{ flex: 1, minWidth: 220, border: "1px solid rgba(249,247,242,0.18)", outline: "none", resize: "none", fontSize: 16, background: "rgba(249,247,242,0.06)", color: "#F9F7F2", lineHeight: 1.5, maxHeight: 120, borderRadius: 12, padding: "14px 16px" }}
          />
          <button className="ds-studio-send" onClick={sendTyped} disabled={!input.trim() || !ready} aria-label="Send answer" style={{ background: input.trim() && ready ? "#C17A47" : "rgba(249,247,242,0.08)", border: "none", borderRadius: 12, width: 52, height: 52, cursor: input.trim() && ready ? "pointer" : "default" }}>
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke={input.trim() && ready ? "#fff" : "rgba(249,247,242,0.35)"} strokeWidth="1.5"><path d="M14 2L7 9" /><path d="M14 2l-5 12-2-5-5-2z" /></svg>
          </button>
          <button className="ds-studio-finish" onClick={() => void finishBrainstorm()} disabled={!canFinish} style={{ background: "none", color: canFinish ? "#F9F7F2" : "rgba(249,247,242,0.3)", border: `1px solid ${canFinish ? "rgba(249,247,242,0.35)" : "rgba(249,247,242,0.12)"}`, borderRadius: 12, height: 52, padding: "0 18px", fontSize: 13, fontWeight: 600, cursor: canFinish ? "pointer" : "default" }}>
            Finish &amp; add to sources
          </button>
          {canTakeABreak && (
            <button className="ds-studio-break" type="button" onClick={() => { void takeABreak(); }} style={{ background: "none", color: "rgba(249,247,242,0.75)", border: "1px solid rgba(249,247,242,0.22)", borderRadius: 12, height: 52, padding: "0 18px", fontSize: 13, cursor: "pointer" }}>
              Take a break
            </button>
          )}
        </div>
        {userMessageCount >= BRAINSTORM_LENGTH_NUDGE_TURNS && !lengthNudgeDismissed && (
          <p style={{ fontSize: 12.5, color: "rgba(249,247,242,0.82)", marginTop: 10 }}>
            We&apos;ve covered a lot of ground.{" "}
            <button type="button" onClick={() => setLengthNudgeDismissed(true)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>Dismiss</button>
          </p>
        )}
        {researchEnabled && (
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
            {researchNote && (
              <p style={{ margin: 0, fontSize: 11, color: "rgba(249,247,242,0.45)" }}>
                {researchNote === "running" ? `${INTERVIEWER_NAME} is gathering more on your topic…` : `${INTERVIEWER_NAME} found some material for this book.`}
              </p>
            )}
            <button type="button" onClick={() => kickResearch(userMessageCount, messages, true)} disabled={researchNote === "running"} style={{ background: "none", border: "none", color: "rgba(249,247,242,0.5)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
              Have {INTERVIEWER_NAME} dig into this topic
            </button>
          </div>
        )}
      </div>

      {showInkWall && <InkUpgradeModal reason="ink" onClose={() => setShowInkWall(false)} />}
      {showVoiceWall && <InkUpgradeModal reason="tts_locked" onClose={() => setShowVoiceWall(false)} />}

      {showLeaveGuard && (
        <div role="dialog" aria-modal="true" aria-label="Leave the studio?" style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(26,22,16,0.72)", padding: 24 }}>
          <div style={{ width: "min(420px, 100%)", background: "#2C2419", border: "1px solid rgba(249,247,242,0.16)", borderRadius: 16, padding: "28px 24px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 400, fontSize: "1.35rem" }}>Want me to hold this conversation?</h2>
            <button className="transcribe-btn" onClick={() => { void takeABreak(); }}>Hold that thought</button>
            <button onClick={() => discardConversation(onBack)} style={{ background: "none", border: "none", color: "rgba(249,247,242,0.7)", cursor: "pointer" }}>Throw it away</button>
            <button onClick={() => setShowLeaveGuard(false)} style={{ background: "none", border: "none", color: "rgba(249,247,242,0.55)", cursor: "pointer" }}>Keep talking</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
