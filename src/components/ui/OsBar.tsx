"use client";
import Link from "next/link";
import { useState } from "react";
import UserMenu from "./UserMenu";
import InkBalanceMeter from "./InkBalanceMeter";

interface OsBarProps {
  rightSlot?: React.ReactNode;
  centerSlot?: React.ReactNode;
}

export default function OsBar({ rightSlot, centerSlot }: OsBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        borderRadius: 100,
        background: "var(--ds-card-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid var(--ds-card-border)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 20px",
        width: "calc(100% - 32px)",
        maxWidth: 720,
      }}>
        {/* Left: Logo + Brand */}
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--text-primary)", flexShrink: 0 }}>
          <div style={{ width: 24, height: 24, borderRadius: 4, background: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-lora), serif", fontSize: 14, fontWeight: 500, color: "var(--ds-paper)" }}>D.</span>
          </div>
          <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em" }}>scribe</span>
        </Link>

        {/* Center — hidden on mobile */}
        <div className="hidden-mobile" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          {centerSlot}
        </div>

        {/* Right — desktop */}
        <div className="hidden-mobile" style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <InkBalanceMeter />
          <Link href="/project/new" className="nodum-btn-ghost" style={{ fontSize: 12, padding: "6px 14px" }}>
            New Project
          </Link>
          {rightSlot}
          <UserMenu />
        </div>

        {/* Right — mobile hamburger */}
        <div className="show-mobile" style={{ marginLeft: "auto", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
          <UserMenu />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div style={{
          position: "fixed",
          top: 76,
          left: 16,
          right: 16,
          zIndex: 99,
          background: "var(--ds-card-bg)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--ds-card-border)",
          borderRadius: 20,
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {centerSlot && (
            <div style={{ padding: "8px 0", borderBottom: "1px solid var(--ds-card-border)", marginBottom: 4 }}>
              {centerSlot}
            </div>
          )}
          <div style={{ padding: "4px 2px" }}>
            <InkBalanceMeter />
          </div>
          <Link
            href="/project/new"
            className="nodum-btn"
            style={{ justifyContent: "center" }}
            onClick={() => setMobileOpen(false)}
          >
            New Project
          </Link>
          {rightSlot}
        </div>
      )}
    </>
  );
}
