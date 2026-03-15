"use client";
import Link from "next/link";

interface StepBlockProps {
  num: string;
  title: string;
  desc: string;
  status?: "active" | "complete" | "locked";
  href?: string;
  onClick?: () => void;
}

export default function StepBlock({ num, title, desc, status, href, onClick }: StepBlockProps) {
  const isLocked = status === "locked";
  const isActive = status === "active";
  const isComplete = status === "complete";

  const style: React.CSSProperties = {
    padding: 16,
    borderRadius: "var(--radius-md)",
    background: isActive ? "rgba(255,255,255,0.7)" : isComplete ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.4)",
    border: `1px solid ${isActive ? "white" : "rgba(255,255,255,0.6)"}`,
    opacity: isLocked ? 0.5 : 1,
    pointerEvents: isLocked ? "none" : "auto",
    cursor: isLocked ? "not-allowed" : "pointer",
    display: "block",
    textDecoration: "none",
    color: "inherit",
    transition: "background 0.2s, border-color 0.2s, transform 0.15s",
    marginBottom: 8,
  };

  const inner = (
    <>
      <div style={{ fontSize: 10, fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600, color: "#a0978a", letterSpacing: "0.1em", marginBottom: 6 }}>
        {isComplete ? "✓ " : ""}{num}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#191816", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#7a7369" }}>{desc}</div>
    </>
  );

  if (href && !isLocked) {
    return <Link href={href} className="nodum-step-block" style={style}>{inner}</Link>;
  }

  return (
    <div className="nodum-step-block" style={style} onClick={onClick}>
      {inner}
    </div>
  );
}
