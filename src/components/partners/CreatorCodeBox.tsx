"use client";
import { useEffect, useState } from "react";
import { readReferralName, REFERRAL_EVENT } from "./referral-cookie";
import { PARTNER_BONUS_INK, PARTNER_DISCOUNT_PERCENT } from "@/lib/partner-rules";

// "Have a creator code?" on /pricing. A valid code does what the creator's link
// does: the free Ink lands at sign-in and the 50% is pre-applied at checkout.
export function CreatorCodeBox() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => setApplied(readReferralName()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/partners/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ ok: false, text: res.error ?? "That code didn't work." });
      } else {
        setApplied(res.name);
        setMsg({ ok: true, text: `Applied. ${res.name}'s offer is waiting: ${PARTNER_BONUS_INK} free Ink for new accounts and ${PARTNER_DISCOUNT_PERCENT}% off your first month at checkout.` });
        window.dispatchEvent(new Event(REFERRAL_EVENT));
        // already signed in? claim now so the Ink lands before they check out
        fetch("/api/partners/claim", { method: "POST" }).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  const font = "var(--font-inter), var(--font-manrope), sans-serif";
  if (applied && !msg) {
    return (
      <p style={{ fontFamily: font, fontSize: 13, color: "#C8C0B4", marginTop: 14, textAlign: "center" }}>
        Creator offer from <strong style={{ color: "#F9F7F2" }}>{applied}</strong> is applied.
      </p>
    );
  }
  return (
    <div style={{ marginTop: 14, textAlign: "center", fontFamily: font }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ background: "none", border: "none", color: "#C17A47", fontSize: 13, textDecoration: "underline", cursor: "pointer", fontFamily: font }}
        >
          Have a creator code?
        </button>
      ) : (
        <form onSubmit={submit} style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CREATOR CODE"
            aria-label="Creator code"
            maxLength={24}
            autoFocus
            style={{ background: "rgba(249,247,242,0.06)", border: "1px solid rgba(249,247,242,0.18)", borderRadius: 8, color: "#F9F7F2", padding: "9px 12px", fontSize: 16, letterSpacing: "0.06em", fontFamily: font, width: 200 }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{ background: "#C17A47", color: "#1B150F", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: font, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Checking…" : "Apply"}
          </button>
        </form>
      )}
      {msg && (
        <p style={{ fontSize: 13, color: msg.ok ? "#C8C0B4" : "#E08A7A", marginTop: 10 }}>{msg.text}</p>
      )}
    </div>
  );
}
