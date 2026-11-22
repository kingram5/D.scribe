"use client";

import { useEffect, useState } from "react";
import { PLAN_99, PLAN_99_TIER, TIER_LABELS } from "@/lib/tiers";

// Shown under the single $99 card (NEXT_PUBLIC_PLAN_99) to people who already
// pay. The card says "$99", and a subscriber on an older plan or an older
// price must not read that as their own bill: they keep what they have until
// they choose to switch. Signed-out and free visitors see nothing.
//
// Reads the same /api/ink the plan button reads. It only knows the tier, not
// the price, so it never states what a Premium subscriber pays: someone who
// joined at $100 and someone who joined at $99 are both on the premium tier.

export function plan99NoteText(currentTier: string): string | null {
  if (currentTier === "starter" || currentTier === "pro") {
    const name = TIER_LABELS[currentTier] ?? currentTier;
    return `You are on the ${name} plan. It stays exactly as it is, at the price you pay today, for as long as you keep it. Switching moves you to ${PLAN_99.name} at $${PLAN_99.price}/month and bills the difference now.`;
  }
  if (currentTier === PLAN_99_TIER) {
    return `You are on ${PLAN_99.name}. Your price stays what you signed up at. See "Payment details and invoices" below for your bill.`;
  }
  return null;
}

export default function Plan99Note() {
  const [tier, setTier] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ink")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.tier) setTier(String(d.tier)); })
      .catch(() => null);
    const onChange = (e: Event) => setTier((e as CustomEvent<string>).detail);
    window.addEventListener("dscribe:plan", onChange);
    return () => { alive = false; window.removeEventListener("dscribe:plan", onChange); };
  }, []);

  const text = tier ? plan99NoteText(tier) : null;
  if (!text) return null;
  return (
    <p
      style={{
        margin: "14px 0 0",
        fontFamily: "var(--font-inter), var(--font-manrope), sans-serif",
        fontSize: 12.5,
        lineHeight: 1.6,
        color: "#A89F94",
        textAlign: "center",
      }}
    >
      {text}
    </p>
  );
}
