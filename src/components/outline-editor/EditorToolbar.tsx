"use client";

import type { NoteColor } from "./layout";

import React from "react";

interface EditorToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddChapter: (color: NoteColor) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  isDirty: boolean;
  onContinue: () => void;
  hasChapters: boolean;
}

const COLOR_OPTIONS: { color: NoteColor; label: string; border: string }[] = [
  { color: "#fdf5c9", label: "Yellow", border: "#e6d96c" },
  { color: "#fbe0e0", label: "Pink", border: "#e8a0a0" },
  { color: "#e0f2fe", label: "Blue", border: "#7ec8f0" },
  { color: "#e6f4ea", label: "Green", border: "#8cc89e" },
];

export function EditorToolbar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddChapter,
  saveStatus,
  isDirty,
  onContinue,
  hasChapters,
}: EditorToolbarProps) {
  const isSaving = isDirty || saveStatus === "saving";
  return (
    <div style={{
      position: "absolute",
      bottom: 20,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 24px",
      background: "rgba(26, 15, 10, 0.95)", // Dark leather/wood background
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      borderRadius: 8,
      border: "1px solid rgba(184, 134, 11, 0.4)", // Gold border
      boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      zIndex: 100,
      fontFamily: "'Kalam', cursive",
      color: "#fefcf5",
    }}>
      {/* Add Chapter (Post-it Style) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {COLOR_OPTIONS.map((opt) => (
          <button
            key={opt.color}
            onClick={() => onAddChapter(opt.color)}
            title={`Add ${opt.label} chapter`}
            style={{
              width: 32,
              height: 32,
              background: opt.color,
              border: `1px solid ${opt.border}`,
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              transition: "transform 0.1s, box-shadow 0.1s",
              color: "#1a0f0a",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.1)";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
            }}
          >
            +
          </button>
        ))}
        <span style={{ fontSize: 12, marginLeft: 4, opacity: 0.8 }}>Add Chapter</span>
      </div>

      <div style={{ width: 1, height: 24, background: "rgba(184, 134, 11, 0.2)", margin: "0 8px" }} />

      {/* Undo/Redo */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          style={btnStyle(!canUndo)}
        >
          ↩
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          style={btnStyle(!canRedo)}
        >
          ↪
        </button>
      </div>

      <div style={{ width: 1, height: 24, background: "rgba(184, 134, 11, 0.2)", margin: "0 8px" }} />

      {/* Save status */}
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: saveStatus === "saving" ? "#a0978a"
          : saveStatus === "saved" ? "#10b981"
          : saveStatus === "error" ? "#ef4444"
          : "transparent",
        minWidth: 50,
        textAlign: "center",
      }}>
        {saveStatus === "saving" ? "Saving..."
          : saveStatus === "saved" ? "Saved"
          : saveStatus === "error" ? "Failed"
          : "\u00A0"}
      </span>

      {/* Continue button */}
      {hasChapters && (
        <button
          onClick={onContinue}
          disabled={isSaving}
          style={{
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 700,
            border: "1px solid rgba(184, 134, 11, 0.5)",
            borderRadius: 4,
            background: isSaving ? "#4a3b35" : "#b8860b", // Gold/Brass button
            color: "white",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontFamily: "'Kalam', cursive",
            transition: "all 0.2s",
            boxShadow: isSaving ? "none" : "0 4px 12px rgba(0, 0, 0, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (!isSaving) {
              e.currentTarget.style.background = "#daa520";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSaving) {
              e.currentTarget.style.background = "#b8860b";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
        >
          {isSaving ? "Saving..." : "Continue to Generate"}
        </button>
      )}
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 4,
    background: disabled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
    border: "1px solid rgba(184, 134, 11, 0.3)",
    color: disabled ? "rgba(184, 134, 11, 0.2)" : "#b8860b",
    cursor: disabled ? "default" : "pointer",
    fontSize: 16,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.1s",
  };
}
