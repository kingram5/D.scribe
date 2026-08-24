"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import TtsMeter from "@/components/ui/TtsMeter";
import InkUpgradeModal from "@/components/ui/InkUpgradeModal";
import { INTERVIEWER_NAME, interviewerRoleLine } from "@/lib/interviewer";
import {
  BRAINSTORM_LENGTH_NUDGE_TURNS,
  pickBrainstormResume,
  userTurnCount,
  type BrainstormMessage,
} from "@/lib/brainstorm-session";
import { INK_LIMITS } from "@/lib/tiers";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SavedBrainstormSession {
  messages: Message[];
  draft: string;
}

type StudioRetryAction = "start" | "send" | "finish";

// A 12.5ms silent WAV. iOS only grants media playback permission from the tap
// itself, not from the later TTS fetch or SSE callback. Two samples can end
// before Safari creates a playback session, so keep this long enough to start
// and immediately pause it without leaving output active for recognition.
const TTS_UNLOCK_AUDIO = "data:audio/wav;base64,UklGRogAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWQAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

/* Hands-free capture: Web Speech recognition is gone from this path. Seven
   live-iPhone rounds (#18–#24) proved SpeechRecognition and the TTS <audio>
   element cannot share the iOS audio session — whichever side yields, the
   other is dead on the next turn. Instead the Speak tap opens ONE getUserMedia
   stream that stays open for the entire session, INCLUDING while T.H.E.O.'s
   audio plays. The studio watches that stream's level itself, records each
   answer as a clip, and sends it to /api/brainstorm/stt (Deepgram) for text.
   Nothing is ever re-started after playback, so iOS has nothing to refuse. */

/** Kyle's 3-second quiet auto-send. Hard product requirement — do not change. */
const QUIET_SEND_MS = 3000;
const VAD_TICK_MS = 50;
/* Mic RMS (0..1) above this counts as the author speaking. Phone-mic AGC puts
   speech well above 0.05; idle room noise sits under 0.01. */
const VOICE_RMS_THRESHOLD = 0.02;
/* After T.H.E.O. finishes, wait this long before capture re-arms so the tail
   of his last clip (or its room echo) cannot open a segment. */
const GATE_REARM_DELAY_MS = 350;
/* A segment that has heard no speech yet restarts, so an author thinking in
   silence never accumulates a huge upload of nothing. */
const IDLE_SEGMENT_RESET_MS = 20_000;
/* Safety bound on one spoken answer; matches the server's size expectations. */
const MAX_SEGMENT_MS = 180_000;
/* iOS can hand the mic back muted for a beat after playback ends. Only after
   this grace period is a muted track treated as a real failure. */
const MUTED_MIC_GRACE_MS = 1500;
/* Same candidate order as the Record card: iOS/iPadOS Safari records
   audio/mp4 and supports NEITHER webm variant. First supported wins. */
const RECORDER_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

/* Live words while speaking: the same mic stream ALSO feeds Deepgram's
   streaming endpoint over a WebSocket, so interim words appear in the
   composer as they are said — the piece Web Speech used to provide. The
   socket authorizes with a 30-second server-minted token (never the real
   key), opens per spoken turn, and is pure display/latency sugar: if it
   fails, the recorded clip still delivers the whole turn through
   /api/brainstorm/stt. */
const LIVE_STT_URL = "wss://api.deepgram.com/v1/listen" +
  "?model=nova-3&encoding=linear16&sample_rate=16000&channels=1" +
  "&interim_results=true&smart_format=true&punctuate=true&mip_opt_out=true";
/* Audio captured while the socket is still connecting is queued so the first
   words of an answer are never lost. ~1 minute at 16 kHz bounds memory if the
   handshake stalls. */
const PCM_QUEUE_MAX_CHUNKS = 700;

/** Fold mic audio down to 16 kHz mono PCM for Deepgram's streaming endpoint —
 *  phones capture at 44.1/48 kHz, which is bandwidth wasted on speech. */
function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / 16000;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const sample = sum / Math.max(1, end - start);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  }
  return out;
}

/** Kyle tests on a real iPhone with no devtools attached. Mirror hands-free
 *  failures to the server log so "it's not picking up" is diagnosable after
 *  the fact instead of vanishing with the tab. */
function reportHandsFreeIssue(message: string) {
  try {
    void fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundary: "brainstorm-hands-free", message }),
      keepalive: true,
    }).catch(() => { /* logging must never break the studio */ });
  } catch { /* logging must never break the studio */ }
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null &&
    ((value as Message).role === "user" || (value as Message).role === "assistant") &&
    typeof (value as Message).content === "string";
}

/** Supports the pre-M3 array format so interrupted existing sessions remain resumable. */
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

interface BrainstormChatProps {
  projectId: string;
  onComplete: () => void;
  onBack: () => void;
  triggerFinish?: boolean;
  onFinishTriggered?: () => void;
  /**
   * The caller already showed a "Start Brainstorming" screen (the Meet T.H.E.O
   * lobby), so skip this component's own pre-start screen and go straight to
   * the voice choice. Without it the user sees a second identical CTA.
   */
  autoStart?: boolean;
  /**
   * The upload tile already chose Continue, so skip the second
   * "Continue where you left off?" prompt and go to the voice choice.
   */
  skipResumePrompt?: boolean;
}

function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * API routes return either { message } or { error }. The prior client only read
 * `message`, then replaced everything with "Couldn't connect", including an
 * expired sign-in, rate limit, Ink balance, or an unavailable T.H.E.O service.
 */
async function brainstormErrorMessage(res: Response): Promise<string> {
  let message = "";
  try {
    const payload = await res.json() as { message?: unknown; error?: unknown };
    message = typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string" ? payload.error : "";
  } catch {
    // A proxy error page is not JSON. The status-specific message below is
    // still more useful than pretending that the user's network failed.
  }

  if (res.status === 401) return "HTTP 401 — your sign-in has expired. Reload this page, sign in again, then send your answer.";
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? `HTTP 429 — T.H.E.O. needs a short breather. Try again in about ${Math.ceil(retryAfter)} seconds.`
      : "HTTP 429 — T.H.E.O. needs a short breather. Please wait a moment, then try again.";
  }
  if (res.status === 402) return `HTTP 402 — ${message || "you are out of Ink for this session. Upgrade your plan to continue brainstorming."}`;
  if (res.status === 403) return `HTTP 403 — ${message || "this account cannot use the brainstorm right now. Check your account access and try again."}`;
  if (res.status >= 500) return `HTTP ${res.status} — ${message || "T.H.E.O.'s service is temporarily unavailable. Try again shortly."}`;
  return `HTTP ${res.status} — ${message || "T.H.E.O. could not process that request."}`;
}

function brainstormFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  // These browser-level errors carry implementation detail, not an actionable
  // explanation. Preserve route messages above, but translate mobile network
  // failures into the recovery the author can actually take.
  if (/no stream/i.test(message)) {
    return "T.H.E.O. returned HTTP 200 without a response stream. Your answer is safe, so try again.";
  }
  if (/failed to fetch|networkerror|load failed|abort|body stream/i.test(message)) {
    return "We couldn't reach T.H.E.O. Check your connection, then try again.";
  }
  return message || "T.H.E.O. could not be reached right now.";
}

async function ttsErrorMessage(res: Response): Promise<string> {
  let detail = "";
  try {
    const payload = await res.json() as { message?: unknown; error?: unknown };
    detail = typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string" ? payload.error : "";
  } catch {
    // A non-JSON gateway response still has an actionable HTTP status.
  }
  return `T.H.E.O.'s voice returned HTTP ${res.status}${detail ? ` — ${detail}` : ""}`;
}

