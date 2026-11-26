"use client";

import { useEffect, useState } from "react";
import { GrowthDashboard } from "@/components/growth/GrowthDashboard";
import { growthFixture, type GrowthFixture } from "@/components/growth/growth-fixtures";
import type { GrowthWindow } from "@/lib/growth";

// ?state=full|empty|no-visits|unavailable picks the fixture.
export default function GrowthDemo() {
  const [days, setDays] = useState<GrowthWindow>(30);
  const [state, setState] = useState<GrowthFixture>("full");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state");
    if (s === "empty" || s === "no-visits" || s === "unavailable" || s === "full") setState(s);
  }, []);
  return (
    <div style={{ minHeight: "100dvh", background: "#2C2419", color: "#F9F7F2" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 80px" }}>
        <GrowthDashboard payload={growthFixture(state, days)} days={days} onDays={setDays} />
      </div>
    </div>
  );
}
