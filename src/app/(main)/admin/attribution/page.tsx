"use client";

import { useEffect, useState } from "react";
import type { AttributionSummary } from "@/lib/attribution";

// /admin/attribution: where new accounts say they heard about D.scribe, by week,
// next to what their browser recorded on the first visit, and how many went on
// to pay. Same admin gate as /admin/partners (the API answers 404 to everyone
// else). SEO/GEO plan Phase 3b, Kyle 2026-11-14.

type Payload =
  | { available: true; generated_at: string; paid_definition: string; summary: AttributionSummary }
  | { available: false; reason: string };

const serif = "var(--font-playfair), var(--font-lora), serif";
const sans = "var(--font-inter), var(--font-manrope), sans-serif";
const card: React.CSSProperties = { border: "1px solid rgba(249,247,242,0.1)", borderRadius: 12, padding: "14px 16px", background: "rgba(249,247,242,0.03)" };
const h2: React.CSSProperties = { fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 24, margin: "32px 0 10px" };
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#A89F94", padding: "6px 10px 6px 0", borderBottom: "1px solid rgba(249,247,242,0.12)" };
const td: React.CSSProperties = { fontSize: 14, color: "#E8E2D8", padding: "7px 10px 7px 0", borderBottom: "1px solid rgba(249,247,242,0.06)", verticalAlign: "top" };

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div style={{ ...card, flex: "1 1 150px" }}>
      <div style={{ fontFamily: serif, fontSize: 30, lineHeight: 1.1 }}>{big}</div>
      <div style={{ fontFamily: sans, fontSize: 13, color: "#A89F94", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function AttributionAdminPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/attribution", { cache: "no-store" })
      .then((r) => { if (r.status === 404) { setDenied(true); return null; } return r.json(); })
      .then((res) => res && setData(res as Payload))
      .catch(() => setData({ available: false, reason: "Could not load the numbers." }));
  }, []);

  const shell = (body: React.ReactNode) => (
    <div style={{ height: "100%", overflowY: "auto", background: "#2C2419", color: "#F9F7F2" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 80px", fontFamily: sans }}>
        <h1 style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 34, margin: "0 0 6px" }}>How people found D.scribe</h1>
        <p style={{ margin: "0 0 20px", color: "#A89F94", fontSize: 14 }}>The signup question, next to the first-visit referrer, and who went on to pay.</p>
        {body}
      </div>
    </div>
  );

  if (denied) return shell(<p style={{ color: "#C8C0B4" }}>Not found.</p>);
  if (!data) return shell(<p style={{ color: "#C8C0B4" }}>Loading…</p>);
  if (!data.available) return shell(<div style={card}><p style={{ margin: 0, color: "#F0A878" }}>{data.reason}</p></div>);

  const s = data.summary;
  const weekSources = [...new Set(s.byWeek.flatMap((w) => Object.keys(w.bySource)))]
    .sort((a, b) => (s.bySource.find((x) => x.source === b)?.count ?? 0) - (s.bySource.find((x) => x.source === a)?.count ?? 0))
    .slice(0, 6);
  const label = (v: string) => s.bySource.find((x) => x.source === v)?.label ?? v;

  return shell(
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Stat big={String(s.total)} label="Answers" />
        <Stat big={`${s.paidTotal}`} label={`Paid now (${s.total ? Math.round((s.paidTotal / s.total) * 100) : 0}%)`} />
        <Stat big={`${s.ai.selfReportedPct}%`} label={`Say an AI assistant (${s.ai.selfReported})`} />
        <Stat big={`${s.ai.passivePct}%`} label={`Arrived from an AI assistant (${s.ai.passive})`} />
      </div>
      <p style={{ fontSize: 13, color: "#7A7358", margin: "10px 0 0" }}>
        The gap between the last two is the AI share that referrers miss. Paid: {data.paid_definition}
      </p>

      <h2 style={h2}>By source</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>Source</th><th style={th}>Answers</th><th style={th}>Paid now</th><th style={th}>Conversion</th></tr></thead>
        <tbody>
          {s.bySource.map((r) => (
            <tr key={r.source}><td style={td}>{r.label}</td><td style={td}>{r.count}</td><td style={td}>{r.paid}</td><td style={td}>{r.conversionPct}%</td></tr>
          ))}
          {s.bySource.length === 0 && <tr><td style={td} colSpan={4}>No answers yet.</td></tr>}
        </tbody>
      </table>

      <h2 style={h2}>By week (UTC, last 12)</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead><tr><th style={th}>Week of</th><th style={th}>Total</th>{weekSources.map((v) => <th key={v} style={th}>{label(v)}</th>)}</tr></thead>
          <tbody>
            {s.byWeek.map((w) => (
              <tr key={w.week}><td style={td}>{w.week}</td><td style={td}>{w.total}</td>{weekSources.map((v) => <td key={v} style={td}>{w.bySource[v] ?? 0}</td>)}</tr>
            ))}
            {s.byWeek.length === 0 && <tr><td style={td} colSpan={2 + weekSources.length}>No answers in the last 12 weeks.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 style={h2}>Said vs. first-visit referrer</h2>
      <p style={{ fontSize: 13, color: "#7A7358", margin: "0 0 8px" }}>
        &ldquo;none&rdquo; = the first visit had no referrer (typed, bookmarked, or an app that strips it). &ldquo;not captured&rdquo; = nothing was recorded on that device.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>They said</th><th style={th}>Browser recorded</th><th style={th}>Accounts</th></tr></thead>
        <tbody>
          {s.selfVsPassive.slice(0, 40).map((r) => (
            <tr key={`${r.source}|${r.passive}`}><td style={td}>{label(r.source)}</td><td style={td}>{r.passive}</td><td style={td}>{r.count}</td></tr>
          ))}
        </tbody>
      </table>

      {s.otherDetails.length > 0 && (
        <>
          <h2 style={h2}>&ldquo;Other&rdquo; answers</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#E8E2D8", fontSize: 14, lineHeight: 1.7 }}>
            {s.otherDetails.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </>
      )}
      <p style={{ fontSize: 12, color: "#7A7358", marginTop: 28 }}>Generated {new Date(data.generated_at).toLocaleString()}</p>
    </>
  );
}
