"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { FIRST_TOUCH_KEY, MAX_DETAIL, shuffledOptions, type AttributionSource } from "@/lib/attribution";
import { readConsent } from "@/lib/consent";

// First-run question: "How did you hear about D.scribe?" (SEO/GEO plan Phase
// 3b, Kyle 2026-11-14). Sign-up is Google or a magic link with no form, so the
// question sits here instead: mounted in the signed-in app's layout, shown to
// an account that has no answer and no project yet, before the first book.
//
// Required: there is no skip or close; Continue needs a choice. It still fails
// soft: if the check or the save errors, the dialog stays closed or closes, so
// a database problem can never lock anyone out of the app. "Checked" is cached
// per browser session and per account (shared devices).

const serif = "var(--font-playfair), var(--font-lora), serif";
const sans = "var(--font-inter), var(--font-manrope), sans-serif";
const checkedKey = (uid: string) => `ds_attr_checked:${uid}`;

export function AttributionGate({ forceOpen = false }: { forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [uid, setUid] = useState<string | null>(null);
  const [options] = useState(() => shuffledOptions());
  const [choice, setChoice] = useState<AttributionSource | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (forceOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await createBrowserClient().auth.getSession();
        const id = data.session?.user?.id;
        if (!id || cancelled) return;
        setUid(id);
        try { if (sessionStorage.getItem(checkedKey(id))) return; } catch { /* storage blocked: just check */ }
        const res = await fetch("/api/attribution", { cache: "no-store" });
        const json = res.ok ? ((await res.json()) as { needed?: boolean }) : { needed: false };
        if (cancelled) return;
        if (json.needed) setOpen(true);
        else { try { sessionStorage.setItem(checkedKey(id), "1"); } catch { /* ignore */ } }
      } catch { /* fail soft: never show on error */ }
    })();
    return () => { cancelled = true; };
  }, [forceOpen]);

  useEffect(() => { if (open) headingRef.current?.focus(); }, [open]);

  if (!open) return null;

  const finish = (stored: boolean) => {
    try {
      if (uid) sessionStorage.setItem(checkedKey(uid), "1");
      if (stored) localStorage.removeItem(FIRST_TOUCH_KEY);
    } catch { /* ignore */ }
    setOpen(false);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!choice || busy) return;
    setBusy(true);
    setErr(null);
    let passive: unknown = null;
    try {
      if (readConsent()?.analytics !== false) passive = localStorage.getItem(FIRST_TOUCH_KEY);
    } catch { passive = null; }
    try {
      const res = await fetch("/api/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: choice, detail: choice === "other" ? detail : undefined, passive }),
      });
      if (res.status === 400) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Please choose an answer.");
        setBusy(false);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { stored?: boolean };
      finish(!!j.stored);
    } catch {
      finish(false); // network trouble: let them in rather than trap them
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10050,
        background: "rgba(20,15,10,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-attr-title"
        aria-describedby="ds-attr-sub"
        onSubmit={submit}
        style={{
          width: "min(100%, 520px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxSizing: "border-box",
          background: "#2C2419", color: "#F9F7F2",
          border: "1px solid rgba(193,122,71,0.45)", borderRadius: 16,
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)", padding: "24px 22px 0",
          fontFamily: sans,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#C17A47" }}>
          One quick question
        </p>
        <h2 id="ds-attr-title" ref={headingRef} tabIndex={-1} style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 26, lineHeight: 1.2, margin: "8px 0 6px", outline: "none" }}>
          How did you hear about D.scribe?
        </h2>
        <p id="ds-attr-sub" style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6, color: "#A89F94" }}>
          Pick the one that fits best. It tells us where people like you find us.
        </p>

        {/* Two columns when there is room, one on a phone. Order is shuffled; Other stays last. */}
        <div role="radiogroup" aria-labelledby="ds-attr-title" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {options.map((o) => {
            const selected = choice === o.value;
            return (
              <label
                key={o.value}
                style={{
                  display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "8px 12px", boxSizing: "border-box",
                  borderRadius: 10, cursor: "pointer", fontSize: 15,
                  background: selected ? "rgba(193,122,71,0.16)" : "rgba(249,247,242,0.04)",
                  border: `1px solid ${selected ? "rgba(193,122,71,0.75)" : "rgba(249,247,242,0.12)"}`,
                }}
              >
                <input
                  type="radio"
                  name="ds-attr-source"
                  value={o.value}
                  checked={selected}
                  onChange={() => { setChoice(o.value); setErr(null); }}
                  style={{ accentColor: "#C17A47", width: 18, height: 18, margin: 0, flexShrink: 0 }}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>

        {choice === "other" && (
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, MAX_DETAIL))}
            maxLength={MAX_DETAIL}
            placeholder="Where did you hear about us? (optional)"
            aria-label="Where did you hear about us?"
            autoFocus
            style={{
              marginTop: 10, width: "100%", boxSizing: "border-box", fontSize: 16, fontFamily: sans,
              background: "rgba(249,247,242,0.06)", color: "#F9F7F2",
              border: "1px solid rgba(249,247,242,0.2)", borderRadius: 10, padding: "10px 12px",
            }}
          />
        )}

        {/* Sticky so Continue stays on screen while the list scrolls on a phone. */}
        <div style={{ position: "sticky", bottom: 0, background: "#2C2419", padding: "4px 0 20px", marginTop: 4 }}>
        {err && <p role="alert" style={{ margin: "12px 0 0", fontSize: 14, color: "#F0A878" }}>{err}</p>}

        <button
          type="submit"
          disabled={!choice || busy}
          style={{
            marginTop: 16, width: "100%", minHeight: 48, borderRadius: 999, border: "none",
            background: choice ? "#C17A47" : "rgba(193,122,71,0.35)", color: "#1B150F",
            fontSize: 15, fontWeight: 700, fontFamily: sans, cursor: choice && !busy ? "pointer" : "default",
          }}
        >
          {busy ? "Saving…" : "Continue"}
        </button>
        </div>
      </form>
    </div>
  );
}
