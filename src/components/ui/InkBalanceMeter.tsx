"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { INK_LIMITS } from "@/lib/tiers";
import AddMoreButton from "@/components/ui/AddMoreButton";

/** Persistent Ink balance in the app chrome: current balance over the monthly
 *  allotment with a thin burn line. Links to Settings for the full breakdown.
 *  Refreshes on mount and whenever the tab regains focus (cheap staleness fix
 *  without polling). */
export default function InkBalanceMeter() {
  const [balance, setBalance] = useState<number | null>(null);
  const [tier, setTier] = useState<string>("free");
  const [topupInk, setTopupInk] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/ink?history=false")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          if (typeof d.balance === "number") setBalance(d.balance);
          if (typeof d.tier === "string") setTier(d.tier);
          if (typeof d.topup_ink === "number") setTopupInk(d.topup_ink);
        })
        .catch(() => {});
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, []);

  if (balance == null) return null;

  const limit = INK_LIMITS[tier] ?? 10;
  const pct = Math.max(0, Math.min(1, balance / limit));
  const low = pct <= 0.15;
  const shown = balance >= 100 ? Math.round(balance) : Math.round(balance * 10) / 10;

  return (
    <div style={{ flexShrink: 0, minWidth: 76 }}>
      <Link
        href="/settings"
        title={`${shown} of ${limit} Ink remaining this period`}
        aria-label={`Ink balance: ${shown} of ${limit} remaining`}
        style={{ textDecoration: "none", display: "block" }}
      >
        <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span className="ds-label" style={{ fontSize: 9, color: "var(--text-tertiary)" }}>Ink</span>
          <span style={{
            fontFamily: "var(--font-lora), serif",
            fontSize: 14,
            color: low ? "#B3352C" : "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {shown.toLocaleString()}
          </span>
          <span className="ds-label" style={{ fontSize: 9, color: "var(--text-tertiary)" }}>/ {limit.toLocaleString()}</span>
          {topupInk > 0 && (
            <span className="ds-label" style={{ fontSize: 9, color: "#C17A47" }}>+ {topupInk.toLocaleString()} extra</span>
          )}
        </span>
        <span style={{ display: "block", height: 2, marginTop: 4, background: "var(--ds-input-border, rgba(44,36,25,0.12))", borderRadius: 1, overflow: "hidden" }}>
          <span style={{
            display: "block",
            height: "100%",
            width: `${pct * 100}%`,
            background: low ? "#B3352C" : "#C17A47",
            borderRadius: 1,
          }} />
        </span>
      </Link>
      <div style={{ marginTop: 4 }}>
        <AddMoreButton sku="ink_pack" />
      </div>
    </div>
  );
}
