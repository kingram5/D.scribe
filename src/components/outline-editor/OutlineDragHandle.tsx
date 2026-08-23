"use client";

interface OutlineDragHandleProps {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  compact?: boolean;
}

export function OutlineDragHandle({ onTouchStart, onTouchEnd, compact }: OutlineDragHandleProps) {
  return (
    <div
      className={`ds-outline-drag-handle${compact ? " ds-outline-drag-handle--compact" : ""}`}
      aria-label="Hold to drag and reorder"
      onTouchStart={(e) => {
        e.stopPropagation();
        onTouchStart(e);
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        onTouchEnd(e);
      }}
      onTouchCancel={(e) => {
        e.stopPropagation();
        onTouchEnd(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span aria-hidden>⠿</span>
    </div>
  );
}
