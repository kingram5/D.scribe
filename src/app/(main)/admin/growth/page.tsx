"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GrowthDashboard, type GrowthPayload } from "@/components/growth/GrowthDashboard";
import { parseWindow, type GrowthWindow } from "@/lib/growth";

// /admin/growth: which marketing channels bring visits, sign-ups and paying
// customers (Kyle 2026-11-25, for him and Chiara). Partner admins plus the
// read-only GROWTH_VIEWER_EMAILS; the API answers 404 to everyone else.

export default function GrowthPage() {
  const [days, setDays] = useState<GrowthWindow>(30);
  const [data, setData] = useState<GrowthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const seq = useRef(0);

  const load = useCallback((d: GrowthWindow) => {
    const n = ++seq.current;
    setLoading(true);
    fetch(`/api/admin/growth?days=${d}`, { cache: "no-store" })
      .then((r) => { if (r.status === 404) { setDenied(true); return null; } return r.json(); })
      .then((res) => { if (n === seq.current && res) setData(res as GrowthPayload); })
      .catch(() => { if (n === seq.current) setData({ available: false, reason: "Could not load the numbers. Check your connection and try again." }); })
      .finally(() => { if (n === seq.current) setLoading(false); });
  }, []);

  useEffect(() => {
    // ?days= survives a reload or a shared link; read once on mount.
    let initial: GrowthWindow = 30;
    try { initial = parseWindow(new URLSearchParams(window.location.search).get("days")); } catch { /* default */ }
    setDays(initial);
    load(initial);
  }, [load]);

  const onDays = (d: GrowthWindow) => {
    if (d === days) return;
    setDays(d);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("days", String(d));
      window.history.replaceState(null, "", u.toString());
    } catch { /* ignore */ }
    load(d);
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "#2C2419", color: "#F9F7F2" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 80px" }}>
        {denied
          ? <p style={{ color: "#C8C0B4", fontFamily: "var(--font-inter), var(--font-manrope), sans-serif" }}>Not found.</p>
          : <GrowthDashboard payload={data} days={days} onDays={onDays} loading={loading && data !== null} />}
      </div>
    </div>
  );
}
