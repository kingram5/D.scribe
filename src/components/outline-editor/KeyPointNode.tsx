"use client";

import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { KeyPoint } from "@/types";

interface KeyPointNodeData {
  keyPoint: KeyPoint;
  chapterId: string;
  label: string;
  summary?: string;
  onEdit?: (field: "title" | "summary", value: string) => void;
  onDelete?: () => void;
  isDropTarget?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  [key: string]: unknown;
}

function KeyPointNodeComponent({ data }: NodeProps) {
  const { keyPoint, onEdit, onDelete, isDropTarget } = data as unknown as KeyPointNodeData;
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Truncate title to ~8 words
  const shortTitle = (keyPoint?.title || "").split(" ").slice(0, 8).join(" ");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 200,
        minHeight: 48,
        padding: "10px 14px",
        background: isDropTarget ? "#d4a574" : "rgba(180,83,9,0.08)",
        borderRadius: 12,
        border: isDropTarget
          ? "2px solid #b45309"
          : expanded
            ? "1.5px solid rgba(180,83,9,0.3)"
            : "1.5px solid rgba(180,83,9,0.15)",
        cursor: "grab",
        transition: "all 0.15s",
        position: "relative",
        boxShadow: isDropTarget
          ? "0 0 16px rgba(180,83,9,0.25)"
          : "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "#b45309", width: 6, height: 6 }} />

      {/* Delete button */}
      {hovered && onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position: "absolute",
            top: -6,
            right: -6,
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
          }}
        >
          x
        </button>
      )}

      {/* Title */}
      {editingTitle ? (
        <input
          defaultValue={keyPoint?.title || ""}
          autoFocus
          onBlur={(e) => {
            setEditingTitle(false);
            if (onEdit && e.target.value !== keyPoint?.title) {
              onEdit("title", e.target.value);
            }
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          style={{
            width: "100%",
            background: "rgba(0,0,0,0.05)",
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: 6,
            padding: "2px 6px",
            color: "#191816",
            fontSize: 12,
            fontWeight: 600,
            outline: "none",
          }}
        />
      ) : (
        <div
          onClick={() => setExpanded(!expanded)}
          onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#191816",
            lineHeight: 1.3,
            cursor: "pointer",
          }}
        >
          {shortTitle}
          <span style={{ fontSize: 10, color: "#a0978a", marginLeft: 4 }}>
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      )}

      {/* Expanded summary */}
      {expanded && (
        <div style={{ marginTop: 8 }}>
          {editingSummary ? (
            <textarea
              defaultValue={keyPoint?.summary || ""}
              autoFocus
              onBlur={(e) => {
                setEditingSummary(false);
                if (onEdit && e.target.value !== keyPoint?.summary) {
                  onEdit("summary", e.target.value);
                }
              }}
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.05)",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 6,
                padding: "4px 6px",
                color: "#7a7369",
                fontSize: 11,
                outline: "none",
                resize: "vertical",
                minHeight: 40,
              }}
            />
          ) : (
            <div
              onDoubleClick={() => setEditingSummary(true)}
              style={{
                fontSize: 11,
                color: "#7a7369",
                lineHeight: 1.5,
                cursor: "text",
              }}
            >
              {keyPoint?.summary || "No summary yet. Double-click to add."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const KeyPointNode = memo(KeyPointNodeComponent);
