"use client";

import type { NoteColor } from "./layout";

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
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      alignItems: "center",
      // Buttons no longer shrink, so the row has to wrap on a narrow screen instead of
      // pushing past the viewport edge.
      flexWrap: "wrap",
      justifyContent: "center",
      maxWidth: "calc(100vw - 24px)",
      gap: 8,
      padding: "10px 20px",
      background: "rgba(255,255,255,0.7)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      zIndex: 100,
      filter: "url(#rough-edge)",
      fontFamily: "'Kalam', cursive",
    }}>
      {/* Undo/Redo */}
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

      <div style={{ width: 1, height: 20, background: "rgba(0,0,0,0.1)", margin: "0 4px" }} />

      {/* Color add buttons */}
      {COLOR_OPTIONS.map((opt) => (
        <button
          key={opt.color}
          onClick={() => onAddChapter(opt.color)}
          title={`Add ${opt.label} chapter`}
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: "50%",
            background: opt.color,
            border: `2px solid ${opt.border}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            transition: "transform 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          +
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: "rgba(0,0,0,0.1)", margin: "0 4px" }} />

      {/* Save status */}
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: saveStatus === "saving" ? "#a0978a"
          : saveStatus === "saved" ? "#059669"
          : saveStatus === "error" ? "#dc2626"
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
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 700,
            border: "none",
            borderRadius: 999,
            background: isSaving ? "#9a9890" : "#191816",
            color: "white",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontFamily: "'Kalam', cursive",
            transition: "background 0.15s",
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
    // The toolbar is a flex row that runs out of width on a phone; without this the
    // declared 32px collapses to ~18px, under the WCAG 2.5.8 24x24 minimum.
    flexShrink: 0,
    borderRadius: "50%",
    background: disabled ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.8)",
    border: "1px solid rgba(0,0,0,0.1)",
    color: disabled ? "#c0b9ae" : "#191816",
    cursor: disabled ? "default" : "pointer",
    fontSize: 16,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.1s",
  };
}
