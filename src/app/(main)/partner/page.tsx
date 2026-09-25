"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUsd, PAYOUT_MINIMUM_CENTS } from "@/lib/partner-rules";

type Me = {
  partner: { name: string; status: string; code: string | null; link: string | null; commission_rate: number; commission_months: number } | null;
  stats?: { clicks: number; signups: number; paying: number; held_cents: number; payable_cents: number; paid_cents: number };
  payouts?: { amount_cents: number; status: string; created_at: string }[];
  payouts_ready?: boolean;
  payouts_started?: boolean;
};

const serif = "var(--font-playfair), var(--font-lora), serif";
const sans = "var(--font-inter), var(--font-manrope), sans-serif";
const card: React.CSSProperties = { border: "1px solid rgba(249,247,242,0.1)", borderRadius: 14, padding: "18px 20px", background: "rgba(249,247,242,0.03)" };

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      style={{ background: "rgba(193,122,71,0.15)", color: "#F0A878", border: "1px solid rgba(193,122,71,0.4)", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontFamily: sans, cursor: "pointer", flexShrink: 0 }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function PartnerPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetch("/api/partners/me").then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(setMe).catch(() => setErr("Couldn't load your partner page."));
  }, []);

  async function setupPayouts() {
    setConnecting(true);
    setErr(null);
    try {
      const r = await fetch("/api/partners/connect", { method: "POST" });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error);
      window.location.href = res.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payout setup isn't available right now.");
      setConnecting(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ height: "100%", overflowY: "auto", background: "#2C2419", color: "#F9F7F2" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>{children}</div>
    </div>
  );

  if (!me && !err) return shell(<p style={{ fontFamily: sans, color: "#C8C0B4" }}>Loading…</p>);
  if (!me?.partner) {
    return shell(
      <>
        <h1 style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 34 }}>Partner program</h1>
        <p style={{ fontFamily: sans, color: "#C8C0B4", fontSize: 16, lineHeight: 1.6 }}>
          {err ?? "This account isn't set up as a D.scribe partner. If you were approved, sign in with the email you applied with."}
        </p>
        <Link href="/partners" style={{ color: "#C17A47", fontFamily: sans }}>About the partner program</Link>
      </>,
    );
  }

  const p = me.partner;
  const s = me.stats!;
  return shell(
    <>
      <p style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C17A47", margin: 0 }}>Partner</p>
      <h1 style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 36, margin: "6px 0 4px" }}>{p.name}</h1>
      {p.status === "paused" && (
        <p style={{ fontFamily: sans, color: "#E0B07A", fontSize: 14 }}>Your partnership is paused, so your link and code aren&apos;t giving out the offer right now. Earnings you already made still pay out.</p>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {p.link && (
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: sans, fontSize: 12, color: "#7A7358", textTransform: "uppercase", letterSpacing: "0.06em" }}>Your link</div>
              <div style={{ fontFamily: sans, fontSize: 16, wordBreak: "break-all" }}>{p.link}</div>
            </div>
            <Copy text={p.link} />
          </div>
        )}
        {p.code && (
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 12, color: "#7A7358", textTransform: "uppercase", letterSpacing: "0.06em" }}>Your code</div>
              <div style={{ fontFamily: sans, fontSize: 18, letterSpacing: "0.06em" }}>{p.code}</div>
            </div>
            <Copy text={p.code} />
          </div>
        )}
      </div>
      <p style={{ fontFamily: sans, fontSize: 14, color: "#C8C0B4", lineHeight: 1.6, marginTop: 14 }}>
        People who use your link or code get 50 free Ink and 50% off their first month. You earn {Math.round(p.commission_rate * 100)}% of their plan payments for {p.commission_months} months.
        Always mention it&apos;s a partnership when you share it (#ad or &quot;I earn a commission&quot;).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 28 }}>
        {[
          ["Link visits", String(s.clicks)],
          ["Sign-ups", String(s.signups)],
          ["Paying", String(s.paying)],
          ["Clearing (30-day hold)", formatUsd(s.held_cents)],
          ["Ready to pay", formatUsd(s.payable_cents)],
          ["Paid to you", formatUsd(s.paid_cents)],
        ].map(([k, v]) => (
          <div key={k} style={card}>
            <div style={{ fontFamily: sans, fontSize: 12, color: "#7A7358" }}>{k}</div>
            <div style={{ fontFamily: serif, fontSize: 26, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: 28 }}>
        <div style={{ fontFamily: serif, fontSize: 21 }}>Payouts</div>
        <p style={{ fontFamily: sans, fontSize: 14, color: "#C8C0B4", lineHeight: 1.6 }}>
          {me.payouts_ready
            ? `You're set up. Payouts go out monthly once you have ${formatUsd(PAYOUT_MINIMUM_CENTS)} ready.`
            : "Set up a Stripe payout account so we can pay you. Your bank and tax details go to Stripe, never to us."}
        </p>
        {!me.payouts_ready && (
          <button
            type="button"
            onClick={setupPayouts}
            disabled={connecting}
            style={{ background: "#C17A47", color: "#1B150F", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 15, fontWeight: 600, fontFamily: sans, cursor: connecting ? "default" : "pointer", opacity: connecting ? 0.7 : 1 }}
          >
            {connecting ? "Opening Stripe…" : me.payouts_started ? "Finish payout setup" : "Set up payouts"}
          </button>
        )}
        {err && <p style={{ fontFamily: sans, fontSize: 14, color: "#E08A7A" }}>{err}</p>}
        {(me.payouts ?? []).length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", fontFamily: sans, fontSize: 14, color: "#C8C0B4" }}>
            {me.payouts!.map((po) => (
              <li key={po.created_at} style={{ padding: "6px 0", borderTop: "1px solid rgba(249,247,242,0.06)" }}>
                {new Date(po.created_at).toLocaleDateString()} · {formatUsd(po.amount_cents)} · {po.status === "released" ? "sent" : "failed, we'll retry"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ fontFamily: sans, fontSize: 13, color: "#7A7358", marginTop: 24 }}>
        <Link href="/legal/partners" style={{ color: "#C17A47" }}>Partner terms</Link>
      </p>
    </>,
  );
}
