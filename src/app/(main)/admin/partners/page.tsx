"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsd, normalizeCode, normalizeSlug, suggestSlugAndCode } from "@/lib/partner-rules";

type Stats = { clicks: number; signups: number; paying: number; earned: number; payable: number };
type Row = {
  id: string; name: string; email: string; slug: string | null; code: string | null; status: string; source: string;
  links: string | null; audience: string | null; pitch: string | null; created_at: string; user_id: string | null;
  stripe_connect_account_id: string | null; stats?: Stats; suggested: { slug: string | null; code: string | null } | null;
};
type PayoutLine = { partner_id: string; name: string; cents: number; commissions: number; payouts_ready: boolean; eligible: boolean };

const serif = "var(--font-playfair), var(--font-lora), serif";
const sans = "var(--font-inter), var(--font-manrope), sans-serif";
const card: React.CSSProperties = { border: "1px solid rgba(249,247,242,0.1)", borderRadius: 12, padding: "14px 16px", background: "rgba(249,247,242,0.03)" };
const input: React.CSSProperties = { background: "rgba(249,247,242,0.05)", border: "1px solid rgba(249,247,242,0.16)", borderRadius: 8, color: "#F9F7F2", padding: "8px 10px", fontSize: 16, fontFamily: sans, minWidth: 0 };
const btn = (primary = true): React.CSSProperties => ({ background: primary ? "#C17A47" : "transparent", color: primary ? "#1B150F" : "#C8C0B4", border: primary ? "none" : "1px solid rgba(249,247,242,0.2)", borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 600, fontFamily: sans, cursor: "pointer" });
const h2: React.CSSProperties = { fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 26, margin: "36px 0 12px" };

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.error ?? `Failed (${r.status})`);
  return res;
}

