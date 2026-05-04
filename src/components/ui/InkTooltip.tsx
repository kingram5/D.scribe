"use client";
import { useState } from "react";

interface InkTooltipProps {
  label: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
}

export default function InkTooltip({ label, children, position = "top" }: InkTooltipProps) {
  const [visible, setVisible] = useState(false);

  const offset = position === "top" ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" };

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          style={{
            position: "absolute",
            ...offset,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(25,24,22,0.94)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid rgba(193,122,71,0.35)",
            borderRadius: 8,
            padding: "5px 11px",
            fontSize: 12,
            fontWeight: 600,
            color: "#C17A47",
            fontFamily: "var(--font-manrope), sans-serif",
            whiteSpace: "nowrap",
            zIndex: 999,
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            animation: "inkTipIn 0.1s ease-out",
          }}
        >
          <style>{`@keyframes inkTipIn { from { opacity:0; transform:translateX(-50%) translateY(${position === "top" ? "4px" : "-4px"}); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
          {/* Ink drop icon */}
          <svg width="9" height="11" viewBox="0 0 9 11" fill="none">
            <path d="M4.5 0 C4.5 0 0.5 5 0.5 7.5 a4 4 0 0 0 8 0 C8.5 5 4.5 0 4.5 0 Z" fill="#C17A47" />
          </svg>
          {label}
        </div>
      )}
    </div>
  );
}
