"use client";

interface EditorToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAutoLayout: () => void;
  onAddChapter: () => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onContinue: () => void;
  hasChapters: boolean;
}

export function EditorToolbar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAutoLayout,
  onAddChapter,
  saveStatus,
  onContinue,
  hasChapters,
}: EditorToolbarProps) {
  const btnStyle = (disabled?: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 8,
    background: disabled ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.7)",
    color: disabled ? "#c0b9ae" : "#191816",
    cursor: disabled ? "default" : "pointer",
    transition: "all 0.1s",
  });

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 20px",
      background: "rgba(255,255,255,0.6)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
      borderRadius: "12px 12px 0 0",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={onUndo} disabled={!canUndo} style={btnStyle(!canUndo)} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={onRedo} disabled={!canRedo} style={btnStyle(!canRedo)} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <div style={{ width: 1, height: 20, background: "rgba(0,0,0,0.1)", margin: "0 4px" }} />
        <button onClick={onAutoLayout} style={btnStyle()} title="Reset layout">
          Auto Layout
        </button>
        <button onClick={onAddChapter} style={btnStyle()} title="Add a new chapter">
          + Chapter
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: saveStatus === "saving" ? "#a0978a"
            : saveStatus === "saved" ? "#059669"
            : saveStatus === "error" ? "#dc2626"
            : "#c0b9ae",
        }}>
          {saveStatus === "saving" ? "Saving..."
            : saveStatus === "saved" ? "Saved"
            : saveStatus === "error" ? "Save failed"
            : ""}
        </span>
        {hasChapters && (
          <button
            onClick={onContinue}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 700,
              border: "none",
              borderRadius: 10,
              background: "#191816",
              color: "white",
              cursor: "pointer",
            }}
          >
            Continue to Generate
          </button>
        )}
      </div>
    </div>
  );
}