function Welcome({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div style={{ ...card, borderColor: "rgba(193,122,71,0.5)", marginTop: 16 }}>
      <div style={{ fontFamily: sans, fontSize: 13, color: "#C17A47", fontWeight: 700 }}>Send this to them yourself (nothing was sent):</div>
      <textarea readOnly value={text} rows={9} style={{ ...input, width: "100%", marginTop: 8, boxSizing: "border-box", resize: "vertical" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" style={btn()} onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
        <button type="button" style={btn(false)} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function Pending({ row, onDone }: { row: Row; onDone: (msg?: string) => void }) {
  const [slug, setSlug] = useState(row.suggested?.slug ?? "");
  const [code, setCode] = useState(row.suggested?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (action: "approve" | "decline") => {
    setBusy(true); setErr(null);
    try {
      const res = await post("/api/admin/partners", action === "approve" ? { action, id: row.id, slug, code } : { action, id: row.id });
      onDone(res.message);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div style={card}>
      <div style={{ fontFamily: serif, fontSize: 19 }}>{row.name} <span style={{ fontFamily: sans, fontSize: 13, color: "#7A7358" }}>{row.email} · applied {new Date(row.created_at).toLocaleDateString()}</span></div>
      <div style={{ fontFamily: sans, fontSize: 14, color: "#C8C0B4", marginTop: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {row.links}{row.audience ? `\nAudience: ${row.audience}` : ""}{row.pitch ? `\n“${row.pitch}”` : ""}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <input style={{ ...input, flex: "1 1 160px" }} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="link name" aria-label="Link name" />
        <input style={{ ...input, flex: "1 1 140px" }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE" aria-label="Code" />
        <button type="button" style={btn()} disabled={busy} onClick={() => act("approve")}>Approve</button>
        <button type="button" style={btn(false)} disabled={busy} onClick={() => act("decline")}>Decline</button>
      </div>
      {err && <div style={{ fontFamily: sans, fontSize: 13, color: "#E08A7A", marginTop: 8 }}>{err}</div>}
    </div>
  );
}

export default function PartnersAdminPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<{ minimum_cents: number; lines: PayoutLine[] } | null>(null);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const [inv, setInv] = useState({ name: "", email: "", slug: "", code: "" });
  const [invErr, setInvErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/partners").then((r) => { if (r.status === 404) { setDenied(true); return null; } return r.json(); })
      .then((res) => res && setRows(res.partners));
    fetch("/api/admin/partners/payouts").then((r) => (r.ok ? r.json() : null)).then((res) => res && setPayouts(res));
  }, []);
  useEffect(load, [load]);

  const done = (msg?: string) => { if (msg) setWelcome(msg); load(); };

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setInvErr(null);
    try {
      const sug = suggestSlugAndCode(inv.name);
      const res = await post("/api/admin/partners", {
        action: "invite", name: inv.name, email: inv.email,
        slug: normalizeSlug(inv.slug) ?? sug.slug ?? "", code: normalizeCode(inv.code) ?? sug.code ?? "",
      });
      setInv({ name: "", email: "", slug: "", code: "" });
      done(res.message);
    } catch (err) { setInvErr((err as Error).message); }
  }

  async function toggle(row: Row) {
    try { const res = await post("/api/admin/partners", { action: row.status === "active" ? "pause" : "resume", id: row.id }); done(row.status === "paused" ? res.message : undefined); }
    catch (err) { alert((err as Error).message); }
  }

  async function release() {
    const total = (payouts?.lines ?? []).filter((l) => l.eligible).reduce((s, l) => s + l.cents, 0);
    if (!total) return;
    if (!window.confirm(`Send ${formatUsd(total)} to partners through Stripe now?`)) return;
    try {
      const res = await post("/api/admin/partners/payouts", {});
      const lines = (res.results as { name: string; cents: number; status: string; error?: string }[]).map((r) => `${r.name}: ${formatUsd(r.cents)} ${r.status}${r.error ? ` (${r.error})` : ""}`);
      setPayoutMsg(lines.join("\n") || "Nothing was due.");
      load();
    } catch (err) { setPayoutMsg((err as Error).message); }
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ height: "100%", overflowY: "auto", background: "#2C2419", color: "#F9F7F2" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 20px 80px" }}>{children}</div>
    </div>
  );
  if (denied) return shell(<p style={{ fontFamily: sans, color: "#C8C0B4" }}>Not found.</p>);
  if (!rows) return shell(<p style={{ fontFamily: sans, color: "#C8C0B4" }}>Loading…</p>);

  const pending = rows.filter((r) => r.status === "pending");
  const live = rows.filter((r) => r.status === "active" || r.status === "paused");
  const suggestion = inv.name ? suggestSlugAndCode(inv.name) : null;

  return shell(
    <>
      <h1 style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 400, fontSize: 36, margin: 0 }}>Partners</h1>
      {welcome && <Welcome text={welcome} onClose={() => setWelcome(null)} />}

      <h2 style={h2}>Applications ({pending.length})</h2>
      {pending.length === 0 ? <p style={{ fontFamily: sans, color: "#7A7358" }}>None waiting.</p> : (
        <div style={{ display: "grid", gap: 10 }}>{pending.map((r) => <Pending key={r.id} row={r} onDone={done} />)}</div>
      )}

      <h2 style={h2}>Invite a creator</h2>
      <form onSubmit={invite} style={{ ...card, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: "1 1 180px" }} placeholder="Name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
          <input style={{ ...input, flex: "1 1 220px" }} placeholder="Email" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: "1 1 180px" }} placeholder={suggestion?.slug ?? "link name"} value={inv.slug} onChange={(e) => setInv({ ...inv, slug: e.target.value })} />
          <input style={{ ...input, flex: "1 1 160px" }} placeholder={suggestion?.code ?? "CODE"} value={inv.code} onChange={(e) => setInv({ ...inv, code: e.target.value.toUpperCase() })} />
          <button type="submit" style={btn()}>Create</button>
        </div>
        {invErr && <div style={{ fontFamily: sans, fontSize: 13, color: "#E08A7A" }}>{invErr}</div>}
      </form>

      <h2 style={h2}>Active partners ({live.length})</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {live.map((r) => (
          <div key={r.id} style={{ ...card, display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: serif, fontSize: 18 }}>{r.name} {r.status === "paused" && <span style={{ fontFamily: sans, fontSize: 12, color: "#E0B07A" }}>paused</span>}</div>
              <div style={{ fontFamily: sans, fontSize: 13, color: "#7A7358" }}>/r/{r.slug} · {r.code} · {r.user_id ? "signed in" : "hasn't signed in yet"} · {r.stripe_connect_account_id ? "payouts started" : "no payouts yet"}</div>
              {r.stats && (
                <div style={{ fontFamily: sans, fontSize: 13, color: "#C8C0B4", marginTop: 4 }}>
                  {r.stats.clicks} visits · {r.stats.signups} sign-ups · {r.stats.paying} paying · earned {formatUsd(r.stats.earned)} · ready {formatUsd(r.stats.payable)}
                </div>
              )}
            </div>
            <button type="button" style={btn(false)} onClick={() => toggle(r)}>{r.status === "active" ? "Pause" : "Resume"}</button>
          </div>
        ))}
        {live.length === 0 && <p style={{ fontFamily: sans, color: "#7A7358" }}>No partners yet.</p>}
      </div>

      <h2 style={h2}>Payouts</h2>
      <div style={card}>
        {(payouts?.lines ?? []).length === 0 ? (
          <p style={{ fontFamily: sans, color: "#7A7358", margin: 0 }}>Nothing has cleared the 30-day hold yet.</p>
        ) : (
          <>
            {payouts!.lines.map((l) => (
              <div key={l.partner_id} style={{ fontFamily: sans, fontSize: 14, color: "#C8C0B4", padding: "4px 0" }}>
                {l.name}: {formatUsd(l.cents)} ({l.commissions} payments){!l.payouts_ready ? " · payouts not set up" : l.cents < (payouts?.minimum_cents ?? 0) ? " · under the minimum, rolls over" : ""}
              </div>
            ))}
            <button type="button" style={{ ...btn(), marginTop: 12 }} onClick={release} disabled={!payouts!.lines.some((l) => l.eligible)}>
              Release payouts
            </button>
          </>
        )}
        {payoutMsg && <pre style={{ fontFamily: sans, fontSize: 13, color: "#C8C0B4", whiteSpace: "pre-wrap", marginTop: 12 }}>{payoutMsg}</pre>}
      </div>
    </>,
  );
}
