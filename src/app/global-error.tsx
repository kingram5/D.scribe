"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[D.scribe] Root error boundary caught:", error);
    Sentry.captureException(error, { extra: { boundary: "root", digest: error.digest } });
    // Fire-and-forget structured log to server
    fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundary: "root",
        message: error.message,
        digest: error.digest,
        stack: error.stack,
      }),
    }).catch(() => {/* best-effort — ignore network failures */});
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FDFCF9 0%, #F4F1EB 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            padding: 48,
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.9)",
            borderRadius: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
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
              fontSize: 22,
              fontWeight: 700,
              color: "#1A1816",
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#7a7369",
              lineHeight: 1.6,
              marginBottom: 32,
            }}
          >
            An unexpected error occurred. Your work is safe — try reloading the
            page to continue.
          </p>

          <button
            onClick={reset}
            style={{
              width: "100%",
              padding: "13px 20px",
              fontSize: 14,
              fontWeight: 600,
              color: "#FDFCF9",
              background: "#1A1816",
              border: "none",
              borderRadius: 100,
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
