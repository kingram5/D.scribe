"use client";
import Link from "next/link";
import UserMenu from "./UserMenu";

interface OsBarProps {
  rightSlot?: React.ReactNode;
  centerSlot?: React.ReactNode;
}

export default function OsBar({ rightSlot, centerSlot }: OsBarProps) {
  return (
    <div style={{
      position: "fixed",
      top: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 100,
      borderRadius: 100,
      background: "rgba(255,255,255,0.6)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.9)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "10px 20px",
      minWidth: 480,
    }}>
      {/* Left: Logo + Brand */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "#191816", flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="#191816" strokeWidth="1.5"/>
          <path d="M10 4 A6 6 0 0 1 16 10" stroke="#191816" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.02em" }}>Book Builder</span>
      </Link>

      {/* Center */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        {centerSlot}
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Link href="/project/new" className="nodum-btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }}>
          New Project
        </Link>
        {rightSlot}
        <UserMenu />
      </div>
    </div>
  );
}
