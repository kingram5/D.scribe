"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import InkMeter from "./InkMeter";
import TtsMeter from "./TtsMeter";

export default function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (loading || !user) return null;

  const initials = user.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
    : user.email?.[0]?.toUpperCase() || "?";

  const avatar = user.user_metadata?.avatar_url;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1.5px solid rgba(0,0,0,0.1)",
          background: avatar ? `url(${avatar}) center/cover` : "#191816",
          color: avatar ? "transparent" : "white",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!avatar && initials}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: 40,
          right: 0,
          width: 220,
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
          padding: 8,
          zIndex: 200,
        }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#191816" }}>
              {user.user_metadata?.full_name || "User"}
            </div>
            <div style={{ fontSize: 11, color: "#a0978a", marginTop: 2 }}>
              {user.email}
            </div>
          </div>
          <InkMeter />
          <TtsMeter />
          <a
            href="/settings"
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              color: "#191816",
              borderRadius: 8,
              textAlign: "left",
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            Settings &amp; billing
          </a>
          <button
            onClick={signOut}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              color: "#dc2626",
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
