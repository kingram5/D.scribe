"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawNext = searchParams.get("next") || "/dashboard";
  // Validate redirect: must be a relative path, not a protocol-relative URL
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const authError = searchParams.get("error");
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createBrowserClient();

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #F4F1E8 0%, #EDE8DC 100%)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        padding: 48,
        background: "#FFFFFF",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(44,36,25,0.08)",
        borderRadius: 20,
        boxShadow: "0 24px 64px rgba(0,0,0,0.06)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: "#2C2419", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-lora), serif", fontSize: 18, fontWeight: 500, color: "#F4F1E8" }}>D.</span>
          </div>
          <span style={{ fontFamily: "var(--font-manrope), sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#2C2419" }}>
            scribe
          </span>
        </div>

        <h1 style={{
          fontFamily: "var(--font-manrope), sans-serif",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "#2C2419",
          marginBottom: 8,
        }}>
          Dictate the draft.<br /><span style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 400, color: "#7A7358" }}>Let AI master the manuscript.</span>
        </h1>
        <p style={{
          fontSize: 15,
          color: "#7A7358",
          lineHeight: 1.6,
          marginBottom: 32,
        }}>
          Upload sermons, keynotes, or podcast episodes — and let AI ghostwrite your manuscript in your voice.
        </p>

        {authError && (
          <div style={{
            padding: "10px 14px",
            background: "rgba(193,122,71,0.1)",
            border: "1px solid rgba(193,122,71,0.2)",
            borderRadius: 8,
            fontSize: 13,
            color: "#D98B58",
            marginBottom: 16,
          }}>
            Sign in failed. Please try again.
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "14px 20px",
            fontSize: 15,
            fontWeight: 600,
            border: "1px solid rgba(44,36,25,0.12)",
            borderRadius: 12,
            background: "rgba(44,36,25,0.04)",
            color: "#2C2419",
            cursor: loading ? "wait" : "pointer",
            transition: "all 0.15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 2.58Z" fill="#EA4335"/>
          </svg>
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>

        <p style={{
          fontSize: 12,
          color: "#A39B7D",
          textAlign: "center",
          marginTop: 24,
          lineHeight: 1.5,
        }}>
          10 free credits to start. No credit card required.
        </p>
        <p style={{
          fontSize: 11,
          color: "#A39B7D",
          textAlign: "center",
          marginTop: 8,
          fontStyle: "italic",
          fontFamily: "var(--font-lora), serif",
        }}>
          Used by professional speakers and thought leaders worldwide
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
