"use client";

import { memo, useState, useRef, useCallback } from "react";
import type { Chapter } from "@/types";
import type { NoteColor } from "./layout";

interface ChapterNoteProps {
  chapter: Chapter;
  color: NoteColor;
  rotation: number;
  isDragging: boolean;
  keyPointCount: number;
  onEdit: (field: "title" | "summary", value: string) => void;
  onDelete: () => void;
  onAddKeyPoint: () => void;
}

function getBorderColor(color: NoteColor) {
  switch (color) {
    case "#fdf5c9": return "#e6d96c";
    case "#fbe0e0": return "#e8a0a0";
    case "#e0f2fe": return "#7ec8f0";
    case "#e6f4ea": return "#8cc89e";
  }
}

function ChapterNoteComponent({
  chapter,
  color,
  rotation,
  isDragging,
  keyPointCount,
  onEdit,
  onDelete,
  onAddKeyPoint,
}: ChapterNoteProps) {
  const [hovered, setHovered] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  const handleTitleBlur = useCallback(() => {
    if (titleRef.current) {
      const val = titleRef.current.textContent || "";
      if (val !== chapter.title) onEdit("title", val);
    }
  }, [chapter.title, onEdit]);

  const borderColor = getBorderColor(color);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 320,
        background: color,
        border: `3px solid ${borderColor}`,
        borderRadius: 4,
        padding: "20px 18px 14px",
        cursor: isDragging ? "grabbing" : "grab",
        filter: "url(#rough-edge)",
        boxShadow: isDragging
          ? "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)"
          : "0 4px 6px rgba(0,0,0,0.05), 2px 2px 0 rgba(0,0,0,0.02)",
        fontFamily: "'Kalam', cursive",
        position: "relative",
        overflow: "visible",
        transition: isDragging ? "none" : "box-shadow 0.2s",
        userSelect: "none",
      }}
    >
      {/* Emoji badge */}
      <div style={{
        position: "absolute",
        top: -16,
        left: 14,
        fontSize: 28,
        filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.1))",
      }}>
        📖
      </div>

      {/* Delete button */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#dc2626",
            border: "2px solid white",
            color: "white",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            zIndex: 100,
          }}
        >
          ×
        </button>
      )}

      {/* Chapter number */}
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(0,0,0,0.4)",
        marginBottom: 4,
        marginTop: 8,
      }}>
        Chapter {chapter.chapter_number}
      </div>

      {/* Editable title */}
      <div
        ref={titleRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={handleTitleBlur}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); titleRef.current?.blur(); } }}
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "rgba(0,0,0,0.8)",
          lineHeight: 1.3,
          outline: "none",
          cursor: "text",
          minHeight: 24,
        }}
      >
        {chapter.title || "Untitled"}
      </div>

      {/* Footer: key point count + add button */}
      <div style={{
        marginTop: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontSize: 11,
          color: "rgba(0,0,0,0.35)",
          fontStyle: "italic",
        }}>
          {keyPointCount} key point{keyPointCount !== 1 ? "s" : ""} ▾
        </span>
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddKeyPoint(); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              padding: "2px 10px",
              fontSize: 11,
              fontWeight: 700,
              border: "1px dashed rgba(0,0,0,0.25)",
              borderRadius: 4,
              background: "rgba(255,255,255,0.5)",
              color: "rgba(0,0,0,0.5)",
              cursor: "pointer",
              fontFamily: "'Kalam', cursive",
            }}
          >
            + key point
          </button>
        )}
      </div>
    </div>
  );
}

export const ChapterNote = memo(ChapterNoteComponent);
