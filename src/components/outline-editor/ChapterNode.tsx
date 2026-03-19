"use client";

import { memo, useState, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { Chapter } from "@/types";

interface ChapterNodeData {
  chapter: Chapter;
  label: string;
  summary?: string;
  onEdit?: (field: "title" | "summary", value: string) => void;
  onDelete?: () => void;
  isDropTarget?: boolean;
  [key: string]: unknown;
}

function ChapterNodeComponent({ data }: NodeProps) {
  const { chapter, onEdit, onDelete, isDropTarget } = data as unknown as ChapterNodeData;
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [hovered, setHovered] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 240,
        minHeight: 80,
        padding: "12px 16px",
        background: isDropTarget ? "#2d2b28" : "#191816",
        borderRadius: 16,
        border: isDropTarget ? "2px solid #b45309" : "2px solid rgba(255,255,255,0.08)",
        color: "white",
        cursor: "grab",
        transition: "all 0.15s",
        position: "relative",
        boxShadow: isDropTarget
          ? "0 0 20px rgba(180,83,9,0.3)"
          : "0 4px 16px rgba(0,0,0,0.2)",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#a0978a", width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: "#a0978a", width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} id="kp" style={{ background: "#b45309", width: 8, height: 8 }} />

      {/* Delete button */}
      {hovered && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#dc2626",
            border: "2px solid #191816",
            color: "white",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          x
        </button>
      )}

      {/* Chapter number badge */}
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "#b45309",
        marginBottom: 4,
      }}>
        Chapter {chapter?.chapter_number}
      </div>

      {/* Title */}
      {editingTitle ? (
        <input
          ref={titleRef}
          defaultValue={chapter?.title || ""}
          autoFocus
          onBlur={(e) => {
            setEditingTitle(false);
            if (onEdit && e.target.value !== chapter?.title) {
              onEdit("title", e.target.value);
            }
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6,
            padding: "2px 6px",
            color: "white",
            fontSize: 13,
            fontWeight: 700,
            outline: "none",
          }}
        />
      ) : (
        <div
          onDoubleClick={() => setEditingTitle(true)}
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "white",
            lineHeight: 1.3,
            cursor: "text",
          }}
        >
          {chapter?.title || "Untitled"}
        </div>
      )}

      {/* Summary */}
      {editingSummary ? (
        <textarea
          ref={summaryRef}
          defaultValue={chapter?.summary || ""}
          autoFocus
          onBlur={(e) => {
            setEditingSummary(false);
            if (onEdit && e.target.value !== chapter?.summary) {
              onEdit("summary", e.target.value);
            }
          }}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6,
            padding: "2px 6px",
            color: "rgba(255,255,255,0.6)",
            fontSize: 10,
            outline: "none",
            resize: "vertical",
            minHeight: 30,
            marginTop: 4,
          }}
        />
      ) : (
        chapter?.summary && (
          <div
            onDoubleClick={() => setEditingSummary(true)}
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.5)",
              marginTop: 4,
              lineHeight: 1.4,
              cursor: "text",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {chapter.summary}
          </div>
        )
      )}
    </div>
  );
}

export const ChapterNode = memo(ChapterNodeComponent);