async function sttErrorMessage(res: Response): Promise<string> {
  let detail = "";
  try {
    const payload = await res.json() as { message?: unknown; error?: unknown };
    detail = typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string" ? payload.error : "";
  } catch {
    // A non-JSON gateway response still has an actionable HTTP status.
  }
  if (res.status === 401) return "HTTP 401 — your sign-in has expired. Reload this page, sign in again, then tap Speak.";
  return `Turning your speech into text returned HTTP ${res.status}${detail ? ` — ${detail}` : ""}.`;
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
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute("inert") && element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
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

/**
 * Every studio screen — resume, voice choice, summarizing, and the session
 * itself — renders full-screen through this shell. Rendering them inline made
 * them inherit the caller's panel width, which is why they read as a side
 * panel next to the lobby instead of taking over the page.
 */
function StudioShell({ children, onExit, label = "Brainstorm studio" }: { children: React.ReactNode; onExit: () => void; label?: string }) {
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
      {/* maxHeight + scroll: centering a card taller than the viewport clips it
          at BOTH edges with no way to reach either — real on any phone in
          landscape, where the resume prompt is the first screen a returning
          user sees and both its buttons can be off-screen. MeetTheoPanel
          already fixes this for itself; the shell never inherited it. */}
      <div className="ds-studio-shell-content">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** The lobby's library, thrown far out of focus, behind every studio screen. */
function StudioBackdrop() {
  return (
    <div className="ds-studio-bg" aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden" }}>
      {/* A still, deliberately. This was the library VIDEO under blur(30px):
          a CSS filter disqualifies a <video> from the zero-copy overlay plane,
          so every frame ran decode -> texture -> multi-pass blur -> composite,
          24x a second, for the entire session. At sigma 60 device px nothing of
          the fire loop survived anyway, and it also held a second decoder open
          on a file the paused lobby was already holding. Same picture, no cost,
          and it needs no reduced-motion guard because it does not move. */}
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

function closeServerSession(projectId: string, status: "finished" | "discarded") {
  void fetch("/api/brainstorm/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, status }),
    keepalive: true,
  }).catch(() => { /* a failed close must never block leaving */ });
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
  }).catch(() => { /* localStorage still holds the draft */ });
}

export default function BrainstormChat({ projectId, onComplete, onBack, triggerFinish, onFinishTriggered, autoStart, skipResumePrompt }: BrainstormChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [started, setStarted] = useState(false);
  const [listening, setListening] = useState(false);
  /* Hands-free (Kyle 2026-08-09): Speak is a session toggle, not a per-turn button. While
     it is on the mic re-arms itself as soon as Theo has finished — the user should never
     have to reach for the button again mid-conversation. */
  const [handsFree, setHandsFree] = useState(false);
  // Capture callbacks outlive the render that created them. Keep the session
  // switch in a ref so timers and recorder callbacks read the live value.
  const handsFreeRef = useRef(false);
  /* True while TTS audio is actually playing. Recognition remains alive, and
     this state/ref pair gates its results until T.H.E.O. gives the floor back. */
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const streamingRef = useRef(false);
  const [showResume, setShowResume] = useState(false);
  const [savedMessages, setSavedMessages] = useState<Message[]>([]);
  const [savedDraft, setSavedDraft] = useState("");
  const [showTtsPrompt, setShowTtsPrompt] = useState(false);
  // The studio had no error surface at all: every failure was a console.error or
  // a bare return, so a dead send looked like T.H.E.O repeating himself.
  const [sendError, setSendError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<StudioRetryAction | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [pendingResume, setPendingResume] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [showLeaveGuard, setShowLeaveGuard] = useState(false);
  const [holdingThought, setHoldingThought] = useState(false);
  const [lengthNudgeDismissed, setLengthNudgeDismissed] = useState(false);
  const [ttsAvail, setTtsAvail] = useState<"loading" | "available" | "locked" | "exhausted">("loading");
  const [showVoiceWall, setShowVoiceWall] = useState(false);
  const [showInkWall, setShowInkWall] = useState(false);
  const [usageNudge, setUsageNudge] = useState<"tts" | "ink" | null>(null);
  const [usageNudgeKey, setUsageNudgeKey] = useState<string | null>(null);
  // Safari does not expose the hardware Silent switch to web pages. Be honest
  // about that limitation before an iPhone owner mistakes silent playback for a
  // dead session.
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [ttsFailed, setTtsFailed] = useState(false);
  // True while a finished clip is at Deepgram being turned into text. Gates
  // capture (no new segment mid-round-trip) and labels the stage honestly.
  const [transcribing, setTranscribing] = useState(false);
  const transcribingRef = useRef(false);
  const sessionKey = `brainstorm_session_${projectId}`;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // ── Hands-free capture pipeline ──
  // One stream for the whole session, opened by the Speak tap and NEVER
  // stopped while T.H.E.O. talks: stopping (or re-requesting) it is what iOS
  // punishes by silently starving whichever side restarts.
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  // Marks the live segment as thrown away (gate closed, teardown) so its
  // onstop must not transcribe or send.
  const discardSegmentRef = useRef<(() => void) | null>(null);
  const segmentHasSpeechRef = useRef(false);
  const segmentStartedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const gateOpenedAtRef = useRef(0);
  const trackMutedAtRef = useRef(0);
  const micReacquireTriedRef = useRef(false);
  const micStartingRef = useRef(false);
  const listeningRef = useRef(false);
  // ── Live streaming transcription (display while speaking) ──
  const liveSocketRef = useRef<WebSocket | null>(null);
  // off → connecting → open; "failed" hands the turn to the clip fallback.
  const liveStateRef = useRef<"off" | "connecting" | "open" | "failed">("off");
  // Bumped whenever a turn ends so stale socket callbacks cannot touch a new one.
  const liveTurnRef = useRef(0);
  const liveFinalRef = useRef("");
  const liveInterimRef = useRef("");
  const pcmQueueRef = useRef<Int16Array[]>([]);
  const pcmNodeRef = useRef<ScriptProcessorNode | null>(null);
  // Live captions failing must not be invisible (that is how every mic bug on
  // this feature hid), but it also must not nag on every turn: one on-screen
  // explanation per session, every incident to the server log.
  const liveIssueNoticedRef = useRef(false);
  // Live input level, written directly to a DOM node from the meter loop so
  // the author can SEE the mic hearing them without 20 renders a second.
  const micLevelFillRef = useRef<HTMLSpanElement | null>(null);
  // Autosave support: the flush handlers fire outside the effect closure, so
  // they read the latest transcript from a ref rather than a captured value.
  const messagesRef = useRef<Message[]>([]);
  const draftRef = useRef("");
  const startedRef = useRef(false);
  const persistSessionOnUnmountRef = useRef(true);
  const serverSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Browser interruption can leave a fetch/TTS callback running after the app
  // has been backgrounded. Re-check this mutable flag at the callback boundary,
  // not only in React effects.
  const pageVisibleRef = useRef(true);
  // True once the user hand-edits the composer, so a returning transcript
  // cannot overwrite what they typed. Cleared when a turn is sent.
  const typedRef = useRef(false);
  const maxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSendRef = useRef<((text?: string) => void) | null>(null);

  // TTS state. Keep playback on an HTML media element: iPhone routes media
  // audio differently from Web Audio, while AudioContext can remain silent
  // behind the hardware ringer path.
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const ttsEnabledRef = useRef(true);
  // Fetching sentence audio concurrently lets faster later responses jump ahead
  // of earlier ones. Keep text requests ordered as well as media playback.
  const ttsRequestQueueRef = useRef<string[]>([]);
  const ttsRequestInFlightRef = useRef(false);
  const ttsRequestGenerationRef = useRef(0);
  const audioQueueRef = useRef<Array<{ url: string; text: string }>>([]);
  const isPlayingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUnlockGenerationRef = useRef(0);
  const ttsUnlockPendingRef = useRef(false);
  const ttsUnlockReadyRef = useRef<Promise<void> | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  // A paused/replaced clip can reject its earlier play() promise later. Only
  // the current clip is allowed to change player state in an async callback.
  const playbackGenerationRef = useRef(0);
  const sentenceBufferRef = useRef("");
  // Keeps the one sentence that failed to synthesize so the visible recovery
  // control can retry it from a user gesture on iOS.
  const failedTtsTextRef = useRef("");

  // Stage presentation state: project audience feeds the interviewer role
  // line; the history drawer holds exchanges older than the rolling two.
  const [audience, setAudience] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const studioViewportStyle = useStudioViewport();
  // Prompt and saving screens own StudioShell's dialog handling. The live
  // stage enables it here so only one Escape/focus-trap listener exists.
  const requestLeave = useCallback(() => {
    if (holdingThought || summarizing) return;
    const userTurns = userTurnCount(messagesRef.current);
    if (startedRef.current && userTurns >= 1) {
      setShowLeaveGuard(true);
      return;
    }
    onBack();
  }, [holdingThought, summarizing, onBack]);

  const dialogRef = useStudioDialog(requestLeave, started && !showResume && !showTtsPrompt && !summarizing && !holdingThought);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!cancelled && p?.audience) setAudience(p.audience); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  // Auto-scroll never worked: the ref this used to read was declared but never
  // attached to any element, so scrollIntoView ran on nothing every commit.
  // On a phone that meant T.H.E.O's question streamed in below the fold and the
  // user's own live dictation rendered off-screen while they spoke. Scroll the
  // stage container directly (scrollIntoView would walk to the document on
  // mobile and yank the page), and only when already near the bottom, so it
  // cannot fight a user who scrolled up to re-read.
  const scrollToBottom = useCallback(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, input, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Hands-free needs mic capture + a recorder; transcription happens on the
  // server, so browser SpeechRecognition support no longer matters.
  const speechSupported = typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    "MediaRecorder" in window;

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      // Clearing handlers first keeps an intentional reset from reporting a
      // media error and throwing away the remaining response.
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    ttsUnlockGenerationRef.current += 1;
    playbackGenerationRef.current += 1;
    ttsUnlockPendingRef.current = false;
    ttsUnlockReadyRef.current = null;
    if (currentAudioUrlRef.current) URL.revokeObjectURL(currentAudioUrlRef.current);
    currentAudioUrlRef.current = null;
    audioQueueRef.current.forEach(({ url }) => URL.revokeObjectURL(url));
    ttsRequestGenerationRef.current += 1;
    ttsRequestQueueRef.current = [];
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    sentenceBufferRef.current = "";
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  // This is called synchronously from voice-control click handlers. iOS only
  // authorizes media started inside that user gesture; a later fetch/SSE
  // callback is too late. Keep this one imperative element for the complete
  // session — a JSX <audio> mounted after the prompt would be a different,
  // still-locked element.
  const initializeTtsAudio = useCallback(() => {
    try {
      const audio = audioRef.current ?? new Audio();
      audio.setAttribute("playsinline", "");
      audio.preload = "auto";
      audioRef.current = audio;
      const unlockGeneration = ++ttsUnlockGenerationRef.current;
      ttsUnlockPendingRef.current = true;
      audio.src = TTS_UNLOCK_AUDIO;
      ttsUnlockReadyRef.current = audio.play().then(() => {
        // Do not let a delayed unlock completion erase a real TTS clip. This
        // can happen when the user taps retry while an earlier media promise
        // is still settling.
        if (ttsUnlockGenerationRef.current !== unlockGeneration || audio.src !== TTS_UNLOCK_AUDIO) return;
        audio.pause();
      }).catch(() => {
        if (ttsUnlockGenerationRef.current !== unlockGeneration || audio.src !== TTS_UNLOCK_AUDIO) return;
        // A rejected unlock is an autoplay restriction, not a user mute or a
        // TTS service failure. Leave voice enabled and give the user a real
        // gesture to try again.
        setTtsFailed(true);
        setVoiceNotice("iPhone needs one more tap before it can play T.H.E.O.'s voice. Tap Try voice again.");
      }).finally(() => {
        if (ttsUnlockGenerationRef.current === unlockGeneration) {
          ttsUnlockPendingRef.current = false;
        }
      });
      return true;
    } catch {
      ttsEnabledRef.current = false;
      setTtsEnabled(false);
      setTtsFailed(true);
      stopAudio();
      setVoiceNotice("T.H.E.O.'s voice is not available in this browser. Continue in text, then tap Try voice again.");
      return false;
    }
  }, [stopAudio]);

  // TTS helpers — defined before toggleListening to avoid TDZ
  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    // Never overlap the silent gesture unlock with the first real clip. Once
    // it settles, this same shared element continues with every queued line.
    if (ttsUnlockPendingRef.current) {
      void ttsUnlockReadyRef.current?.finally(() => playNext());
      return;
    }
    if (!pageVisibleRef.current) {
      audioQueueRef.current = [];
      speakingRef.current = false;
      setSpeaking(false);
      return;
    }
    // Queue drained: recognition is already alive, so only lift the software
    // result gate. Never hand the mic back by starting a new recognizer.
    if (audioQueueRef.current.length === 0) {
      speakingRef.current = false;
      setSpeaking(false);
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      ttsEnabledRef.current = false;
      setTtsEnabled(false);
      setTtsFailed(true);
      stopAudio();
      setVoiceNotice("T.H.E.O.'s voice could not start. Continue in text, then tap Try voice again.");
      return;
    }

    const nextAudio = audioQueueRef.current.shift()!;
    const { url, text } = nextAudio;
    const previousAudioUrl = currentAudioUrlRef.current;
    const playbackGeneration = ++playbackGenerationRef.current;
    const isCurrentPlayback = () =>
      playbackGenerationRef.current === playbackGeneration &&
      currentAudioUrlRef.current === url;
    const finishPlayback = () => {
      if (!isCurrentPlayback()) return;
      isPlayingRef.current = false;
      audio.onended = null;
      audio.onerror = null;
      // `ended` already means this element is not playing. Do not pause, load,
      // or reset it here: on iPhone that can drop the user-gesture playback
      // authorization before hands-free auto-send receives the next response.
      playNext();
    };
    const playbackFailed = (message: string) => {
      if (!isCurrentPlayback()) return;
      setTtsFailed(true);
      speakingRef.current = false;
      setSpeaking(false);
      failedTtsTextRef.current = text;
      stopAudio();
      setVoiceNotice(`${message} Continue in text, then tap Try voice again.`);
    };
    audio.onended = finishPlayback;
    audio.onerror = () => {
      if (isCurrentPlayback()) playbackFailed("T.H.E.O.'s voice could not play.");
    };
    audio.src = url;
    // The old blob must remain valid while it is this element's source. Once
    // the next clip has replaced it, it is safe to release that URL.
    if (previousAudioUrl && previousAudioUrl !== url) URL.revokeObjectURL(previousAudioUrl);
    currentAudioUrlRef.current = url;
    isPlayingRef.current = true;
    speakingRef.current = true;
    setSpeaking(true);
    void audio.play().then(() => {
      if (!isCurrentPlayback()) return;
      // We cannot read the Silent switch. Only explain it after this response
      // returned 200 and the media element actually started playing.
      if (isAppleMobileDevice()) {
        setVoiceNotice("Voice is playing. If you still cannot hear T.H.E.O., turn off Silent mode and raise your iPhone media volume.");
      }
    }).catch(() => {
      if (isCurrentPlayback()) {
        playbackFailed("iPhone blocked T.H.E.O.'s voice. Tap Try voice again to hear this response.");
      }
    });
  }, [stopAudio]);

  const speakSentence = useCallback((text: string) => {
    if (!pageVisibleRef.current || !ttsEnabledRef.current || !text.trim()) return;
    ttsRequestQueueRef.current.push(text);
    if (ttsRequestInFlightRef.current) return;

    const drain = async () => {
      const next = ttsRequestQueueRef.current.shift();
      if (!next || !pageVisibleRef.current || !ttsEnabledRef.current) {
        ttsRequestInFlightRef.current = false;
        return;
      }
      ttsRequestInFlightRef.current = true;
      const generation = ttsRequestGenerationRef.current;
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: next }),
        });
        if (!res.ok) {
          throw new Error(await ttsErrorMessage(res));
        }
        if (generation !== ttsRequestGenerationRef.current || !pageVisibleRef.current || !ttsEnabledRef.current) return;
        const buf = await res.arrayBuffer();
        if (buf.byteLength === 0) throw new Error("TTS returned no audio");
        if (generation !== ttsRequestGenerationRef.current || !pageVisibleRef.current || !ttsEnabledRef.current) return;
        audioQueueRef.current.push({
          url: URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" })),
          text: next,
        });
        playNext();
      } catch (error) {
        // TTS must be optional, but never invisible. A failed request was
        // swallowed here, which left iPhone users with a slashed speaker and
        // no explanation or recovery action.
        ttsEnabledRef.current = false;
        setTtsEnabled(false);
        stopAudio();
        failedTtsTextRef.current = next;
        setTtsFailed(true);
        const detail = error instanceof Error ? error.message : "T.H.E.O.'s voice could not be generated.";
        if (/HTTP 402|tts_limit_reached|Monthly voice limit/.test(detail)) {
          setShowVoiceWall(true);
        }
        setVoiceNotice(`${detail} Continue in text, or tap Try voice again to replay this response.`);
      }
      finally { void drain(); }
    };
    void drain();
  }, [playNext, stopAudio]);

  const retryVoice = useCallback(() => {
    const text = failedTtsTextRef.current;
    if (!initializeTtsAudio()) return;
    failedTtsTextRef.current = "";
    ttsEnabledRef.current = true;
    setTtsEnabled(true);
    setTtsFailed(false);
    setVoiceNotice(null);
    if (text) speakSentence(text);
  }, [initializeTtsAudio, speakSentence]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  /** End the live-transcription socket for this turn. Purely a display
   *  channel: closing it never touches the mic stream or the recorder. */
  const closeLiveSocket = useCallback(() => {
    liveTurnRef.current += 1; // stale socket callbacks check this and bail
    const socket = liveSocketRef.current;
    liveSocketRef.current = null;
    liveStateRef.current = "off";
    pcmQueueRef.current = [];
    liveFinalRef.current = "";
    liveInterimRef.current = "";
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "CloseStream" }));
      } catch { /* closing regardless */ }
      try { socket.close(); } catch { /* already closed */ }
    }
  }, []);

  /** Release every capture resource. The ONLY legitimate reasons to reach this
   *  are the user toggling Speak off, backgrounding, unmount, or a real mic
   *  failure — never "T.H.E.O. is about to talk". */
  const teardownMic = useCallback(() => {
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    closeLiveSocket();
    const pcmNode = pcmNodeRef.current;
    pcmNodeRef.current = null;
    if (pcmNode) {
      pcmNode.onaudioprocess = null;
      try { pcmNode.disconnect(); } catch { /* context may already be closed */ }
    }
    discardSegmentRef.current?.();
    discardSegmentRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    analyserRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    segmentHasSpeechRef.current = false;
    gateOpenedAtRef.current = 0;
    trackMutedAtRef.current = 0;
    micReacquireTriedRef.current = false;
    listeningRef.current = false;
    transcribingRef.current = false;
    setTranscribing(false);
    setListening(false);
  }, [closeLiveSocket]);

  /** A mic problem must end hands-free VISIBLY. It must never touch the
   *  speaker: TTS state is not this function's to change. */
  const disarmHandsFree = useCallback((message: string | null) => {
    handsFreeRef.current = false;
    setHandsFree(false);
    teardownMic();
    if (message) {
      setRetryAction(null);
      setSendError(message);
      reportHandsFreeIssue(message);
    }
  }, [teardownMic]);

  /** Live captions could not run. Tell the author once per session — with the
   *  actual reason, because that is the only debugging channel a phone test
   *  has — while making clear hands-free itself still works. */
  const noteLiveIssue = useCallback((detail: string) => {
    reportHandsFreeIssue(`live captions unavailable: ${detail}`);
    if (!handsFreeRef.current || liveIssueNoticedRef.current) return;
    liveIssueNoticedRef.current = true;
    setSendError(`Live captions are off — ${detail} Hands-free still works: your words appear right after you pause.`);
  }, []);

  /** Open the live-transcription socket for one spoken turn: fetch a 30-second
   *  token, connect, flush any audio queued while connecting, then paint each
   *  interim result into the composer. Every failure downgrades to the clip
   *  fallback — live words are never allowed to cost a turn. */
  const openLiveSocket = useCallback(async () => {
    if (liveSocketRef.current) return;
    const turn = ++liveTurnRef.current;
    liveStateRef.current = "connecting";
    liveFinalRef.current = "";
    liveInterimRef.current = "";
    pcmQueueRef.current = [];

    let token = "";
    let failDetail = "";
    try {
      const res = await fetch("/api/brainstorm/stt-token", { method: "POST" });
      if (res.ok) {
        const payload = await res.json() as { access_token?: unknown };
        if (typeof payload.access_token === "string" && payload.access_token) token = payload.access_token;
        else failDetail = "the token response was empty.";
      } else {
        try {
          const payload = await res.json() as { error?: unknown };
          if (typeof payload.error === "string") failDetail = payload.error;
        } catch { /* non-JSON gateway page */ }
        failDetail = failDetail || `the token request returned HTTP ${res.status}.`;
      }
    } catch {
      failDetail = "the token request could not reach the server.";
    }
    if (turn !== liveTurnRef.current || !handsFreeRef.current) return;
    if (!token) {
      liveStateRef.current = "failed";
      noteLiveIssue(failDetail);
      return;
    }

    let socket: WebSocket;
    try {
      // Browsers cannot set an Authorization header on a WebSocket; Deepgram
      // accepts the token as a subprotocol pair instead.
      socket = new WebSocket(LIVE_STT_URL, ["bearer", token]);
    } catch (error) {
      liveStateRef.current = "failed";
      noteLiveIssue(`this browser rejected the live connection${error instanceof Error && error.message ? ` (${error.message})` : ""}.`);
      return;
    }
    socket.binaryType = "arraybuffer";
    liveSocketRef.current = socket;

    socket.onopen = () => {
      if (turn !== liveTurnRef.current || liveSocketRef.current !== socket) {
        try { socket.close(); } catch { /* stale */ }
        return;
      }
      liveStateRef.current = "open";
      // First words are never lost: everything captured during the handshake
      // was queued and goes out ahead of the live feed.
      for (const chunk of pcmQueueRef.current) socket.send(chunk.buffer as ArrayBuffer);
      pcmQueueRef.current = [];
    };
    socket.onmessage = (event) => {
      if (turn !== liveTurnRef.current) return;
      try {
        const data = JSON.parse(String(event.data)) as {
          type?: string;
          is_final?: boolean;
          channel?: { alternatives?: Array<{ transcript?: string }> };
        };
        if (data.type !== "Results") return;
        const text = (data.channel?.alternatives?.[0]?.transcript ?? "").trim();
        if (data.is_final) {
          if (text) liveFinalRef.current += (liveFinalRef.current ? " " : "") + text;
          liveInterimRef.current = "";
        } else {
          liveInterimRef.current = text;
        }
        // Never clobber a typed answer with dictation.
        if (typedRef.current) return;
        const composed = [liveFinalRef.current, liveInterimRef.current].filter(Boolean).join(" ");
        if (composed) setInput(composed);
      } catch { /* non-JSON frame */ }
    };
    const downgrade = (detail: string) => {
      // A socket lost mid-turn may hold only half the words. The recorder clip
      // has ALL of them, so the send path falls back rather than sending less
      // than the author said.
      if (turn !== liveTurnRef.current) return;
      if (liveSocketRef.current === socket) liveSocketRef.current = null;
      if (liveStateRef.current !== "off") {
        liveStateRef.current = "failed";
        noteLiveIssue(detail);
      }
    };
    socket.onerror = () => downgrade("the live connection errored.");
    // Code 1006 with a token that WAS issued means Deepgram refused the
    // handshake itself — the single most diagnostic number a phone test can
    // report back.
    socket.onclose = (event: CloseEvent) => downgrade(
      `the live connection closed (code ${event.code}${event.reason ? `: ${event.reason}` : ""}).`,
    );
  }, [noteLiveIssue]);

  /** One finished clip → Deepgram → composer → auto-send. STT failures keep
   *  the session armed (the next answer can still work); only a dead sign-in
   *  disarms, because it will fail identically forever. */
  const transcribeSegment = useCallback(async (blob: Blob) => {
    try {
      if (!handsFreeRef.current || !pageVisibleRef.current) return;
      // Below ~2 KB there is no speech in any allowed container — a stray
      // click or a zero-length iOS flush. Skip the round trip.
      if (blob.size < 2000) return;
      const res = await fetch("/api/brainstorm/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/mp4" },
        body: blob,
      });
      if (!res.ok) throw new Error(await sttErrorMessage(res));
      const payload = await res.json() as { transcript?: unknown };
      const transcript = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
      if (!handsFreeRef.current || !pageVisibleRef.current) return;
      // Never clobber what the user typed. Typing is the natural recovery when
      // dictation misfires; their answer wins over the returning transcript.
      if (typedRef.current) return;
      if (!transcript) {
        setSendError("The microphone heard sound but no words came through. Try again, a little closer to the phone — or type your answer.");
        return;
      }
      setInput(transcript);
      autoSendRef.current?.(transcript);
    } catch (error) {
      if (!handsFreeRef.current) return;
      const detail = error instanceof Error && error.message ? error.message : "Your answer could not be turned into text.";
      if (/HTTP 401/.test(detail)) {
        disarmHandsFree(detail);
      } else {
        setSendError(`${detail} Hands-free is still on — speak again, or type your answer.`);
        reportHandsFreeIssue(detail);
      }
    } finally {
      transcribingRef.current = false;
      setTranscribing(false);
    }
  }, [disarmHandsFree]);

  /** Stop the live segment. "send" hands the clip to transcription; "discard"
   *  throws it away (gate closed, silence reset, teardown). */
  const endSegment = useCallback((mode: "send" | "discard") => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (mode === "discard") discardSegmentRef.current?.();
    discardSegmentRef.current = null;
    recorderRef.current = null;
    segmentHasSpeechRef.current = false;
    // If stop() cannot run its onstop (recorder already dead), a "send" must
    // still release the transcribing gate or capture is silently over.
    let stopped = false;
    try {
      if (recorder.state !== "inactive") {
        recorder.stop();
        stopped = true;
      }
    } catch { /* already stopped */ }
    if (!stopped && mode === "send") {
      transcribingRef.current = false;
      setTranscribing(false);
    }
  }, []);

  /** Open a recording segment on the existing session stream. */
  const beginSegment = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || recorderRef.current) return;
    const mimeType = RECORDER_MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c));
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      disarmHandsFree("This browser could not start the hands-free recorder. You can keep typing your answers.");
      return;
    }
    const chunks: Blob[] = [];
    let discarded = false;
    discardSegmentRef.current = () => { discarded = true; };
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      discarded = true;
      if (recorderRef.current === recorder) recorderRef.current = null;
      if (handsFreeRef.current) {
        disarmHandsFree("The hands-free recorder stopped unexpectedly. Tap Speak to turn it back on, or type your answer.");
      }
    };
    recorder.onstop = () => {
      if (recorderRef.current === recorder) recorderRef.current = null;
      if (discarded) return;
      // Always route a kept segment through transcribeSegment — even an empty
      // one — because its finally block is what re-opens the capture gate.
      void transcribeSegment(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/mp4" }));
    };
    try {
      recorder.start();
    } catch {
      disarmHandsFree("The hands-free recorder could not start. Tap Speak to try again, or type your answer.");
      return;
    }
    recorderRef.current = recorder;
    segmentStartedAtRef.current = Date.now();
    segmentHasSpeechRef.current = false;
    lastVoiceAtRef.current = 0;
    // Live words for this turn. Failure here never costs the turn — the
    // recorder clip above is the source of truth.
    void openLiveSocket();
  }, [disarmHandsFree, openLiveSocket, transcribeSegment]);

  /** Wire a stream into the session: track-loss reporting + the level analyser. */
  const attachStream = useCallback((stream: MediaStream) => {
    mediaStreamRef.current = stream;
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onended = () => {
        if (handsFreeRef.current && mediaStreamRef.current === stream) {
          disarmHandsFree("The iPhone closed the microphone (a call or another app can take it). Tap Speak to turn hands-free back on.");
        }
      };
    }
    const ctx = audioContextRef.current;
    if (ctx) {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      vadDataRef.current = new Uint8Array(analyser.fftSize);

      // Live-words tap: raw PCM off the SAME source, streamed to Deepgram
      // while a segment records. A processor only runs when wired to the
      // output, so it goes through a zero gain — unity would echo the mic.
      const previousPcmNode = pcmNodeRef.current;
      if (previousPcmNode) {
        previousPcmNode.onaudioprocess = null;
        try { previousPcmNode.disconnect(); } catch { /* re-acquire path */ }
      }
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!handsFreeRef.current || !recorderRef.current) return;
        const state = liveStateRef.current;
        if (state !== "connecting" && state !== "open") return;
        const chunk = downsampleTo16k(event.inputBuffer.getChannelData(0), ctx.sampleRate);
        const socket = liveSocketRef.current;
        if (state === "open" && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(chunk.buffer as ArrayBuffer);
        } else {
          const queue = pcmQueueRef.current;
          queue.push(chunk);
          if (queue.length > PCM_QUEUE_MAX_CHUNKS) queue.shift();
        }
      };
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);
      pcmNodeRef.current = processor;
    }
  }, [disarmHandsFree]);

  /** Last-resort self-heal for the observed live failure: iOS returns the mic
   *  muted after playback. Re-request the stream once per incident; if iOS
   *  still refuses, fail loudly instead of listening to silence. */
  const reacquireMicrophone = useCallback(async () => {
    reportHandsFreeIssue("hands-free mic stayed muted after playback; re-requesting getUserMedia");
    endSegment("discard");
    const old = mediaStreamRef.current;
    mediaStreamRef.current = null;
    analyserRef.current = null;
    old?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!handsFreeRef.current || !pageVisibleRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      attachStream(stream);
      trackMutedAtRef.current = 0;
    } catch {
      disarmHandsFree("The iPhone did not give the microphone back after T.H.E.O. spoke. Tap Speak to turn hands-free on again, or type your answer.");
    }
  }, [attachStream, disarmHandsFree, endSegment]);

  /** The session heartbeat. Every 50ms: is the floor ours, is the mic actually
   *  alive, is the author speaking, and has the 3-second quiet window elapsed.
   *  All decisions read refs, so one interval survives every render. */
  const vadTick = useCallback(() => {
    if (!handsFreeRef.current) return;
    const stream = mediaStreamRef.current;
    const analyser = analyserRef.current;
    if (!stream || !analyser) return;
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState === "ended") {
      disarmHandsFree("The iPhone closed the microphone (a call or another app can take it). Tap Speak to turn hands-free back on.");
      return;
    }

    const now = Date.now();
    // The floor is T.H.E.O.'s while his answer streams, while any sentence is
    // being synthesized or queued, and while a finished clip is at Deepgram.
    // The STREAM stays open through all of it — only recording is gated.
    const gateOpen = pageVisibleRef.current &&
      !isPlayingRef.current && !speakingRef.current && !streamingRef.current &&
      !transcribingRef.current &&
      !ttsRequestInFlightRef.current &&
      ttsRequestQueueRef.current.length === 0 &&
      audioQueueRef.current.length === 0;

    if (!gateOpen) {
      gateOpenedAtRef.current = 0;
      trackMutedAtRef.current = 0;
      micReacquireTriedRef.current = false;
      if (recorderRef.current) endSegment("discard");
      if (liveStateRef.current !== "off") closeLiveSocket();
      if (listeningRef.current) {
        listeningRef.current = false;
        setListening(false);
      }
      if (micLevelFillRef.current) micLevelFillRef.current.style.width = "0%";
      return;
    }

    if (!gateOpenedAtRef.current) gateOpenedAtRef.current = now;
    if (now - gateOpenedAtRef.current < GATE_REARM_DELAY_MS) return;

    // The observed live failure shape: capture "runs" but hears silence. A
    // muted track is that failure made explicit — self-heal once, then say so.
    if (track.muted) {
      if (!trackMutedAtRef.current) {
        trackMutedAtRef.current = now;
      } else if (now - trackMutedAtRef.current > MUTED_MIC_GRACE_MS) {
        trackMutedAtRef.current = 0;
        if (!micReacquireTriedRef.current) {
          micReacquireTriedRef.current = true;
          void reacquireMicrophone();
        } else {
          disarmHandsFree("The iPhone gave the microphone back muted after T.H.E.O. spoke. Tap Speak to turn hands-free on again, or type your answer.");
        }
      }
      return;
    }
    trackMutedAtRef.current = 0;

    if (!recorderRef.current) {
      beginSegment();
      if (!recorderRef.current) return; // beginSegment already disarmed loudly
    }
    if (!listeningRef.current) {
      listeningRef.current = true;
      setListening(true);
    }

    const data = vadDataRef.current ?? new Uint8Array(analyser.fftSize);
    vadDataRef.current = data;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    if (micLevelFillRef.current) {
      micLevelFillRef.current.style.width = `${Math.min(100, Math.round((rms / 0.1) * 100))}%`;
    }

    if (rms >= VOICE_RMS_THRESHOLD) {
      lastVoiceAtRef.current = now;
      segmentHasSpeechRef.current = true;
    }

    if (segmentHasSpeechRef.current) {
      if (now - lastVoiceAtRef.current >= QUIET_SEND_MS || now - segmentStartedAtRef.current >= MAX_SEGMENT_MS) {
        listeningRef.current = false;
        setListening(false);
        if (liveStateRef.current === "open") {
          // Live path: the words are already on screen. After 3s of quiet
          // Deepgram has long since finalized them — send without a round trip.
          const transcript = [liveFinalRef.current, liveInterimRef.current]
            .filter(Boolean).join(" ").trim();
          endSegment("discard"); // the clip is redundant; the live text is the answer
          closeLiveSocket();
          if (typedRef.current) {
            // Typed answer wins; the user sends it themselves.
          } else if (!transcript) {
            setSendError("The microphone heard sound but no words came through. Try again, a little closer to the phone — or type your answer.");
          } else {
            setInput(transcript);
            autoSendRef.current?.(transcript);
          }
        } else {
          // Clip fallback (socket failed or never opened): exactly the proven
          // path. Close the gate BEFORE the async onstop→fetch chain so no new
          // segment opens mid-round-trip; transcribeSegment always clears this.
          transcribingRef.current = true;
          setTranscribing(true);
          closeLiveSocket();
          endSegment("send");
        }
      }
    } else if (now - segmentStartedAtRef.current >= IDLE_SEGMENT_RESET_MS) {
      endSegment("discard");
      closeLiveSocket();
    }
  }, [beginSegment, closeLiveSocket, disarmHandsFree, endSegment, reacquireMicrophone]);

  /** Open the hands-free session from the Speak tap. The tap is the only iOS
   *  gesture this feature will ever get, so BOTH the AudioContext and the
   *  getUserMedia request happen inside it. */
  const startHandsFree = useCallback(async () => {
    if (!pageVisibleRef.current) return;
    if (micStartingRef.current || mediaStreamRef.current) return;
    const AudioContextCtor = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || !AudioContextCtor) {
      setSendError("Hands-free voice capture is not available in this browser. You can keep typing your answers.");
      return;
    }
    micStartingRef.current = true;
    handsFreeRef.current = true;
    setHandsFree(true);
    setSendError(null);
    setRetryAction(null);
    try {
      if (!audioContextRef.current) {
        const ctx = new AudioContextCtor();
        audioContextRef.current = ctx;
        void ctx.resume().catch(() => { /* analyser still attaches; tick reports if dead */ });
      }
      // Echo cancellation matters twice here: it keeps T.H.E.O.'s own voice
      // out of the recordings, and it tells iOS this is a conversation-style
      // session where playback and capture are expected to coexist.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!handsFreeRef.current || !pageVisibleRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        teardownMic();
        return;
      }
      attachStream(stream);
      if (!vadTimerRef.current) vadTimerRef.current = setInterval(vadTick, VAD_TICK_MS);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      // Denial must not be silent: Safari remembers it, so the next tap would
      // produce no prompt and the feature would just look dead.
      disarmHandsFree(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is blocked. On iPhone: tap aA in the address bar, then Website Settings, then Microphone. You can keep typing in the meantime."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone available. You can keep typing your answers."
            : `Hands-free could not open the microphone${error instanceof Error && error.message ? ` (${error.message})` : ""}. Tap Speak to try again, or type your answer.`,
      );
    } finally {
      micStartingRef.current = false;
    }
  }, [attachStream, disarmHandsFree, teardownMic, vadTick]);

  const toggleListening = useCallback(() => {
    if (listening || handsFree) {
      handsFreeRef.current = false;
      setHandsFree(false);
      teardownMic();
      return;
    }
    void startHandsFree();
  }, [listening, handsFree, startHandsFree, teardownMic]);

  // A phone call or app switch must not leave either microphone capture or
  // playback alive in the background. Do not auto-reopen the mic on return:
  // mobile browsers can treat it as a non-gesture request, and surprise capture
  // after an interruption is worse than one explicit tap.
  useEffect(() => {
    const onVisibilityChange = () => {
      pageVisibleRef.current = document.visibilityState === "visible";
      if (pageVisibleRef.current) return;
      const wasActive = handsFree || listening || speaking;
      handsFreeRef.current = false;
      setHandsFree(false);
      teardownMic();
      stopAudio();
      if (wasActive) {
        setRetryAction(null);
        setSendError("Voice playback and hands-free dictation were paused while the app was in the background. Tap Speak when you return.");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [handsFree, listening, speaking, stopAudio, teardownMic]);

  // Clean up capture on unmount
  useEffect(() => {
    return () => {
      handsFreeRef.current = false;
      teardownMic();
    };
  }, [teardownMic]);

  // Start the conversation — AI sends first message
  const startConversation = useCallback(async () => {
    setStarted(true);
    streamingRef.current = true;
    setStreaming(true);
    setSendError(null);
    setRetryAction(null);

    const initMessages: Message[] = [{ role: "user", content: "Start the brainstorm session." }];
    let aiText = "";
    let streamFailed = false;

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: initMessages, project_id: projectId }),
      });

      if (!res.ok) {
        throw new Error(await brainstormErrorMessage(res));
      }
      if (!res.body) throw new Error("T.H.E.O. returned no stream.");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      setMessages([{ role: "assistant", content: "" }]);
      sentenceBufferRef.current = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            // The route deliberately emits {error} on a mid-stream failure and
            // then closes cleanly. Ignoring it meant a truncated half-question
            // was treated as complete: saved, spoken, replayed on resume, and
            // shipped into summarize as source material.
            if (parsed.error) {
              streamFailed = true;
              sentenceBufferRef.current = "";
              setMessages([]);
              setSendError("That answer was cut off. Try again.");
              setRetryAction("start");
              break;
            }
            if (parsed.text) {
              aiText += parsed.text;
              setMessages([{ role: "assistant", content: aiText }]);
              // Sentence detection for TTS
              sentenceBufferRef.current += parsed.text;
              const match = /^(.*?[.!?])(?:\s+)([\s\S]*)$/.exec(sentenceBufferRef.current);
              if (match) {
                speakSentence(match[1].trim());
                sentenceBufferRef.current = match[2];
              }
            }
          } catch {
            // skip
          }
        }
        if (streamFailed) {
          reader.cancel().catch(() => {});
          break;
        }
      }
      // Never speak an opening question just discarded after a stream failure.
      if (!streamFailed && sentenceBufferRef.current.trim()) {
        speakSentence(sentenceBufferRef.current.trim());
        sentenceBufferRef.current = "";
      }
    } catch (err) {
      console.error("Brainstorm start error:", err);
      const msg = brainstormFailureMessage(err);
      setMessages([]);
      setSendError(msg || "Couldn't connect to the brainstorm session. Please try again.");
      setRetryAction(/HTTP 401/.test(msg) ? null : "start");
      if (/HTTP 402|out of Ink/.test(msg)) setShowInkWall(true);
    }

    streamingRef.current = false;
    setStreaming(false);
    if (serverSyncTimerRef.current) clearTimeout(serverSyncTimerRef.current);
    serverSyncTimerRef.current = setTimeout(() => {
      serverSyncTimerRef.current = null;
      if (!streamingRef.current) void putServerSession(projectId, messagesRef.current);
    }, 400);
    inputRef.current?.focus();
  }, [projectId, speakSentence]);

  // `textOverride` is the hands-free path: a Deepgram transcript lands in the
  // composer and sends in the same breath, without waiting a render for the
  // `input` state (and this closure) to catch up.
  const sendMessage = useCallback(async (textOverride?: string) => {
    const text = (typeof textOverride === "string" ? textOverride : input).trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    typedRef.current = false; // turn sent: dictation may own the composer again
    streamingRef.current = true;
    setStreaming(true);
    setSendError(null);
    setRetryAction(null);

    // Build API messages: pin init + first exchange, window the rest to last 8 (4 exchanges)
    const WINDOW_SIZE = 8;
    const initMsg: Message = { role: "user", content: "Start the brainstorm session." };
    const firstExchange = updatedMessages.slice(0, 2); // user topic + AI first question
    const remainder = updatedMessages.slice(2);
    const windowed = remainder.length > WINDOW_SIZE ? remainder.slice(-WINDOW_SIZE) : remainder;
    const apiMessages: Message[] = [initMsg, ...firstExchange, ...windowed];

    let aiText = "";
    let streamFailed = false;

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, project_id: projectId }),
      });

      if (!res.ok) {
        throw new Error(await brainstormErrorMessage(res));
      }
      if (!res.body) throw new Error("T.H.E.O. returned no stream.");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      setMessages([...updatedMessages, { role: "assistant", content: "" }]);
      sentenceBufferRef.current = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            // The route emits {error} on a mid-stream failure then closes
            // cleanly. Surfacing a banner is not enough: the partial answer has
            // to be REMOVED, or it is still spoken, autosaved, replayed on
            // resume and shipped into summarize as source material. Restoring
            // the user's text is also what makes Retry work at all — the
            // composer was cleared before the fetch.
            if (parsed.error) {
              streamFailed = true;
              sentenceBufferRef.current = "";
              setMessages(messages);
              setInput(text);
              setSendError("That answer was cut off. Your message is back in the box — try again.");
              setRetryAction("send");
              break;
            }
            if (parsed.text) {
              aiText += parsed.text;
              setMessages([...updatedMessages, { role: "assistant", content: aiText }]);
              // Sentence detection for TTS
              sentenceBufferRef.current += parsed.text;
              const match = /^(.*?[.!?])(?:\s+)([\s\S]*)$/.exec(sentenceBufferRef.current);
              if (match) {
                speakSentence(match[1].trim());
                sentenceBufferRef.current = match[2];
              }
            }
          } catch {
            // skip
          }
        }
      }
      // Flush any remaining text after stream ends — but never speak the tail
      // of an answer we just discarded.
      if (!streamFailed && sentenceBufferRef.current.trim()) {
        speakSentence(sentenceBufferRef.current.trim());
        sentenceBufferRef.current = "";
      }
    } catch (err) {
      console.error("Brainstorm error:", err);
      // A silent failure ate the user's words: the composer was cleared before
      // the fetch and the turn was already pushed, so T.H.E.O appeared to repeat
      // himself and the stage eventually painted a blank headline. Roll the turn
      // back, hand their text back, say so, and disarm hands-free — otherwise
      // the mic re-arms and the silence timer resends into the same dead route
      // forever, appending unanswered turns to the summarize payload.
      setMessages(messages);
      setInput(text);
      const msg = brainstormFailureMessage(err);
      setSendError(`${msg} Your answer is back in the box — try again.`);
      setRetryAction(/HTTP 401/.test(msg) ? null : "send");
      if (/HTTP 402|out of Ink/.test(msg)) setShowInkWall(true);
      handsFreeRef.current = false;
      setHandsFree(false);
      teardownMic();
    }

    streamingRef.current = false;
    setStreaming(false);
    if (serverSyncTimerRef.current) clearTimeout(serverSyncTimerRef.current);
    serverSyncTimerRef.current = setTimeout(() => {
      serverSyncTimerRef.current = null;
      if (!streamingRef.current) void putServerSession(projectId, messagesRef.current);
    }, 400);
    inputRef.current?.focus();
  }, [input, streaming, messages, speakSentence, teardownMic, projectId]);

  // Keep autoSendRef in sync so the silence timer can call sendMessage without stale closures
  useEffect(() => {
    autoSendRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    draftRef.current = input;
  }, [input]);

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  // Hydrate from localStorage and the server in parallel. One resume prompt,
  // fed by whichever copy has more messages (tiebreak: server).
  useEffect(() => {
    let cancelled = false;

    let local: SavedBrainstormSession | null = null;
    try {
      const raw = localStorage.getItem(sessionKey);
      if (raw) local = parseSavedSession(raw);
    } catch {}

    const applyWinner = (saved: SavedBrainstormSession | null) => {
      if (cancelled) return;
      if (saved && (saved.messages.length >= 2 || !!saved.draft.trim())) {
        setSavedMessages(saved.messages);
        setSavedDraft(saved.draft);
        if (skipResumePrompt) {
          setPendingResume(true);
          setShowTtsPrompt(true);
        } else {
          setShowResume(true);
        }
      } else if (autoStart) {
        setShowTtsPrompt(true);
      }
      setHydrating(false);
    };

    fetch(`/api/brainstorm/session?project_id=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        const serverMessages = Array.isArray(payload?.session?.messages)
          ? (payload.session.messages as unknown[]).filter(isMessage)
          : [];
        const server = payload?.session
          ? { messages: serverMessages, draft: "" }
          : null;
        const winner = pickBrainstormResume(server, local);
        applyWinner(winner ? { messages: winner.messages, draft: winner.draft ?? "" } : null);
      })
      .catch(() => {
        applyWinner(local);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave messages AND an in-progress answer. A phone can evict a tab while
  // someone is composing a long memoir answer; messages alone cannot restore
  // words that have not been sent yet.
  useEffect(() => {
    messagesRef.current = messages;
    if (!started || messages.length === 0) return;
    // Debounced + guarded, with a maxWait and a flush on teardown. A plain
    // debounce was worse than it looked on a phone: stream tokens arrive far
    // faster than 400ms, so the timer reset forever and NO write landed for the
    // whole answer, and the cleanup cancelled instead of flushing. If iOS then
    // evicted the tab, the turn was gone. (Guarded because a blocked-storage
    // throw out of an effect took the whole page to the error screen.)
    const write = () => {
      try {
        localStorage.setItem(sessionKey, JSON.stringify({
          version: 1,
          messages: messagesRef.current,
          draft: draftRef.current,
        }));
      } catch {
        setStorageBlocked(true);
      }
    };
    const t = setTimeout(write, 400);
    if (!maxWaitRef.current) maxWaitRef.current = setTimeout(() => { maxWaitRef.current = null; write(); }, 2000);
    const onHide = () => { if (document.visibilityState === "hidden") write(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", write);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", write);
    };
  }, [messages, input, started, sessionKey]);

  // The max-wait timer intentionally outlives individual message/input renders,
  // but not the studio itself. Otherwise Finish removes the completed session
  // and a stale timer recreates it, offering a duplicate session on return.
  useEffect(() => () => {
    if (maxWaitRef.current) clearTimeout(maxWaitRef.current);
    // pagehide is not guaranteed for an SPA route change. Flush the latest refs
    // once at unmount rather than from the per-keystroke effect cleanup, which
    // would defeat debouncing for a long memoir answer.
    if (persistSessionOnUnmountRef.current && startedRef.current && messagesRef.current.length > 0) {
      try {
        localStorage.setItem(sessionKey, JSON.stringify({
          version: 1,
          messages: messagesRef.current,
          draft: draftRef.current,
        }));
      } catch {
        // The mounted error surface is gone; there is nothing useful to render.
      }
      if (!streamingRef.current) {
        void putServerSession(projectId, messagesRef.current);
      }
    }
    if (serverSyncTimerRef.current) {
      clearTimeout(serverSyncTimerRef.current);
      serverSyncTimerRef.current = null;
    }
  }, [sessionKey, projectId]);

  // Fetch TTS availability when modal opens
  useEffect(() => {
    if (!showTtsPrompt) return;
    setTtsAvail("loading");
    fetch("/api/ink/usage")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        // Fail CLOSED. Defaulting to "available" offered voice to users the
        // server then 403s on every sentence — swallowed silently, so they got
        // total silence with the speaker icon lit and no explanation.
        if (!d) { setTtsAvail("locked"); return; }
        const extraVoice = Number(d.topup_tts_chars ?? 0);
        if (d.tts_limit === 0 && extraVoice <= 0) setTtsAvail("locked");
        else if (d.tts_limit > 0 && d.tts_chars_used >= d.tts_limit && extraVoice <= 0) setTtsAvail("exhausted");
        else setTtsAvail("available");
      })
      .catch(() => setTtsAvail("locked"));
  }, [showTtsPrompt]);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/ink/usage").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/ink?history=false").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([usage, ink]) => {
      if (cancelled) return;
      const ttsLimit = Number(usage?.tts_limit ?? 0);
      const ttsUsed = Number(usage?.tts_chars_used ?? 0);
      const ttsPeriod = String(usage?.tts_period_start ?? "");
      if (ttsLimit > 0 && ttsUsed / ttsLimit >= 0.85) {
        const key = `usage_nudge_tts_${ttsPeriod}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(key)) {
          setUsageNudge("tts");
          setUsageNudgeKey(key);
          return;
        }
      }
      const inkLimit = INK_LIMITS[ink?.tier ?? "free"] ?? 10;
      const inkLeft = Number(ink?.balance ?? 0);
      if (inkLimit > 0 && (inkLimit - inkLeft) / inkLimit >= 0.85) {
        const key = `usage_nudge_ink_${ttsPeriod || new Date().toISOString().slice(0, 7)}`;
        if (typeof window !== "undefined" && !window.localStorage.getItem(key)) {
          setUsageNudge("ink");
          setUsageNudgeKey(key);
        }
      }
    });
    return () => { cancelled = true; };
  }, [started]);

  const finishBrainstorm = useCallback(async () => {
    // Need at least 2 user messages to have meaningful content
    const userMessages = messages.filter(m => m.role === "user");
    if (userMessages.length < 2) return;

    setSummarizing(true);
    setSendError(null);
    setRetryAction(null);

    try {
      const res = await fetch("/api/brainstorm/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, project_id: projectId }),
      });

      if (res.ok) {
        if (maxWaitRef.current) {
          clearTimeout(maxWaitRef.current);
          maxWaitRef.current = null;
        }
        // Storage can be blocked even though the server successfully created
        // the transcript. Never trap the user here or let a second Finish make
        // duplicate source material.
        persistSessionOnUnmountRef.current = false;
        try { localStorage.removeItem(sessionKey); } catch { /* storage blocked */ }
        closeServerSession(projectId, "finished");
        onComplete();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Summarize error:", err);
        setSummarizing(false);
        setSendError(err.message || "Couldn't add this session to your sources. Your answers are still here — try again.");
        setRetryAction("finish");
      }
    } catch (err) {
      console.error("Summarize error:", err);
      setSummarizing(false);
      setSendError("Couldn't add this session to your sources. Your answers are still here — try again.");
      setRetryAction("finish");
    }
  }, [messages, projectId, onComplete]);

  const undoLast = useCallback(() => {
    if (streaming || messages.length < 2) return;
    // Remove last AI response + last user message
    const lastAiIdx = messages.length - 1;
    const lastUserIdx = messages.length - 2;
    if (messages[lastAiIdx]?.role === "assistant" && messages[lastUserIdx]?.role === "user") {
      // Undo drops T.H.E.O's reply AND the answer the user just spoke, and the
      // autosave makes that permanent on the next tick. Put their words back in
      // the composer so a mislabelled button cannot silently delete dictation.
      const spoken = messages[lastUserIdx]?.content ?? "";
      setMessages(messages.slice(0, -2));
      if (spoken) setInput((cur) => (cur.trim() ? cur : spoken));
    }
  }, [messages, streaming]);

  // Allow parent (footer Transcript button) to trigger finish externally
  useEffect(() => {
    if (triggerFinish && canFinish) {
      finishBrainstorm();
      onFinishTriggered?.();
    } else if (triggerFinish) {
      onFinishTriggered?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerFinish]);

  const userMessageCount = messages.filter(m => m.role === "user").length;
  const canUndo = userMessageCount > 0 && !streaming && !summarizing && messages.length >= 2;
  const canFinish = userMessageCount >= 2 && !streaming && !summarizing;
  const canTakeABreak = userMessageCount >= 1 && !streaming && !summarizing && !holdingThought;

  const takeABreak = useCallback(async () => {
    if (serverSyncTimerRef.current) {
      clearTimeout(serverSyncTimerRef.current);
      serverSyncTimerRef.current = null;
    }
    setShowLeaveGuard(false);
    setHoldingThought(true);
    await putServerSession(projectId, messagesRef.current);
    window.setTimeout(() => { onBack(); }, 900);
  }, [projectId, onBack]);

  const discardConversation = useCallback((after: () => void) => {
    persistSessionOnUnmountRef.current = false;
    if (maxWaitRef.current) {
      clearTimeout(maxWaitRef.current);
      maxWaitRef.current = null;
    }
    try { localStorage.removeItem(sessionKey); } catch { /* storage blocked */ }
    closeServerSession(projectId, "discarded");
    after();
  }, [projectId, sessionKey]);

  if (hydrating) {
    return (
      <StudioShell onExit={onBack} label="Brainstorm studio">
        <div className="brainstorm-spinner" />
        <style>{`
          .brainstorm-spinner {
            width: 32px;
            height: 32px;
            border: 2.5px solid rgba(0,0,0,0.08);
            border-top-color: var(--ds-accent-500);
            border-radius: 50%;
            animation: bspin 0.8s linear infinite;
          }
          @keyframes bspin { to { transform: rotate(360deg); } }
        `}</style>
      </StudioShell>
    );
  }

  if (holdingThought) {
    return (
      <StudioShell onExit={onBack} label="Holding your conversation">
        <p style={{
          fontFamily: "var(--font-lora), serif",
          fontStyle: "italic",
          fontSize: "1.35rem",
          color: "var(--ds-ink)",
          textAlign: "center",
        }}>
          I&apos;ll hold that thought.
        </p>
      </StudioShell>
    );
  }

  // Resume prompt
  if (showResume) {
    // Show HER last words, not T.H.E.O's. After a normal turn the final message
    // is his question, so the one screen meant to prove her story survived was
    // quoting the machine back at her.
    const lastMsg = [...savedMessages].reverse().find(m => m.role === "user") ?? savedMessages[savedMessages.length - 1];
    const previewSource = savedDraft.trim() || lastMsg?.content || "";
    const preview = previewSource.slice(0, 110) + (previewSource.length > 110 ? "…" : "");
    return (
      <StudioShell onExit={onBack} label="Resume brainstorm studio">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, maxWidth: 620 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, var(--ds-accent-400), var(--ds-accent-500))", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: "1.4rem", fontWeight: 400, color: "var(--ds-ink)", marginBottom: 8 }}>
            Continue where you left off?
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif", maxWidth: 300, lineHeight: 1.5, marginBottom: 4 }}>
            {savedDraft.trim() ? "Unsent answer:" : "Last message:"}
          </p>
          <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--text-tertiary)", fontFamily: "var(--font-lora), serif", maxWidth: 320, lineHeight: 1.6 }}>
            &ldquo;{preview}&rdquo;
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 280 }}>
          <button
            className="transcribe-btn"
            onClick={() => { setPendingResume(true); setShowTtsPrompt(true); setShowResume(false); }}
          >
            Continue Session →
          </button>
          <button
            className="transcribe-btn"
            style={{ background: "rgba(249,247,242,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(249,247,242,0.22)" }}
            onClick={() => {
              if (!window.confirm("Start a new conversation? I'll let go of this one.")) return;
              discardConversation(() => {
                setSavedMessages([]);
                setSavedDraft("");
                setInput("");
                setShowResume(false);
                // Hand straight to the voice choice. Without this the render falls
                // through to the un-portaled pre-start screen — a second identical
                // CTA squeezed in beside the lobby, which is exactly what
                // `autoStart` exists to prevent.
                setShowTtsPrompt(true);
              });
            }}
          >
            Start New Session
          </button>
        </div>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif" }}>
          ← Back to upload options
        </button>
        </div>
      </StudioShell>
    );
  }

  // TTS choice modal
  if (showTtsPrompt) {
    function chooseTts(on: boolean) {
      const voiceReady = !on || initializeTtsAudio();
      setTtsEnabled(on && voiceReady);
      ttsEnabledRef.current = on && voiceReady;
      setVoiceNotice(null);
      setShowTtsPrompt(false);
      if (pendingResume) {
        setMessages(savedMessages);
        setInput(savedDraft);
        typedRef.current = !!savedDraft.trim();
        setStarted(true);
      } else {
        startConversation();
      }
    }

    const isLocked = ttsAvail === "locked";
    const isExhausted = ttsAvail === "exhausted";
    const ttsBlocked = isLocked || isExhausted;

    return (
      <StudioShell onExit={onBack} label="Brainstorm voice settings">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, maxWidth: 620 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: ttsBlocked ? "rgba(0,0,0,0.06)" : "linear-gradient(135deg, var(--ds-accent-400), var(--ds-accent-500))",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke={ttsBlocked ? "var(--text-tertiary)" : "#fff"} strokeWidth="1.8" strokeLinecap="round">
            <rect x="5" y="1" width="6" height="9" rx="3" />
            <path d="M3 7v1a5 5 0 0010 0V7" /><path d="M8 13v2" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontSize: "1.4rem", fontWeight: 400, color: "var(--ds-ink)", marginBottom: 10 }}>
            Read responses aloud?
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif", maxWidth: 280, lineHeight: 1.5 }}>
            {isLocked
              ? "Voice read-back is available on paid plans."
              : isExhausted
              ? "You've used this month's voice. I can still take notes if you type — or add more below."
              : "AI responses can be spoken back to you using your voice allowance. You can toggle this any time."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 260 }}>
          {ttsBlocked ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{
              padding: "10px 16px", borderRadius: 8, textAlign: "center",
              background: "rgba(249,247,242,0.06)", border: "1px solid rgba(249,247,242,0.18)",
              fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-manrope), sans-serif",
            }}>
              {isLocked ? "Voice unavailable on your plan" : "Monthly limit reached"}
            </div>
            {isExhausted && (
              <button
                type="button"
                className="transcribe-btn"
                onClick={() => setShowVoiceWall(true)}
              >
                Add more voice
              </button>
            )}
            </div>
          ) : (
            <button
              className="transcribe-btn"
              disabled={ttsAvail === "loading"}
              onClick={() => chooseTts(true)}
            >
              {ttsAvail === "loading" ? "Checking…" : "Yes, read responses aloud"}
            </button>
          )}
          <button
            className="transcribe-btn"
            style={{ background: "rgba(249,247,242,0.08)", color: "var(--text-secondary)", border: "1px solid rgba(249,247,242,0.22)" }}
            onClick={() => chooseTts(false)}
          >
            {ttsBlocked ? "Continue — text only" : "No thanks, text only"}
          </button>
        </div>
        {isLocked && (
          <a href="/pricing" style={{ fontSize: 12, color: "var(--ds-accent)", fontFamily: "var(--font-manrope), sans-serif", textDecoration: "none" }}>
            View plans →
          </a>
        )}
        {showVoiceWall && (
          <InkUpgradeModal reason="tts" onClose={() => setShowVoiceWall(false)} />
        )}
        </div>
      </StudioShell>
    );
  }

  // Pre-start state
  if (!started) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 24,
        padding: "0 48px",
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "linear-gradient(135deg, var(--ds-accent-400), var(--ds-accent-500))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{
            fontFamily: "var(--font-lora), serif",
            fontStyle: "italic",
            fontSize: "1.6rem",
            fontWeight: 400,
            color: "var(--ds-ink)",
            marginBottom: 8,
          }}>
            Brainstorm with T.H.E.O
          </h2>
          <p style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            maxWidth: 340,
            lineHeight: 1.55,
            fontFamily: "var(--font-manrope), sans-serif",
            margin: "0 auto",
          }}>
            Your ghostwriter, not a chatbot. T.H.E.O interviews the way a good editor does:
            he listens for the book inside the way you tell it, then asks the question that
            pulls the next chapter out of you.
          </p>
          <div style={{ maxWidth: 340, margin: "14px auto 0", display: "flex", flexDirection: "column", gap: 9, textAlign: "left" }}>
            {[
              audience && audience !== "General"
                ? `Pre-tuned for ${audience} — his questions already fit this book's reader`
                : "Tuned to your book's reader the moment you chose one",
              "Speak or type — he keeps up either way",
              "Everything you say becomes source material when you hit Finish",
            ].map((tip, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 13,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-manrope), sans-serif",
                lineHeight: 1.5,
              }}>
                <span style={{ color: "#C17A47", flexShrink: 0, marginTop: 2 }}>&#8226;</span>
                {tip}
              </div>
            ))}
          </div>
          {speechSupported && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-manrope), sans-serif",
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="1" width="6" height="9" rx="3" />
                <path d="M3 7v1a5 5 0 0010 0V7" />
                <path d="M8 13v2" />
              </svg>
              Voice enabled — tap the mic to speak
            </div>
          )}
        </div>
        <button
          onClick={() => { setPendingResume(false); setShowTtsPrompt(true); }}
          className="transcribe-btn"
          style={{ marginTop: 8 }}
        >
          Start Brainstorming →
        </button>
        <button
          className="ds-studio-exit"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            fontSize: 13,
            color: "var(--text-tertiary)",
            cursor: "pointer",
            fontFamily: "var(--font-manrope), sans-serif",
          }}
        >
          ← Back to upload options
        </button>
      </div>
    );
  }

  // Summarizing state
  if (summarizing) {
    return (
      <StudioShell onExit={onBack} label="Saving brainstorm session">
        <div role="status" aria-live="polite" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}>
        <div className="brainstorm-spinner" />
        <p style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-manrope), sans-serif",
        }}>
          Distilling your ideas into source material...
        </p>
        <style>{`
          .brainstorm-spinner {
            width: 32px;
            height: 32px;
            border: 2.5px solid rgba(0,0,0,0.08);
            border-top-color: var(--ds-accent-500);
            border-radius: 50%;
            animation: bspin 0.8s linear infinite;
          }
          @keyframes bspin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        </div>
      </StudioShell>
    );
  }

  // ── Stage presentation (resonant-adoption): full-screen theater ──
  // Group the transcript into interviewer/author exchanges. The live exchange
  // renders full-size; the previous two stay visible above it, receding.
  interface Exchange { q?: string; a?: string }
  const exchanges: Exchange[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      exchanges.push({ q: m.content });
    } else {
      const last = exchanges[exchanges.length - 1];
      if (last && last.a == null) last.a = m.content;
      else exchanges.push({ a: m.content });
    }
  }
  const live = exchanges[exchanges.length - 1];
  const receding = exchanges.slice(0, -1).slice(-2);
  const older = exchanges.slice(0, -1).slice(0, -2);
  const thinking = streaming && (!live || !live.q);
  const composing = input.trim().length > 0 || listening || transcribing;

  // Portal to <body>: the upload panel sits inside a transformed ancestor,
  // which would otherwise trap this fixed overlay at panel size.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Brainstorm studio"
      tabIndex={-1}
      className="ds-studio-stage"
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#1A1610",
        color: "#F9F7F2",
        ...studioViewportStyle,
      }}
    >
      {/* The studio sits in the same library as the Meet T.H.E.O lobby, thrown
          far out of focus so the conversation stays the subject. One CSS rule
          lifts every sibling above it, so the stage markup below is untouched. */}
      <StudioBackdrop />
      {/* Stage header */}
      <div className="ds-studio-header">
        <button
          className="ds-studio-exit"
          onClick={requestLeave}
          aria-label="Exit studio"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "rgba(249,247,242,0.6)",
            padding: 4,
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
          <span className="ds-label" style={{ color: "rgba(249,247,242,0.6)" }}>Exit studio</span>
        </button>
        <span className="ds-label ds-studio-title" style={{ color: "rgba(249,247,242,0.75)", marginLeft: 8, maxWidth: "min(52vw, 640px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {INTERVIEWER_NAME} <span style={{ color: "rgba(249,247,242,0.4)" }}>· {interviewerRoleLine(audience)}</span>
        </span>
        <div className="ds-studio-actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => {
              const next = !ttsEnabled;
              const voiceReady = !next || initializeTtsAudio();
              setTtsEnabled(next && voiceReady);
              ttsEnabledRef.current = next && voiceReady;
              if (!next) {
                stopAudio();
                setTtsFailed(false);
                setVoiceNotice(null);
              } else if (voiceReady) {
                setVoiceNotice(null);
              }
            }}
            title={ttsEnabled ? "Mute AI voice" : "Unmute AI voice"}
            aria-label={ttsEnabled ? "Mute AI voice" : "Unmute AI voice"}
            style={{
              background: "none",
              border: "1px solid rgba(249,247,242,0.18)",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            {ttsEnabled ? "🔊" : "🔇"}
          </button>
          {ttsFailed && !ttsEnabled && (
            <button
              onClick={retryVoice}
              className="ds-studio-voice-retry"
              aria-label="Try T.H.E.O. voice again"
              style={{
                background: "none",
                color: "rgba(249,247,242,0.72)",
                border: "1px solid rgba(249,247,242,0.18)",
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              Try voice again
            </button>
          )}
          <div className="ds-studio-tts-meter">
            <TtsMeter compact />
          </div>
          {canUndo && (
            <button
              onClick={undoLast}
              style={{
                background: "none",
                color: "rgba(249,247,242,0.55)",
                border: "1px solid rgba(249,247,242,0.18)",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              Undo
            </button>
          )}
          {older.length > 0 && (
            <button
              onClick={() => setShowHistory((open) => !open)}
              aria-expanded={showHistory}
              aria-controls="ds-studio-history"
              style={{
                background: showHistory ? "rgba(249,247,242,0.12)" : "none",
                color: "rgba(249,247,242,0.55)",
                border: "1px solid rgba(249,247,242,0.18)",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              History
            </button>
          )}
        </div>
      </div>

      {/* Conversation stage */}
      <div className="ds-studio-content">
      <div ref={messagesEndRef} className="ds-studio-conversation" style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        maxWidth: 880,
        width: "100%",
        margin: "0 auto",
      }}>
        {receding.map((ex, i) => (
          <div key={i} style={{ marginBottom: 26, opacity: i === receding.length - 1 ? 0.55 : 0.35 }}>
            {ex.q && (
              <p style={{
                fontFamily: "var(--font-lora), serif",
                fontSize: i === receding.length - 1 ? 19 : 16,
                lineHeight: 1.4,
                margin: 0,
                color: "#F9F7F2",
              }}>
                {ex.q}
              </p>
            )}
            {ex.a && (
              <p style={{
                fontFamily: "var(--font-lora), serif",
                fontStyle: "italic",
                fontSize: i === receding.length - 1 ? 16 : 14,
                lineHeight: 1.45,
                margin: "8px 0 0",
                color: "rgba(249,247,242,0.75)",
              }}>
                {ex.a}
              </p>
            )}
          </div>
        ))}

        {/* Live exchange */}
        <div style={{ marginBottom: 8 }}>
          <div className="ds-label ds-label--accent" style={{ marginBottom: 10 }}>
            {thinking ? `${INTERVIEWER_NAME} · thinking` : streaming ? `${INTERVIEWER_NAME} · speaking` : `${INTERVIEWER_NAME} · asking`}
          </div>
          {thinking ? (
            <p aria-live="polite" style={{ fontFamily: "var(--font-lora), serif", fontSize: 30, margin: 0, color: "rgba(249,247,242,0.45)" }}>
              <span className="ds-stage-dots">· · ·</span>
            </p>
          ) : (
            <p aria-live="polite" style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: "clamp(24px, 3.2vw, 38px)",
              lineHeight: 1.28,
              margin: 0,
              color: "#F9F7F2",
              letterSpacing: "-0.01em",
            }}>
              {live?.q}
            </p>
          )}
          {live?.a && (
            <p style={{
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
              fontSize: "clamp(18px, 2.2vw, 24px)",
              lineHeight: 1.4,
              margin: "14px 0 0",
              color: "rgba(249,247,242,0.7)",
            }}>
              {live.a}
            </p>
          )}
        </div>

        {/* Your live transcript */}
        {composing && (
          <div style={{ marginTop: 18 }}>
            <div className="ds-label" style={{ color: "rgba(249,247,242,0.45)", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
              You · {transcribing ? "writing down what you said…" : listening ? (input.trim() ? "live transcript" : "listening — speak when ready") : "typing"}
              {/* Live input level. Kyle's failures read as "not picking up" with
                  no error — this bar is the on-device proof the mic hears him,
                  updated straight from the meter loop without re-rendering. */}
              {listening && (
                <span aria-hidden="true" style={{ display: "inline-block", width: 46, height: 5, borderRadius: 3, background: "rgba(249,247,242,0.16)", overflow: "hidden" }}>
                  <span
                    ref={micLevelFillRef}
                    style={{ display: "block", height: "100%", width: "0%", background: "#C17A47", transition: "width 80ms linear" }}
                  />
                </span>
              )}
            </div>
            <p style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: "clamp(20px, 2.6vw, 30px)",
              lineHeight: 1.35,
              margin: 0,
              color: "rgba(249,247,242,0.65)",
            }}>
              {input}
              <span className="ds-stage-cursor" aria-hidden="true" />
            </p>
          </div>
        )}
      </div>
      {/* The drawer belongs to the flex content area, so its edges follow the
          actual wrapped header and composer instead of fixed pixel guesses. */}
      {showHistory && (
        <aside id="ds-studio-history" className="ds-studio-history" aria-label="Full conversation">
          <div className="ds-label" style={{ color: "rgba(249,247,242,0.5)", marginBottom: 12 }}>Full conversation</div>
          {messages.map((m, i) => (
            <p key={i} style={{
              fontSize: 13,
              lineHeight: 1.55,
              margin: "0 0 12px",
              fontFamily: m.role === "assistant" ? "var(--font-lora), serif" : "var(--font-manrope), sans-serif",
              color: m.role === "assistant" ? "rgba(249,247,242,0.85)" : "rgba(249,247,242,0.55)",
            }}>
              <span className="ds-label" style={{ display: "block", fontSize: 9, color: m.role === "assistant" ? "#C17A47" : "rgba(249,247,242,0.35)", marginBottom: 3 }}>
                {m.role === "assistant" ? INTERVIEWER_NAME : "You"}
              </span>
              {m.content}
            </p>
          ))}
        </aside>
      )}
      </div>

      {/* The studio's only error surface. Everything else was a console.error. */}
      {(sendError || storageBlocked || voiceNotice) && (
        <div
          role="alert"
          style={{
            maxWidth: 880,
            width: "100%",
            margin: "0 auto 10px",
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(193,122,71,0.16)",
            border: "1px solid rgba(224,140,72,0.45)",
            color: "#F2D7C2",
            fontSize: 13,
            fontFamily: "var(--font-manrope), sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            {sendError ?? voiceNotice ?? "This browser is blocking storage, so this session won't be saved if you close the tab."}
          </span>
          {sendError && /HTTP 402|out of Ink/.test(sendError) && (
            <button
              type="button"
              onClick={() => setShowInkWall(true)}
              style={{
                background: "var(--ds-accent-500)", color: "#fff", border: "none",
                borderRadius: 100, padding: "6px 16px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              Add more Ink
            </button>
          )}
          {retryAction && (
            <button
              onClick={() => {
                const action = retryAction;
                setSendError(null);
                setRetryAction(null);
                if (action === "start") startConversation();
                else if (action === "finish") finishBrainstorm();
                else sendMessage();
              }}
              style={{
                background: "var(--ds-accent-500)", color: "#fff", border: "none",
                borderRadius: 100, padding: "6px 16px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              Retry
            </button>
          )}
          {voiceNotice?.includes("Try voice again") && (
            <button
              onClick={retryVoice}
              style={{
                background: "var(--ds-accent-500)", color: "#fff", border: "none",
                borderRadius: 100, padding: "6px 16px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              Try voice again
            </button>
          )}
          <button
            onClick={() => { setSendError(null); setRetryAction(null); setStorageBlocked(false); setVoiceNotice(null); }}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="ds-studio-composer" style={{ maxWidth: 880, width: "100%", margin: "0 auto" }}>
        <div className="ds-studio-composer-form" style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          flexWrap: "wrap",
        }}>
          {speechSupported && (
            <button
              className="ds-studio-mic"
              onClick={toggleListening}
              aria-pressed={handsFree}
              title={handsFree ? "Hands-free is on — tap to stop listening" : "Turn on hands-free: the mic stays open and listens again after each answer"}
              style={{
                // Live red while actually recording; amber-armed while hands-free is on but
                // Theo has the floor. The button no longer goes dead between turns, because
                // the session state is what it reports.
                background: listening ? "#ef4444" : handsFree ? "rgba(193,122,71,0.22)" : "rgba(249,247,242,0.08)",
                border: listening ? "none" : handsFree ? "1px solid rgba(193,122,71,0.6)" : "1px solid rgba(249,247,242,0.18)",
                borderRadius: 12,
                height: 52,
                padding: "0 18px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                flexShrink: 0,
                animation: listening ? "micPulse 1.5s ease-in-out infinite" : "none",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke={listening ? "#fff" : handsFree ? "#E0A35D" : "rgba(249,247,242,0.7)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="1" width="6" height="9" rx="3" />
                <path d="M3 7v1a5 5 0 0010 0V7" />
                <path d="M8 13v2" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: listening ? "#fff" : handsFree ? "#E0A35D" : "rgba(249,247,242,0.7)", fontFamily: "var(--font-manrope), sans-serif", whiteSpace: "nowrap" }}>
                {listening ? "Listening…" : handsFree ? "Hands-free" : "Speak"}
              </span>
            </button>
          )}
          <textarea
            className="ds-studio-textarea"
            ref={inputRef}
            value={input}
            onChange={e => { typedRef.current = true; setInput(e.target.value); }}
            onKeyDown={e => {
              // Touch keyboards have no Shift+Enter, so Enter-to-send made a
              // paragraph break unreachable — and the key still renders as
              // "return", so hitting it to start a new paragraph fired a
              // half-answer that became permanent source material. On coarse
              // pointers the send button is the only send path.
              const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
              // isComposing: committing an IME candidate with return must not send.
              if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={streaming ? `${INTERVIEWER_NAME} is thinking…` : speechSupported ? "Speak, or type your answer…" : "Type your answer…"}
            disabled={streaming}
            rows={1}
            aria-label="Your answer"
            style={{
              flex: 1,
              minWidth: 220,
              border: "1px solid rgba(249,247,242,0.18)",
              outline: "none",
              resize: "none",
              fontSize: 16,
              fontFamily: "var(--font-manrope), sans-serif",
              background: "rgba(249,247,242,0.06)",
              color: "#F9F7F2",
              lineHeight: 1.5,
              maxHeight: 120,
              borderRadius: 12,
              padding: "14px 16px",
            }}
          />
          <button
            className="ds-studio-send"
            onClick={() => {
              sendMessage();
            }}
            disabled={!input.trim() || streaming}
            aria-label="Send answer"
            style={{
              background: input.trim() && !streaming ? "#C17A47" : "rgba(249,247,242,0.08)",
              border: "none",
              borderRadius: 12,
              width: 52,
              height: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: input.trim() && !streaming ? "pointer" : "default",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke={input.trim() && !streaming ? "#fff" : "rgba(249,247,242,0.35)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2L7 9" />
              <path d="M14 2l-5 12-2-5-5-2z" />
            </svg>
          </button>
          <button
            className="ds-studio-finish"
            onClick={finishBrainstorm}
            disabled={!canFinish}
            style={{
              background: "none",
              color: canFinish ? "#F9F7F2" : "rgba(249,247,242,0.3)",
              border: `1px solid ${canFinish ? "rgba(249,247,242,0.35)" : "rgba(249,247,242,0.12)"}`,
              borderRadius: 12,
              height: 52,
              padding: "0 18px",
              fontSize: 13,
              fontWeight: 600,
              cursor: canFinish ? "pointer" : "default",
              fontFamily: "var(--font-manrope), sans-serif",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Finish &amp; add to sources
          </button>
          {canTakeABreak && (
            <button
              className="ds-studio-break"
              type="button"
              onClick={() => { void takeABreak(); }}
              style={{
                background: "none",
                color: "rgba(249,247,242,0.75)",
                border: "1px solid rgba(249,247,242,0.22)",
                borderRadius: 12,
                height: 52,
                padding: "0 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-manrope), sans-serif",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Take a break
            </button>
          )}
        </div>
        {userMessageCount >= BRAINSTORM_LENGTH_NUDGE_TURNS && !lengthNudgeDismissed && (
          <div role="status" style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(193,122,71,0.14)",
            border: "1px solid rgba(193,122,71,0.35)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <p style={{
              margin: 0,
              flex: 1,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "rgba(249,247,242,0.82)",
              fontFamily: "var(--font-manrope), sans-serif",
            }}>
              We&apos;ve covered a lot of ground. Want to finish this into sources and keep going in a fresh conversation? I&apos;ll still be here.
            </p>
            <button
              type="button"
              onClick={() => setLengthNudgeDismissed(true)}
              aria-label="Dismiss"
              style={{
                background: "none",
                border: "none",
                color: "rgba(249,247,242,0.55)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}
        {userMessageCount > 0 && (
          <p style={{
            fontSize: 11,
            color: "rgba(249,247,242,0.4)",
            marginTop: 8,
            textAlign: "center",
            fontFamily: "var(--font-manrope), sans-serif",
          }}>
            {userMessageCount < 2
              ? "Keep going — a couple more answers before this becomes source material"
              : `${userMessageCount} answers gathered · finish when you're ready`}
          </p>
        )}
      </div>

      {showVoiceWall && (
        <InkUpgradeModal reason="tts" onClose={() => setShowVoiceWall(false)} />
      )}
      {showInkWall && (
        <InkUpgradeModal reason="ink" onClose={() => setShowInkWall(false)} />
      )}
      {usageNudge && !showVoiceWall && !showInkWall && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            width: "min(28rem, calc(100vw - 2rem))",
            borderRadius: 12,
            padding: "12px 16px",
            background: "rgba(25,24,22,0.96)",
            border: "1px solid rgba(193,122,71,0.35)",
            color: "#F9F7F2",
            fontSize: 13,
            fontFamily: "var(--font-manrope), sans-serif",
            boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <p style={{ margin: 0, flex: 1, lineHeight: 1.45 }}>
              {usageNudge === "tts"
                ? "You're close to this month's voice. I can still take notes if you type — or add more whenever you like."
                : "You're close to this month's Ink. I can still work with you, and you can add more whenever you like."}
            </p>
            <button
              type="button"
              onClick={() => {
                if (usageNudgeKey && typeof window !== "undefined") {
                  window.localStorage.setItem(usageNudgeKey, "1");
                }
                setUsageNudge(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#C17A47",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
                fontFamily: "var(--font-manrope), sans-serif",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <style>{`
        .ds-stage-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          margin-left: 3px;
          vertical-align: -0.12em;
          background: #C17A47;
          animation: dsBlink 0.85s steps(1) infinite;
        }
        .ds-stage-dots { animation: typingPulse 1.2s ease-in-out infinite; }
        @keyframes dsBlink { 50% { opacity: 0; } }
        @keyframes typingPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ds-stage-cursor, .ds-stage-dots { animation: none !important; }
        }
      `}</style>
      {showLeaveGuard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Leave the studio?"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(26,22,16,0.72)",
            padding: 24,
          }}
        >
          <div style={{
            width: "min(420px, 100%)",
            background: "#2C2419",
            border: "1px solid rgba(249,247,242,0.16)",
            borderRadius: 16,
            padding: "28px 24px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}>
            <h2 style={{
              margin: 0,
              fontFamily: "var(--font-lora), serif",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: "1.35rem",
              color: "#F9F7F2",
            }}>
              Want me to hold this conversation?
            </h2>
            <p style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.55,
              color: "rgba(249,247,242,0.72)",
              fontFamily: "var(--font-manrope), sans-serif",
            }}>
              Take a break and I&apos;ll keep every answer. Discard and I&apos;ll let it go.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                className="transcribe-btn"
                onClick={() => { void takeABreak(); }}
                style={{ width: "100%" }}
              >
                Take a break
              </button>
              <button
                type="button"
                onClick={() => setShowLeaveGuard(false)}
                style={{
                  width: "100%",
                  height: 46,
                  borderRadius: 12,
                  border: "1px solid rgba(249,247,242,0.22)",
                  background: "none",
                  color: "#F9F7F2",
                  fontFamily: "var(--font-manrope), sans-serif",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Throw this conversation away? You can always start a new one.")) return;
                  discardConversation(() => onBack());
                }}
                style={{
                  width: "100%",
                  height: 46,
                  borderRadius: 12,
                  border: "none",
                  background: "none",
                  color: "rgba(249,247,242,0.55)",
                  fontFamily: "var(--font-manrope), sans-serif",
                  cursor: "pointer",
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
