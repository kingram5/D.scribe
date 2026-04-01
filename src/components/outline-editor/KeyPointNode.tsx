"use client";

import React, { memo, useState, useRef, useCallback } from "react";
import type { KeyPoint } from "@/types";
import type { NoteColor } from "./layout";

interface KeyPointNoteProps {
  keyPoint: KeyPoint;
  color: NoteColor;
  rotation: number;
  isDragging: boolean;
  onEdit: (field: "title" | "summary", value: string) => void;
  onDelete: () => void;
}

function KeyPointNoteComponent({
  keyPoint,
  color,
  rotation,
  isDragging,
  onEdit,
  onDelete,
}: KeyPointNoteProps) {
  const [hovered, setHovered] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  const handleTitleBlur = useCallback(() => {
    if (titleRef.current) {
      const val = titleRef.current.textContent || "";
      if (val !== keyPoint.title) onEdit("title", val);
    }
  }, [keyPoint.title, onEdit]);

  // Slightly darker shade for the corner fold
  const foldColor = color === "#fdf5c9" ? "#f0e8a0"
    : color === "#fbe0e0" ? "#f0c0c0"
    : color === "#e0f2fe" ? "#b8ddf5"
    : "#c0ddc8";

  const borderColor = color === "#fdf5c9" ? "#e6d96c"
    : color === "#fbe0e0" ? "#e8a0a0"
    : color === "#e0f2fe" ? "#7ec8f0"
    : "#8cc89e";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 280,
        minHeight: 56,
        background: color,
        border: `2px solid ${borderColor}`,
        borderRadius: 3,
        padding: "12px 12px 12px 14px",
        cursor: isDragging ? "grabbing" : "grab",
        filter: "url(#rough-edge)",
        boxShadow: isDragging
          ? "0 30px 60px -12px rgba(0,0,0,0.25), 0 18px 36px -18px rgba(0,0,0,0.3)"
          : "0 4px 10px rgba(0,0,0,0.1), 1px 1px 0 rgba(0,0,0,0.02)",
        fontFamily: "'Kalam', cursive",
        position: "relative",
        overflow: "hidden",
        transition: isDragging ? "none" : "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        userSelect: "none",
        transform: isDragging ? "scale(1.05) rotate(2deg)" : `rotate(${rotation}deg)`,
      }}
    >
      {/* Subtle curl shadow */}
      <div style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        width: "30%",
        height: "10%",
        background: "linear-gradient(to top left, rgba(0,0,0,0.05), transparent)",
        pointerEvents: "none",
      }} />
      {/* Corner fold */}
      <div style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 0,
        height: 0,
        borderStyle: "solid",
        borderWidth: "0 24px 24px 0",
        borderColor: `transparent ${foldColor} transparent transparent`,
        filter: "drop-shadow(-1px 1px 1px rgba(0,0,0,0.1))",
      }} />
      <div style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 0,
        height: 0,
        borderStyle: "solid",
        borderWidth: "24px 0 0 24px",
        borderColor: `rgba(255,255,255,0.6) transparent transparent transparent`,
      }} />

      {/* Delete button */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -6,
            left: -6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#dc2626",
            border: "1.5px solid white",
            color: "white",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            zIndex: 10,
          }}
        >
          x
        </button>
      )}

      {/* Bullet + editable text */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span style={{
          fontSize: 14,
          color: "rgba(0,0,0,0.4)",
          lineHeight: 1.4,
          flexShrink: 0,
        }}>
          &#x2022;
        </span>
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); titleRef.current?.blur(); } }}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(0,0,0,0.7)",
            lineHeight: 1.4,
            outline: "none",
            cursor: "text",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-word",
          }}
        >
          {keyPoint.title || "New Key Point"}
        </div>
      </div>
    </div>
  );
}

export const KeyPointNote = memo(KeyPointNoteComponent);
