"use client";
import { useEffect, useState } from "react";

// Runs once per browser session inside the signed-in app. Claims a creator's
// referral if their cookie is present (free Ink for new accounts) and links an
// approved creator's own account to their partner record. Shows a short note
// when free Ink actually lands.
const SESSION_KEY = "ds_partner_claimed";

export function ReferralClaimer() {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch { /* private mode: still try once */ }
    fetch("/api/partners/claim", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { claimed?: boolean; bonus?: number; partnerName?: string } | null) => {
        if (res?.claimed && (res.bonus ?? 0) > 0) {
          setNote(`${res.partnerName ?? "Your creator"} sent you ${res.bonus} free Ink. It's in your balance now.`);
          setTimeout(() => setNote(null), 8000);
        }
      })
      .catch(() => undefined);
  }, []);

  if (!note) return null;
  return (
    <div
      role="status"
      onClick={() => setNote(null)}
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 1000,
        maxWidth: "min(92vw, 440px)",
        background: "#2C2419",
        color: "#F9F7F2",
        border: "1px solid #C17A47",
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      {note}
    </div>
  );
}
