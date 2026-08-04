"use client";

import { useState, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import type { TipTapSelection } from "./TipTapEditor";
import InkTooltip from "@/components/ui/InkTooltip";

interface MagicEditBubbleProps {
  editor: Editor | null;
  selection: TipTapSelection | null;
  chapterId: string;
  onRewritten: (newText: string) => void;
}

export default function MagicEditBubble({
  editor,
  selection,
  chapterId,
  onRewritten,
}: MagicEditBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Persist selection so it survives focus changes
  const lastSelectionRef = useRef<TipTapSelection | null>(null);

  // Position the bubble near the selection
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Update stored selection whenever a real selection comes in
  useEffect(() => {
    if (selection) {
      lastSelectionRef.current = selection;
    }
  }, [selection]);

  useEffect(() => {
    if (!editor || !selection) {
      // Only reset if we're NOT in expanded mode (user is actively editing)
      if (!expanded) {
        setFeedback("");
        setError(null);
        setPosition(null);
      }
      return;
    }

    try {
      const coords = editor.view.coordsAtPos(selection.from);
      const editorRect = editor.view.dom.getBoundingClientRect();
      // Clamp to the viewport: raw selection coords pushed the panel off the
      // right edge of a phone and above the editor on first-line selections.
      // On small viewports anchor BELOW the selection — iOS/Android draw
      // their own selection callout (Copy/Look Up/Share) directly above it,
      // and the OS chrome always wins that spot.
      const BUBBLE_ESTIMATED_WIDTH = 320;
      const anchorBelow = typeof window !== "undefined" && window.innerWidth < 768;
      const rawTop = anchorBelow
        ? coords.bottom - editorRect.top + 12
        : coords.top - editorRect.top - 48;
      const maxLeft = Math.max(8, editorRect.width - BUBBLE_ESTIMATED_WIDTH - 8);
      setPosition({
        top: Math.max(8, rawTop),
        left: Math.min(Math.max(8, coords.left - editorRect.left), maxLeft),
      });
    } catch {
      if (!expanded) setPosition(null);
    }
  }, [editor, selection, expanded]);

  // Close bubble when clicking outside of it. pointerdown, not mousedown:
  // synthesised mouse events on touch are delayed and suppressed entirely
  // when the tap becomes a scroll, leaving the panel stuck over the text.
  useEffect(() => {
    if (!position) return;
    function handleClickOutside(e: PointerEvent) {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        setExpanded(false);
        setFeedback("");
        setError(null);
        setPosition(null);
        lastSelectionRef.current = null;
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [position]);

  // Use the stored selection for rendering and submission
  const activeSelection = selection || (expanded ? lastSelectionRef.current : null);

  if (!activeSelection || !position) return null;

  const handleSubmit = async () => {
    const sel = lastSelectionRef.current;
    if (!feedback.trim() || !editor || !sel) return;

    setLoading(true);
    setError(null);

    try {
      // Get surrounding context from the editor
      const doc = editor.state.doc;
      const selectedText = doc.textBetween(sel.from, sel.to, "\n\n");

      // ~500 chars before and after for context
      const textBeforeSelection = doc.textBetween(
        Math.max(0, sel.from - 500),
        sel.from,
        "\n\n"
      );
      const textAfterSelection = doc.textBetween(
        sel.to,
        Math.min(doc.content.size, sel.to + 500),
        "\n\n"
      );

      const res = await fetch("/api/rewrite/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: chapterId,
          selected_text: selectedText,
          context_before: textBeforeSelection,
          context_after: textAfterSelection,
          feedback: feedback.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Rewrite failed");
      }

      const { rewritten_text } = await res.json();

      // Replace selection in editor
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: sel.from, to: sel.to },
          rewritten_text
        )
        .run();

      onRewritten(rewritten_text);
      setExpanded(false);
      setFeedback("");
      lastSelectionRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={bubbleRef}
      onMouseDown={(e) => {
        // Don't prevent default on input clicks — allows typing
        if ((e.target as HTMLElement).tagName !== "INPUT") {
          e.preventDefault();
        }
      }}
      style={{
        position: "absolute",
        top: position.top,
        left: Math.max(0, Math.min(position.left, 500)),
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      {!expanded ? (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setExpanded(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 20,
            border: "1px solid rgba(193,122,71,0.3)",
            background: "rgba(249,247,242,0.95)",
            backdropFilter: "blur(8px)",
            color: "#C17A47",
            fontSize: 13,
            fontFamily: "var(--font-manrope), sans-serif",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(193,122,71,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(249,247,242,0.95)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
          </svg>
          Magic Edit
        </button>
      ) : (
        <div
          onMouseDown={(e) => {
            // Only prevent default if not clicking on the input itself
            if ((e.target as HTMLElement).tagName !== "INPUT") {
              e.preventDefault();
            }
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(193,122,71,0.3)",
            background: "rgba(249,247,242,0.98)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            width: 320,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#C17A47",
              fontFamily: "var(--font-manrope), sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            </svg>
            Magic Edit
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              ref={inputRef}
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
                if (e.key === "Escape") {
                  setExpanded(false);
                  setFeedback("");
                }
              }}
              placeholder="Make this less formal..."
              disabled={loading}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(193,122,71,0.2)",
                background: "white",
                fontSize: 16,
                fontFamily: "var(--font-manrope), sans-serif",
                outline: "none",
                color: "var(--text-primary)",
              }}
            />
            <InkTooltip label="~0.5 Ink per edit" position="top">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSubmit}
              disabled={loading || !feedback.trim()}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: loading
                  ? "rgba(193,122,71,0.5)"
                  : "linear-gradient(135deg, #C17A47 0%, #A86230 100%)",
                color: "#F9F7F2",
                fontSize: 13,
                fontWeight: 600,
                cursor: loading || !feedback.trim() ? "not-allowed" : "pointer",
                fontFamily: "var(--font-manrope), sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 4,
                opacity: !feedback.trim() ? 0.5 : 1,
              }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </span>
              ) : (
                "Apply"
              )}
            </button>
            </InkTooltip>
          </div>
          {error && (
            <div style={{ fontSize: 12, color: "#dc2626", fontFamily: "var(--font-manrope), sans-serif" }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
