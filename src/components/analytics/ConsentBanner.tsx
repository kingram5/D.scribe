"use client";

import { useEffect, useState } from "react";
import { readConsent, writeConsent } from "@/lib/consent";

/**
 * Cookie consent banner. Shows once until the visitor makes a choice; marketing
 * pixels stay off until consent is granted here. Copy mirrors docs/legal/consent-banner-copy.md.
 */
export function ConsentBanner() {
  const [show, setShow] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);

  useEffect(() => {
    // No prior choice (or a stale version) → ask. Reads client-side only, so SSR
    // and first client render both produce null → no hydration mismatch.
    if (readConsent() === null) setShow(true);
  }, []);

  if (!show) return null;

  const decide = (a: boolean, m: boolean) => {
    writeConsent({ analytics: a, marketing: m });
    setShow(false);
  };

  const card: React.CSSProperties = {
    position: "fixed",
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 9999,
    maxWidth: 760,
    margin: "0 auto",
    background: "rgba(255,255,255,0.98)",
    color: "#191816",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 14,
    boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
    padding: 20,
    fontFamily: "var(--font-manrope), system-ui, sans-serif",
    fontSize: 13.5,
    lineHeight: 1.5,
  };
  const btn = (primary?: boolean): React.CSSProperties => ({
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 9,
    cursor: "pointer",
    border: primary ? "none" : "1px solid rgba(0,0,0,0.15)",
    background: primary ? "#C17A47" : "transparent",
    color: primary ? "#fff" : "#191816",
  });

  return (
    <div role="dialog" aria-label="Cookie consent" style={card}>
      {!managing ? (
        <>
          <p style={{ margin: "0 0 14px" }}>
            We use cookies and similar technologies to keep D.scribe working, improve
            performance, and — if you allow — measure marketing. See our{" "}
            <a href="/legal/privacy" style={{ color: "#C17A47", textDecoration: "underline" }}>
              Privacy Policy
            </a>
            .
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
            <button style={btn()} onClick={() => setManaging(true)}>Manage preferences</button>
            <button style={btn()} onClick={() => decide(false, false)}>Reject non-essential</button>
            <button style={btn(true)} onClick={() => decide(true, true)}>Accept all</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15 }}>Cookie preferences</p>
          <ConsentRow
            title="Necessary"
            desc="Always on. Required for login, security, and basic site functions."
            checked
            locked
          />
          <ConsentRow
            title="Analytics"
            desc="Helps us understand how people use the product so we can improve it."
            checked={analytics}
            onChange={setAnalytics}
          />
          <ConsentRow
            title="Marketing"
            desc="Used to measure ad performance and attribution. May include TikTok and LinkedIn pixels."
            checked={marketing}
            onChange={setMarketing}
          />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <button style={btn()} onClick={() => decide(false, false)}>Reject non-essential</button>
            <button style={btn(true)} onClick={() => decide(analytics, marketing)}>Save preferences</button>
          </div>
        </>
      )}
    </div>
  );
}

function ConsentRow({
  title,
  desc,
  checked,
  onChange,
  locked,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <label style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid rgba(0,0,0,0.06)", cursor: locked ? "default" : "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <span>
        <span style={{ fontWeight: 600, display: "block" }}>{title}</span>
        <span style={{ color: "#7a7369", fontSize: 12.5 }}>{desc}</span>
      </span>
    </label>
  );
}
