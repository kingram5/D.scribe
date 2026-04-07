"use client";

import { useState, useRef, useCallback } from "react";
import { sanitizeGenerated } from "@/lib/sanitize-output";

interface RewritePromptBarProps {
  chapterId: string;
  onRewriteStart: () => void;
  onRewriteChunk: (accumulatedText: string) => void;
  onRewriteComplete: (finalText: string) => void;
  onRewriteError: (error: string) => void;
  disabled?: boolean;
}

export default function RewritePromptBar({
  chapterId,
  onRewriteStart,
  onRewriteChunk,
  onRewriteComplete,
  onRewriteError,
  disabled = false,
}: RewritePromptBarProps) {
  const [feedback, setFeedback] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!feedback.trim() || streaming || disabled) return;

    setStreaming(true);
    onRewriteStart();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/rewrite/chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: chapterId,
          feedback: feedback.trim(),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMsg = "Rewrite failed";
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {
          // Response wasn't JSON
        }
        throw new Error(errorMsg);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

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
            const event = JSON.parse(data);
            if (event.error) {
              throw new Error(event.error);
            }
            if (event.text) {
              accumulated += event.text;
              onRewriteChunk(accumulated);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== data) throw e;
            // Skip malformed JSON
          }
        }
      }

      // Sanitize the final output
      const sanitized = sanitizeGenerated(accumulated);
      onRewriteComplete(sanitized);
      setFeedback("");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        onRewriteError("Rewrite cancelled");
      } else {
        onRewriteError(
          err instanceof Error ? err.message : "Something went wrong"
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [feedback, streaming, disabled, chapterId, onRewriteStart, onRewriteChunk, onRewriteComplete, onRewriteError]);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 24,
        right: 24,
        zIndex: 10,
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "10px 16px",
        borderRadius: 16,
        border: "1px solid rgba(193,122,71,0.2)",
        background: "rgba(249,247,242,0.95)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#C17A47"
        strokeWidth="2"
        style={{ flexShrink: 0, opacity: 0.7 }}
      >
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
        <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
      </svg>
      <input
        type="text"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Rewrite this chapter... (e.g., &quot;Add more supporting quotes&quot;)"
        disabled={streaming || disabled}
        style={{
          flex: 1,
          padding: "8px 0",
          border: "none",
          background: "transparent",
          fontSize: 14,
          fontFamily: "var(--font-manrope), sans-serif",
          outline: "none",
          color: "var(--text-primary)",
        }}
      />
      {streaming ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: "#C17A47",
              fontFamily: "var(--font-manrope), sans-serif",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#C17A47",
                animation: "pulse 1.5s infinite",
              }}
            />
            Rewriting...
          </span>
          <button
            onClick={handleCancel}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(220,38,38,0.3)",
              background: "transparent",
              color: "#dc2626",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-manrope), sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!feedback.trim() || disabled}
          style={{
            padding: "8px 18px",
            borderRadius: 10,
            border: "none",
            background:
              !feedback.trim() || disabled
                ? "rgba(193,122,71,0.3)"
                : "linear-gradient(135deg, #C17A47 0%, #A86230 100%)",
            color: "#F9F7F2",
            fontSize: 13,
            fontWeight: 600,
            cursor: !feedback.trim() || disabled ? "not-allowed" : "pointer",
            fontFamily: "var(--font-manrope), sans-serif",
            boxShadow:
              feedback.trim() && !disabled
                ? "0 2px 8px rgba(193,122,71,0.3)"
                : "none",
            transition: "all 0.15s ease",
          }}
        >
          Rewrite
        </button>
      )}
    </div>
  );
}
