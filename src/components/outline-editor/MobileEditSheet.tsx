"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface MobileEditSheetProps {
  open: boolean;
  label: string;
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

/**
 * Phone-only editor for a chapter title or key point. On a phone the in-place
 * contentEditable text on the sticky notes gives no cue that it is editable and iOS
 * does not reliably raise the keyboard for it (Kyle, 2026-09-21: "tapping on chapter
 * and key point cards doesn't give me any way to edit the text"). Tap the text, this
 * sheet slides up with a real textarea, Save writes it back through the same onEdit.
 */
export function MobileEditSheet({ open, label, value, placeholder, onSave, onClose }: MobileEditSheetProps) {
  const [draft, setDraft] = useState(value);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    // Focus after paint so iOS raises the keyboard from the tap gesture.
    const t = window.setTimeout(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 30);
    return () => window.clearTimeout(t);
  }, [open, value]);

  if (!open || typeof document === "undefined") return null;

  const changed = draft.trim() !== value.trim();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(25,24,22,0.45)", display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#fdf9ef",
          borderRadius: "18px 18px 0 0",
          padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
          boxShadow: "0 -8px 30px rgba(0,0,0,0.25)",
          fontFamily: "'Kalam', cursive",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)" }}>{label}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 20, lineHeight: 1, color: "rgba(0,0,0,0.5)", padding: 4 }}>×</button>
        </div>
        <textarea
          ref={areaRef}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (changed) onSave(draft.trim()); onClose(); }
            if (e.key === "Escape") onClose();
          }}
          rows={4}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "inherit",
            fontSize: 16, // 16px keeps iOS from zooming the page on focus
            lineHeight: 1.4,
            color: "rgba(0,0,0,0.8)",
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 10,
            padding: "10px 12px",
            resize: "none",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" onClick={onClose} style={{ padding: "10px 16px", minHeight: 44, borderRadius: 999, border: "1px solid rgba(0,0,0,0.15)", background: "transparent", color: "#191816", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}>Cancel</button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => { onSave(draft.trim()); onClose(); }}
            style={{ padding: "10px 20px", minHeight: 44, borderRadius: 999, border: "none", background: changed ? "#191816" : "#c9c4ba", color: "white", fontFamily: "inherit", fontSize: 14, fontWeight: 700 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
