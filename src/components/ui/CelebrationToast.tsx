"use client";
import { useEffect } from "react";

interface CelebrationToastProps {
  message: string;
  show: boolean;
  onDone?: () => void;
}

export default function CelebrationToast({ message, show, onDone }: CelebrationToastProps) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      onDone?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 32,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 200,
      background: "#191816",
      color: "#FDFCF9",
      borderRadius: 100,
      padding: "14px 28px",
      fontFamily: "var(--font-manrope), sans-serif",
      fontSize: 14,
      fontWeight: 600,
      boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
      display: "flex",
      alignItems: "center",
      gap: 10,
      animation: "celebrationSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 18 }}>&#10024;</span>
      {message}
      <style>{`
        @keyframes celebrationSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
