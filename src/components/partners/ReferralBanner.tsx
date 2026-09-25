"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readReferralName, REFERRAL_EVENT } from "./referral-cookie";
import { PARTNER_BONUS_INK, PARTNER_DISCOUNT_PERCENT } from "@/lib/partner-rules";

// A small floating note on the public pages for visitors who arrived through a
// creator's link or typed their code: who sent them and what they get. Floats at
// the bottom because the landing page's menu is fixed to the top; dismissible.
const SHOW_ON = new Set(["/", "/pricing", "/login", "/about"]);
const DISMISS_KEY = "ds_ref_note_closed";

export function ReferralBanner() {
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  // the cookie prompt sits at the bottom on a first visit; float above the fold until it's answered
  const [consentOpen, setConsentOpen] = useState(false);

  useEffect(() => {
    const read = () => setName(readReferralName());
    read();
    try { setClosed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* ignore */ }
    window.addEventListener(REFERRAL_EVENT, read);
    const check = () => setConsentOpen(!!document.querySelector('[role="dialog"][aria-label="Cookie consent"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { window.removeEventListener(REFERRAL_EVENT, read); mo.disconnect(); };
  }, []);

  if (!name || closed || !SHOW_ON.has(pathname ?? "")) return null;
  const close = () => {
    setClosed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        ...(consentOpen ? { top: 76 } : { bottom: 16 }),
        transform: "translateX(-50%)",
        zIndex: 900,
        width: "max-content",
        maxWidth: "calc(100vw - 24px)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#C17A47",
        color: "#1B150F",
        borderRadius: 999,
        padding: "9px 10px 9px 16px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
        fontSize: 14,
        lineHeight: 1.35,
      }}
    >
      <span>
        <strong>{name}</strong> sent you {PARTNER_BONUS_INK} free Ink + {PARTNER_DISCOUNT_PERCENT}% off your first month
      </span>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 999, border: "none", background: "rgba(27,21,15,0.15)", color: "#1B150F", fontSize: 16, lineHeight: 1, cursor: "pointer" }}
      >
        ×
      </button>
    </div>
  );
}
