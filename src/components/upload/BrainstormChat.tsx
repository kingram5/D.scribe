"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import TtsMeter from "@/components/ui/TtsMeter";
import { INTERVIEWER_NAME, interviewerRoleLine } from "@/lib/interviewer";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface BrainstormChatProps {
  projectId: string;
  onComplete: () => void;
  onBack: () => void;
  triggerFinish?: boolean;
  onFinishTriggered?: () => void;
}

export default function BrainstormChat({ projectId, onComplete, onBack, triggerFinish, onFinishTriggered }: BrainstormChatProps) {
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
  /* True while TTS audio is actually playing. The queue lives in refs, so state is what
     lets the resume effect wait for silence instead of transcribing Theo's own voice. */
  const [speaking, setSpeaking] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [savedMessages, setSavedMessages] = useState<Message[]>([]);
  const [showTtsPrompt, setShowTtsPrompt] = useState(false);
  const [pendingResume, setPendingResume] = useState(false);
  const [ttsAvail, setTtsAvail] = useState<"loading" | "available" | "locked" | "exhausted">("loading");
  const sessionKey = `brainstorm_session_${projectId}`;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSendRef = useRef<(() => void) | null>(null);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const ttsEnabledRef = useRef(true);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const sentenceBufferRef = useRef("");

  // Stage presentation state: project audience feeds the interviewer role
  // line; the history drawer holds exchanges older than the rolling two.
  const [audience, setAudience] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/project/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!cancelled && p?.audience) setAudience(p.audience); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  // Check for speech recognition support
  const speechSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // TTS helpers — defined before toggleListening to avoid TDZ
  const playNext = useCallback(() => {
    if (isPlayingRef.current) return;
    // Queue drained: Theo has stopped talking. Hands-free mode watches this to know
    // when it is safe to re-open the mic without recording his own voice.
    if (audioQueueRef.current.length === 0) { setSpeaking(false); return; }
    isPlayingRef.current = true;
    setSpeaking(true);
    const buf = audioQueueRef.current.shift()!;
    const ctx = (audioCtxRef.current ??= new AudioContext());
    ctx.decodeAudioData(buf.slice(0), (decoded) => {
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      currentSourceRef.current = src;
      src.onended = () => {
        isPlayingRef.current = false;
        currentSourceRef.current = null;
        playNext();
      };
      src.start();
    });
  }, []);

  const speakSentence = useCallback(async (text: string) => {
    if (!ttsEnabledRef.current || !text.trim()) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      audioQueueRef.current.push(buf);
      playNext();
    } catch { /* TTS is enhancement only — never block chat */ }
  }, [playNext]);

  const stopAudio = useCallback(() => {
    try { currentSourceRef.current?.stop(); } catch { /* ignore */ }
    currentSourceRef.current = null;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    sentenceBufferRef.current = "";
    setSpeaking(false);
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stopAudio]);

  /** Open the mic. Shared by the Speak button and the hands-free auto-resume, so a
   *  re-armed mic behaves identically to a hand-clicked one. */
  const startRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";
    let hasFinalResult = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
          hasFinalResult = true;
        } else {
          interim = transcript;
        }
      }
      setInput(finalTranscript + interim);

      // Reset silence timer on every result
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      // If we have final text and no interim (user stopped talking), start 3s countdown
      if (hasFinalResult && !interim) {
        silenceTimerRef.current = setTimeout(() => {
          recognition.stop();
          setListening(false);
          // Auto-send via ref (avoids stale closure)
          autoSendRef.current?.();
        }, 3000);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setListening(false);
      // A denied or unavailable mic will fail identically forever, so drop out of
      // hands-free rather than spinning up a restart loop. "no-speech" is routine and
      // must NOT disarm the session.
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed" || event?.error === "audio-capture") {
        setHandsFree(false);
      }
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setListening(false);
    };

    recognitionRef.current = recognition;
    stopAudio(); // stop AI voice when user starts speaking
    try { recognition.start(); } catch { return; } // already-started throws; ignore
    setListening(true);
  }, [stopAudio]);

  const toggleListening = useCallback(() => {
    if (listening || handsFree) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      setListening(false);
      setHandsFree(false);
      return;
    }
    setHandsFree(true);
    startRecognition();
  }, [listening, handsFree, startRecognition]);

  /* Hands-free re-arm. The mic is deliberately closed while Theo answers so it cannot
     transcribe his own TTS voice, so this waits for BOTH halves of his turn to finish:
     `streaming` false (he has stopped writing) and `speaking` false (the audio queue has
     drained). The short delay lets the last syllable decay before the mic opens. */
  useEffect(() => {
    if (!handsFree || listening || streaming || speaking || summarizing) return;
    const t = setTimeout(() => startRecognition(), 500);
    return () => clearTimeout(t);
  }, [handsFree, listening, streaming, speaking, summarizing, startRecognition]);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
    };
  }, []);

  // Start the conversation — AI sends first message
  const startConversation = useCallback(async () => {
    setStarted(true);
    setStreaming(true);

    const initMessages: Message[] = [{ role: "user", content: "Start the brainstorm session." }];
    let aiText = "";

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: initMessages, project_id: projectId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API error ${res.status}`);
      }

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
      }
      // Flush any remaining text after stream ends
      if (sentenceBufferRef.current.trim()) {
        speakSentence(sentenceBufferRef.current.trim());
        sentenceBufferRef.current = "";
      }
    } catch (err) {
      console.error("Brainstorm start error:", err);
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const isInkError = msg.includes("ink") || msg.includes("402");
      aiText = isInkError
        ? "You're out of Ink for this session. Upgrade your plan to continue brainstorming."
        : "Couldn't connect to the brainstorm session. Please try again.";
      setMessages([{ role: "assistant", content: aiText }]);
    }

    setStreaming(false);
    inputRef.current?.focus();
  }, [speakSentence]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setStreaming(true);

    // Build API messages: pin init + first exchange, window the rest to last 8 (4 exchanges)
    const WINDOW_SIZE = 8;
    const initMsg: Message = { role: "user", content: "Start the brainstorm session." };
    const firstExchange = updatedMessages.slice(0, 2); // user topic + AI first question
    const remainder = updatedMessages.slice(2);
    const windowed = remainder.length > WINDOW_SIZE ? remainder.slice(-WINDOW_SIZE) : remainder;
    const apiMessages: Message[] = [initMsg, ...firstExchange, ...windowed];

    let aiText = "";

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, project_id: projectId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API error ${res.status}`);
      }

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
      // Flush any remaining text after stream ends
      if (sentenceBufferRef.current.trim()) {
        speakSentence(sentenceBufferRef.current.trim());
        sentenceBufferRef.current = "";
      }
    } catch (err) {
      console.error("Brainstorm error:", err);
    }

    setStreaming(false);
    inputRef.current?.focus();
  }, [input, streaming, messages, speakSentence]);

  // Keep autoSendRef in sync so the silence timer can call sendMessage without stale closures
  useEffect(() => {
    autoSendRef.current = sendMessage;
  }, [sendMessage]);

  // Load saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sessionKey);
      if (raw) {
        const msgs: Message[] = JSON.parse(raw);
        if (msgs.length >= 2) { setSavedMessages(msgs); setShowResume(true); }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave on every message change
  useEffect(() => {
    if (started && messages.length > 0) {
      localStorage.setItem(sessionKey, JSON.stringify(messages));
    }
  }, [messages, started, sessionKey]);

  // Fetch TTS availability when modal opens
  useEffect(() => {
    if (!showTtsPrompt) return;
    setTtsAvail("loading");
    fetch("/api/ink/usage")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setTtsAvail("available"); return; }
        if (d.tts_limit === 0) setTtsAvail("locked");
        else if (d.tts_chars_used >= d.tts_limit) setTtsAvail("exhausted");
        else setTtsAvail("available");
      })
      .catch(() => setTtsAvail("available"));
  }, [showTtsPrompt]);

  const finishBrainstorm = useCallback(async () => {
    // Need at least 2 user messages to have meaningful content
    const userMessages = messages.filter(m => m.role === "user");
    if (userMessages.length < 2) return;

    setSummarizing(true);

    try {
      const res = await fetch("/api/brainstorm/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, project_id: projectId }),
      });

      if (res.ok) {
        localStorage.removeItem(sessionKey);
        onComplete();
      } else {
        const err = await res.json();
        console.error("Summarize error:", err);
        setSummarizing(false);
      }
    } catch (err) {
      console.error("Summarize error:", err);
      setSummarizing(false);
    }
  }, [messages, projectId, onComplete]);

  const undoLast = useCallback(() => {
    if (streaming || messages.length < 2) return;
    // Remove last AI response + last user message
    const lastAiIdx = messages.length - 1;
    const lastUserIdx = messages.length - 2;
    if (messages[lastAiIdx]?.role === "assistant" && messages[lastUserIdx]?.role === "user") {
      setMessages(messages.slice(0, -2));
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

  // Resume prompt
  if (showResume) {
    const lastMsg = savedMessages[savedMessages.length - 1];
    const preview = lastMsg?.content.slice(0, 110) + (lastMsg?.content.length > 110 ? "…" : "");
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20, padding: "0 48px" }}>
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
            Last message:
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
            style={{ background: "var(--input-bg)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
            onClick={() => { localStorage.removeItem(sessionKey); setSavedMessages([]); setShowResume(false); }}
          >
            Start New Session
          </button>
        </div>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 13, color: "var(--text-tertiary)", cursor: "pointer", fontFamily: "var(--font-manrope), sans-serif" }}>
          ← Back to upload options
        </button>
      </div>
    );
  }

  // TTS choice modal
  if (showTtsPrompt) {
    function chooseTts(on: boolean) {
      setTtsEnabled(on);
      ttsEnabledRef.current = on;
      setShowTtsPrompt(false);
      if (pendingResume) {
        setMessages(savedMessages);
        setStarted(true);
      } else {
        startConversation();
      }
    }

    const isLocked = ttsAvail === "locked";
    const isExhausted = ttsAvail === "exhausted";
    const ttsBlocked = isLocked || isExhausted;

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 24, padding: "0 48px" }}>
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
              ? "You've used your monthly voice allowance. Resets at the start of next month."
              : "AI responses can be spoken back to you using your voice allowance. You can toggle this any time."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 260 }}>
          {ttsBlocked ? (
            <div style={{
              padding: "10px 16px", borderRadius: 8, textAlign: "center",
              background: "rgba(0,0,0,0.04)", border: "1px solid var(--border-subtle)",
              fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-manrope), sans-serif",
            }}>
              {isLocked ? "Voice unavailable on your plan" : "Monthly limit reached"}
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
            style={{ background: "var(--input-bg)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
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
      </div>
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
            Brainstorm with AI
          </h2>
          <p style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            maxWidth: 320,
            lineHeight: 1.5,
            fontFamily: "var(--font-manrope), sans-serif",
          }}>
            Have a conversation to develop your ideas. The AI will ask questions to draw out your thoughts — no blank page required.
          </p>
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
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
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
  const composing = input.trim().length > 0 || listening;

  // Portal to <body>: the upload panel sits inside a transformed ancestor,
  // which would otherwise trap this fixed overlay at panel size.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-label="Brainstorm studio"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(circle at 50% 20%, #2C2419 0%, #1A1610 100%)",
        color: "#F9F7F2",
      }}
    >
      {/* Stage header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 28px",
        flexWrap: "wrap",
      }}>
        <button
          onClick={onBack}
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
        <span className="ds-label" style={{ color: "rgba(249,247,242,0.75)", marginLeft: 8, maxWidth: "min(52vw, 640px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {INTERVIEWER_NAME} <span style={{ color: "rgba(249,247,242,0.4)" }}>· {interviewerRoleLine(audience)}</span>
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => {
              const next = !ttsEnabled;
              setTtsEnabled(next);
              ttsEnabledRef.current = next;
              if (!next) stopAudio();
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
          <TtsMeter compact />
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
              onClick={() => setShowHistory(!showHistory)}
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

      {/* History drawer */}
      {showHistory && (
        <div style={{
          position: "absolute",
          top: 68,
          right: 24,
          bottom: 110,
          width: "min(400px, calc(100vw - 48px))",
          zIndex: 5,
          overflowY: "auto",
          background: "rgba(26,22,16,0.97)",
          border: "1px solid rgba(249,247,242,0.14)",
          borderRadius: 14,
          padding: 18,
        }}>
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
        </div>
      )}

      {/* Conversation stage */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        maxWidth: 880,
        width: "100%",
        margin: "0 auto",
        padding: "12px 28px 20px",
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
            <div className="ds-label" style={{ color: "rgba(249,247,242,0.45)", marginBottom: 8 }}>
              You · {listening ? "live transcript" : "typing"}
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

      {/* Input bar */}
      <div style={{ padding: "0 28px calc(20px + env(safe-area-inset-bottom))", maxWidth: 880, width: "100%", margin: "0 auto" }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          flexWrap: "wrap",
        }}>
          {speechSupported && (
            <button
              onClick={toggleListening}
              aria-pressed={handsFree}
              title={handsFree ? "Hands-free is on — tap to stop listening" : "Turn on hands-free: the mic re-opens after each answer"}
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
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
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
            onClick={() => {
              if (listening) {
                recognitionRef.current?.stop();
                setListening(false);
              }
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
        </div>
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
    </div>,
    document.body
  );
}
