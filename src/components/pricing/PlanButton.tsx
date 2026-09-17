"use client";

import { useEffect, useState } from "react";

// The plan controls on /pricing, aware of what the visitor already pays for.
//
// Signed out or on a free account, a card sends them to checkout. A paying
// subscriber sees their own plan marked, switches plan in place (never a second
// checkout, which would open a second subscription and bill twice), and can
// cancel from the same page — the reason "Manage Plan" now lands here instead of
// dropping people straight into Stripe.

export { planLabel, type Tier } from "@/lib/plan-label";
import { planLabel } from "@/lib/plan-label";
import type { Tier } from "@/lib/plan-label";

// One request per page load, shared by all three cards and the cancel row.
let inkPromise: Promise<{ tier: string } | null> | null = null;
function fetchPlan() {
  if (!inkPromise) {
    inkPromise = fetch("/api/ink")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return inkPromise;
}

type Plan = { tier: string; loaded: boolean };

function usePlan(): [Plan, (t: string) => void] {
  const [plan, setPlan] = useState<Plan>({ tier: "free", loaded: false });
  useEffect(() => {
    let alive = true;
    fetchPlan().then((d) => { if (alive) setPlan({ tier: d?.tier ?? "free", loaded: true }); });
    const onChange = (e: Event) => setPlan({ tier: (e as CustomEvent<string>).detail, loaded: true });
    window.addEventListener("dscribe:plan", onChange);
    return () => { alive = false; window.removeEventListener("dscribe:plan", onChange); };
  }, []);
  return [plan, (t: string) => {
    inkPromise = Promise.resolve({ tier: t });
    window.dispatchEvent(new CustomEvent("dscribe:plan", { detail: t }));
  }];
}

export default function PlanButton({ tier, highlight }: { tier: Tier; highlight: boolean }) {
  const [plan, announce] = usePlan();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCurrent = plan.loaded && plan.tier === tier;
  const paying = plan.loaded && plan.tier !== "free";

  async function choose() {
    if (isCurrent) return;
    setBusy(true);
    setError(null);
    try {
      if (paying) {
        const res = await fetch("/api/stripe/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.switched) {
          announce(tier);
          setBusy(false);
          return;
        }
        if (!data.needsCheckout) {
          setError(typeof data.error === "string" ? data.error : "Could not change plan.");
          setBusy(false);
          return;
        }
        // Stripe says there is nothing to change: fall through to checkout.
      }
      window.location.assign(`/upgrade/${tier}`);
    } catch {
      setError("Could not change plan.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={choose}
        disabled={busy || isCurrent}
        aria-current={isCurrent ? "true" : undefined}
        style={{
          display: "block",
          width: "100%",
          textAlign: "center",
          padding: "13px 0",
          borderRadius: 12,
          background: isCurrent ? "rgba(249,247,242,0.06)" : highlight ? "#C17A47" : "rgba(249,247,242,0.08)",
          color: isCurrent ? "#A89F94" : highlight ? "#fff" : "#F9F7F2",
          fontFamily: "var(--font-manrope), sans-serif",
          fontSize: 14,
          fontWeight: 600,
          border: isCurrent ? "1px dashed rgba(249,247,242,0.25)" : highlight ? "none" : "1px solid rgba(249,247,242,0.15)",
          cursor: isCurrent ? "default" : busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Working…" : planLabel(tier, plan.tier, plan.loaded)}
      </button>
      {error && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#E58A7B", fontFamily: "var(--font-manrope), sans-serif", textAlign: "center" }}>
          {error}
        </p>
      )}
    </>
  );
}

/** Under the cards: cancel, and the payment-details link into Stripe. */
export function PlanFooter() {
  const [plan] = usePlan();
  const [busy, setBusy] = useState<null | "cancel" | "portal">(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!plan.loaded || plan.tier === "free") return null;

  async function cancel() {
    setBusy("cancel");
    setError(null);
    const res = await fetch("/api/stripe/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.canceled) {
      const until = data.activeUntil
        ? new Date(data.activeUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
        : null;
      setDone(until ? `Cancelled. Your plan stays active until ${until}.` : "Cancelled. Your plan stays active until the end of the period you paid for.");
      setConfirming(false);
    } else {
      setError(typeof data.error === "string" ? data.error : "Could not cancel. Please try again.");
    }
    setBusy(null);
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    const res = await fetch("/api/stripe/portal", { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.url) { window.location.href = data.url; return; }
    setError(typeof data.error === "string" ? data.error : "Could not open billing.");
    setBusy(null);
  }

  const link: React.CSSProperties = {
    background: "none", border: 0, padding: 0, cursor: "pointer",
    fontFamily: "var(--font-manrope), sans-serif", fontSize: 13, color: "#A89F94", textDecoration: "underline",
  };

  return (
    <div style={{ marginTop: 28, textAlign: "center", fontFamily: "var(--font-manrope), sans-serif" }}>
      {done ? (
        <p style={{ margin: 0, fontSize: 13, color: "#A89F94" }}>{done}</p>
      ) : confirming ? (
        <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#A89F94" }}>Cancel your plan at the end of this billing period?</span>
          <button type="button" onClick={cancel} disabled={busy === "cancel"} style={{ ...link, color: "#E58A7B" }}>
            {busy === "cancel" ? "Cancelling…" : "Yes, cancel"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} style={link}>Keep my plan</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setConfirming(true)} style={link}>Cancel my plan</button>
          <button type="button" onClick={openPortal} disabled={busy === "portal"} style={link}>
            {busy === "portal" ? "Opening…" : "Payment details and invoices"}
          </button>
        </div>
      )}
      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#E58A7B" }}>{error}</p>}
    </div>
  );
}
