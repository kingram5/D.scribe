"use client";

import { useRef } from "react";

interface OutlineDragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  compact?: boolean;
}

export function OutlineDragHandle({ onPointerDown, onPointerUp, compact }: OutlineDragHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={handleRef}
      className={`ds-outline-drag-handle${compact ? " ds-outline-drag-handle--compact" : ""}`}
      aria-label="Drag to reorder"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        e.stopPropagation();
        e.preventDefault();
        handleRef.current?.setPointerCapture(e.pointerId);
        onPointerDown(e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (handleRef.current?.hasPointerCapture(e.pointerId)) {
          handleRef.current.releasePointerCapture(e.pointerId);
        }
        onPointerUp(e);
      }}
      onPointerCancel={(e) => {
        e.stopPropagation();
        if (handleRef.current?.hasPointerCapture(e.pointerId)) {
          handleRef.current.releasePointerCapture(e.pointerId);
        }
        onPointerUp(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span aria-hidden>⠿</span>
    </div>
  );
}
