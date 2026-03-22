"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[D.scribe] App error boundary caught:", error);
  }, [error]);

  return (
    <div
      style={{
        position: "relative",
        zIndex: 10,
        minHeight: "100vh",
        paddingTop: 88,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "88px 24px 40px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          padding: 48,
          background: "rgba(253,251,246,0.55)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.8)",
          borderRadius: 20,
          boxShadow:
            "0 20px 40px -10px rgba(0,0,0,0.06), inset 0 1px 1px 0 rgba(255,255,255,0.9)",
          textAlign: "center",
        }}
      >
        {/* D. scribe logo mark */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 6,
            background: "#1A1816",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 20,
              fontWeight: 500,
              color: "#FDFCF9",
            }}
          >
            D.
          </span>
        </div>

        <h1
          style={{
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 22,
            fontWeight: 700,
            color: "#191816",
            marginBottom: 8,
            letterSpacing: "-0.02em",
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 14,
            color: "#7a7369",
            lineHeight: 1.6,
            marginBottom: 32,
          }}
        >
          An unexpected error occurred on this page. Your work is safe — try
          again or head back to your dashboard.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={reset}
            className="nodum-btn"
            style={{ width: "100%", justifyContent: "center" }}
          >
            Try Again
          </button>

          <Link
            href="/dashboard"
            style={{
              display: "block",
              width: "100%",
              padding: "13px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#191816",
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(25,24,22,0.12)",
              borderRadius: 100,
              textDecoration: "none",
              transition: "background 0.15s",
              boxSizing: "border-box",
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
