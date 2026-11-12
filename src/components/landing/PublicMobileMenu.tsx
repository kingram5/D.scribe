"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

// Phone menu for the public pages (Kyle 2026-09-29: "real menu"). On a phone the
// header keeps the wordmark and Get Started; everything else (Pricing, About,
// Blog, Sign in, the legal pages) lives behind this 44px button. Desktop never
// sees it: the wrapper is hidden above 768px in globals.css.
//
// The panel is rendered into <body> only while open. The sticky headers use
// backdrop-filter, which would otherwise trap a position:fixed panel inside the
// header box, and a closed panel that isn't in the DOM can't hang off the edge.

const MAIN_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/vs", label: "Compare" },
  { href: "/login", label: "Sign in" },
];

const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/refunds", label: "Refunds" },
  { href: "/legal/acceptable-use", label: "Acceptable use" },
  { href: "/legal/dmca", label: "DMCA" },
];

const SANS = "var(--font-inter), var(--font-manrope), sans-serif";
const SERIF = "var(--font-playfair), var(--font-lora), serif";

export default function PublicMobileMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const btn = buttonRef.current;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      btn?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="ds-pubmenu">
      <button
        ref={buttonRef}
        type="button"
        className="ds-pubmenu-btn"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="ds-pubmenu-panel"
        onClick={() => setOpen(true)}
        style={{
          width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: "rgba(249,247,242,0.06)", border: "1px solid rgba(249,247,242,0.14)", borderRadius: 10,
          color: "#F9F7F2", cursor: "pointer", padding: 0, flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {mounted && open && createPortal(
        <div
          id="ds-pubmenu-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          onClick={close}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(20,15,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 0, left: 0, right: 0, maxHeight: "100dvh", overflowY: "auto",
              background: "#2C2419", borderBottom: "1px solid rgba(249,247,242,0.1)",
              padding: "12px 20px calc(24px + env(safe-area-inset-bottom))", boxSizing: "border-box",
              fontFamily: SANS,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 56 }}>
              <Link href="/" onClick={close} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, textDecoration: "none", minHeight: 44, alignSelf: "center", paddingTop: 8 }}>
                <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 28, lineHeight: 1, color: "#F0A878" }}>D.</span>
                <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 20, color: "#F9F7F2" }}>scribe</span>
              </Link>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close menu"
                onClick={close}
                style={{
                  width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "1px solid rgba(249,247,242,0.14)", borderRadius: 10,
                  color: "#F9F7F2", cursor: "pointer", padding: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <nav aria-label="Site" style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {MAIN_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  style={{
                    display: "flex", alignItems: "center", minHeight: 52, fontFamily: SERIF, fontSize: 22,
                    color: "#F9F7F2", textDecoration: "none", borderBottom: "1px solid rgba(249,247,242,0.08)",
                  }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            <Link
              href="/login"
              onClick={close}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, marginTop: 20,
                borderRadius: 9999, background: "#C17A47", color: "#F9F7F2", fontWeight: 600, fontSize: 16,
                textDecoration: "none",
              }}
            >
              Get Started <span aria-hidden="true" style={{ marginLeft: 6 }}>→</span>
            </Link>

            <nav aria-label="Legal" style={{ display: "flex", flexWrap: "wrap", gap: "0 16px", marginTop: 20 }}>
              {LEGAL_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  style={{ display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44, fontSize: 12.5, color: "#A89F94", textDecoration: "none" }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
