"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import TtsMeter from "@/components/ui/TtsMeter";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface BrainstormChatProps {
  projectId: string;
  onComplete: () => void;
  onBack: () => void;
}

export default function BrainstormChat({ projectId, onComplete, onBack }: BrainstormChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [started, setStarted] = useState(false);
  const [listening, setListening] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [savedMessages, setSavedMessages] = useState<Message[]>([]);
  const sessionKey = `brainstorm_session_${projectId}`;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSendRef = useRef<(() => void) | null>(null);

  const [pendingTts, setPendingTts] = useState(true);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const ttsEnabledRef = useRef(true);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const sentenceBufferRef = useRef("");

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
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
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
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stopAudio]);

  const toggleListening = useCallback(() => {
    if (listening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

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

    recognition.onerror = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setListening(false);
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setListening(false);
    };

    recognitionRef.current = recognition;
    stopAudio(); // stop AI voice when user starts speaking
    recognition.start();
    setListening(true);
  }, [listening, stopAudio]);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
    };
  }, []);

  // Start the conversation — AI sends first message
  const startConversation = useCallback(async () => {
    setTtsEnabled(pendingTts);
    ttsEnabledRef.current = pendingTts;
    setStarted(true);
    setStreaming(true);

    const initMessages: Message[] = [{ role: "user", content: "Start the brainstorm session." }];
    let aiText = "";

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: initMessages }),
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

    // Build API messages — include the hidden init prompt + all visible messages
    const apiMessages: Message[] = [
      { role: "user", content: "Start the brainstorm session." },
      ...updatedMessages,
    ];

    let aiText = "";

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
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
            onClick={() => setPendingTts(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
              background: "var(--input-bg)", border: "1px solid var(--border-subtle)",
              borderRadius: 40, padding: "8px 16px", cursor: "pointer",
              fontFamily: "var(--font-manrope), sans-serif", fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={pendingTts ? "var(--ds-accent)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
              <rect x="5" y="1" width="6" height="9" rx="3" />
              <path d="M3 7v1a5 5 0 0010 0V7" /><path d="M8 13v2" />
            </svg>
            Voice read-back
            <div style={{ width: 32, height: 18, borderRadius: 9, position: "relative", background: pendingTts ? "var(--ds-accent)" : "rgba(0,0,0,0.12)", transition: "background 0.2s" }}>
              <div style={{ position: "absolute", top: 2, left: pendingTts ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </button>
          <button
            className="transcribe-btn"
            onClick={() => { setTtsEnabled(pendingTts); ttsEnabledRef.current = pendingTts; setMessages(savedMessages); setStarted(true); setShowResume(false); }}
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
        {/* TTS toggle */}
        <button
          onClick={() => setPendingTts(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--input-bg)", border: "1px solid var(--border-subtle)",
            borderRadius: 40, padding: "8px 16px", cursor: "pointer",
            fontFamily: "var(--font-manrope), sans-serif", fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={pendingTts ? "var(--ds-accent)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round">
            <rect x="5" y="1" width="6" height="9" rx="3" />
            <path d="M3 7v1a5 5 0 0010 0V7" /><path d="M8 13v2" />
          </svg>
          Voice read-back
          <div style={{
            width: 32, height: 18, borderRadius: 9, position: "relative",
            background: pendingTts ? "var(--ds-accent)" : "rgba(0,0,0,0.12)",
            transition: "background 0.2s",
          }}>
            <div style={{
              position: "absolute", top: 2, left: pendingTts ? 14 : 2, width: 14, height: 14,
              borderRadius: "50%", background: "#fff", transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>
        </button>
        <button
          onClick={startConversation}
          className="transcribe-btn"
          style={{ marginTop: 4 }}
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

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              color: "var(--text-tertiary)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 12L6 8l4-4" />
            </svg>
          </button>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ds-ink)",
            fontFamily: "var(--font-manrope), sans-serif",
          }}>
            Brainstorm Session
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => {
              const next = !ttsEnabled;
              setTtsEnabled(next);
              ttsEnabledRef.current = next;
              if (!next) stopAudio();
            }}
            title={ttsEnabled ? "Mute AI voice" : "Unmute AI voice"}
            style={{
              background: "none",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 16,
              padding: "12px 20px",
              fontSize: 28,
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
                color: "var(--text-tertiary)",
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "var(--font-manrope), sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h7a4 4 0 010 8H8" />
                <path d="M6 4L3 7l3 3" />
              </svg>
              Undo
            </button>
          )}
          {canFinish && (
            <button
              onClick={finishBrainstorm}
              style={{
                background: "var(--ds-accent-500)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-manrope), sans-serif",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Finish & Transcribe →
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{
              maxWidth: "80%",
              padding: "10px 16px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user"
                ? "var(--ds-accent-500)"
                : "rgba(0,0,0,0.04)",
              color: msg.role === "user" ? "#fff" : "var(--ds-ink)",
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: "var(--font-manrope), sans-serif",
              whiteSpace: "pre-wrap",
            }}>
              {msg.content || (
                <span style={{ opacity: 0.5 }}>
                  <span className="typing-dots">...</span>
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "16px 24px 24px",
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          background: "rgba(255,255,255,0.8)",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 16,
          padding: "14px 16px",
        }}>
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
            placeholder={streaming ? "AI is thinking..." : speechSupported ? "Tap the mic or type your ideas..." : "Share your ideas..."}
            disabled={streaming}
            rows={2}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 16,
              fontFamily: "var(--font-manrope), sans-serif",
              background: "transparent",
              color: "var(--ds-ink)",
              lineHeight: 1.5,
              maxHeight: 160,
            }}
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              disabled={streaming}
              style={{
                background: listening ? "#ef4444" : "rgba(0,0,0,0.04)",
                border: listening ? "none" : "1px solid rgba(0,0,0,0.08)",
                borderRadius: 14,
                height: 56,
                padding: "0 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: streaming ? "default" : "pointer",
                transition: "background 0.15s",
                flexShrink: 0,
                animation: listening ? "micPulse 1.5s ease-in-out infinite" : "none",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke={listening ? "#fff" : "#7a7369"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="1" width="6" height="9" rx="3" />
                <path d="M3 7v1a5 5 0 0010 0V7" />
                <path d="M8 13v2" />
              </svg>
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: listening ? "#fff" : "#7a7369",
                fontFamily: "var(--font-manrope), sans-serif",
                whiteSpace: "nowrap",
              }}>
                {listening ? "Listening..." : "Speak"}
              </span>
            </button>
          )}
          <button
            onClick={() => {
              if (listening) {
                recognitionRef.current?.stop();
                setListening(false);
              }
              sendMessage();
            }}
            disabled={!input.trim() || streaming}
            style={{
              background: input.trim() && !streaming ? "var(--ds-accent-500)" : "rgba(0,0,0,0.08)",
              border: "none",
              borderRadius: 14,
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: input.trim() && !streaming ? "pointer" : "default",
              transition: "background 0.15s",
              flexShrink: 0,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke={input.trim() && !streaming ? "#fff" : "#a0978a"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2L7 9" />
              <path d="M14 2l-5 12-2-5-5-2z" />
            </svg>
          </button>
        </div>
        {userMessageCount > 0 && (
          <p style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 6,
            textAlign: "center",
            fontFamily: "var(--font-manrope), sans-serif",
          }}>
            {userMessageCount < 2
              ? "Keep going — share a few more ideas before finishing"
              : `${userMessageCount} exchanges · Ready to finish when you are`}
          </p>
        )}
      </div>

      <style>{`
        .typing-dots {
          animation: typingPulse 1.2s ease-in-out infinite;
        }
        @keyframes typingPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
