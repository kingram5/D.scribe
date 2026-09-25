"use client";
import { useState } from "react";

const font = "var(--font-inter), var(--font-manrope), sans-serif";
const field: React.CSSProperties = {
  width: "100%",
  background: "rgba(249,247,242,0.05)",
  border: "1px solid rgba(249,247,242,0.16)",
  borderRadius: 10,
  color: "#F9F7F2",
  padding: "12px 14px",
  fontSize: 16,
  fontFamily: font,
  boxSizing: "border-box",
};
const label: React.CSSProperties = { display: "block", fontFamily: font, fontSize: 13, color: "#C8C0B4", marginBottom: 6 };

export function PartnerApplyForm() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("busy");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch("/api/partners/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(res.error ?? "Something went wrong. Try again in a minute.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div style={{ textAlign: "center", padding: "32px 20px", border: "1px solid rgba(193,122,71,0.4)", borderRadius: 14, background: "rgba(193,122,71,0.06)" }}>
        <p style={{ fontFamily: "var(--font-playfair), var(--font-lora), serif", fontStyle: "italic", fontSize: 26, color: "#F9F7F2", margin: 0 }}>Got it. Thank you.</p>
        <p style={{ fontFamily: font, fontSize: 15, color: "#C8C0B4", marginTop: 12 }}>
          We read every application ourselves. If it&apos;s a fit, you&apos;ll hear from us by email with your link and code.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <div>
        <label style={label} htmlFor="pa-name">Your name</label>
        <input id="pa-name" name="name" required maxLength={80} style={field} autoComplete="name" />
      </div>
      <div>
        <label style={label} htmlFor="pa-email">Email</label>
        <input id="pa-email" name="email" type="email" required maxLength={200} style={field} autoComplete="email" />
      </div>
      <div>
        <label style={label} htmlFor="pa-links">Where does your audience follow you? (links)</label>
        <textarea id="pa-links" name="links" required rows={2} maxLength={1000} style={{ ...field, resize: "vertical" }} placeholder="Instagram, YouTube, podcast, church or event site…" />
      </div>
      <div>
        <label style={label} htmlFor="pa-audience">Rough audience size</label>
        <input id="pa-audience" name="audience" maxLength={200} style={field} placeholder="e.g. 12k on Instagram, 800 on my email list" />
      </div>
      <div>
        <label style={label} htmlFor="pa-pitch">Who would you share D.scribe with, and why? (optional)</label>
        <textarea id="pa-pitch" name="pitch" rows={4} maxLength={1500} style={{ ...field, resize: "vertical" }} />
      </div>
      {/* honeypot: people never see this, bots fill it */}
      <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="pa-website">Company website</label>
        <input id="pa-website" name="company_website" tabIndex={-1} autoComplete="off" />
      </div>
      {error && <p style={{ fontFamily: font, fontSize: 14, color: "#E08A7A", margin: 0 }}>{error}</p>}
      <button
        type="submit"
        disabled={state === "busy"}
        style={{ background: "#C17A47", color: "#1B150F", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: font, cursor: state === "busy" ? "default" : "pointer", opacity: state === "busy" ? 0.7 : 1 }}
      >
        {state === "busy" ? "Sending…" : "Apply to partner"}
      </button>
      <p style={{ fontFamily: font, fontSize: 12, color: "#7A7358", margin: 0, textAlign: "center" }}>
        By applying you agree to the <a href="/legal/partners" style={{ color: "#C17A47" }}>partner terms</a>.
      </p>
    </form>
  );
}
