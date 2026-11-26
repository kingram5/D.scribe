import type { GrowthChannelRow, GrowthSummary, GrowthWindow } from "@/lib/growth";

// The growth dashboard view (Kyle 2026-11-25: "which platforms are working and
// which aren't"). Pure presentation: /admin/growth fetches the payload and
// passes it in; src/app/dev/growth renders it with fixtures. Same look as the
// other admin pages (dark paper, Playfair headings, terracotta accent). On a
// phone the channel table turns into one card per channel.

export type GrowthPayload =
  | {
      available: true;
      generated_at: string;
      viewer: "admin" | "viewer";
      sources: { visits: boolean; signups: boolean; paying: boolean };
      paying_definition: string;
      vercel_analytics_url: string;
      summary: GrowthSummary;
    }
  | { available: false; reason: string };

const serif = "var(--font-playfair), var(--font-lora), serif";
const sans = "var(--font-inter), var(--font-manrope), sans-serif";
const C = { paper: "#2C2419", ink: "#F9F7F2", body: "#E8E2D8", muted: "#A89F94", dim: "#8A8270", accent: "#C17A47", warn: "#F0A878", line: "rgba(249,247,242,0.1)" };

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const NO_RATE = "Not enough data yet: no visits counted for this channel, or more sign-ups than counted visits (sign-ups that started before visit counting).";

const css = `
.gd { color: ${C.ink}; font-family: ${sans}; }
.gd h1 { font-family: ${serif}; font-style: italic; font-weight: 400; font-size: 34px; line-height: 1.15; margin: 0 0 6px; }
.gd h2 { font-family: ${serif}; font-style: italic; font-weight: 400; font-size: 24px; margin: 36px 0 6px; }
.gd .gd-sub { margin: 0 0 18px; color: ${C.muted}; font-size: 14px; line-height: 1.55; }
.gd .gd-note { margin: 0 0 12px; color: ${C.dim}; font-size: 13px; line-height: 1.55; }
.gd .gd-switch { display: inline-flex; border: 1px solid ${C.line}; border-radius: 999px; padding: 3px; gap: 2px; background: rgba(249,247,242,0.03); }
.gd .gd-switch button { min-height: 36px; padding: 0 14px; border-radius: 999px; border: none; background: transparent; color: ${C.muted}; font: 600 13px ${sans}; cursor: pointer; }
.gd .gd-switch button[aria-pressed="true"] { background: ${C.accent}; color: #1B150F; }
.gd .gd-switch button:focus-visible { outline: 2px solid ${C.ink}; outline-offset: 2px; }
.gd .gd-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
.gd .gd-stat { border: 1px solid ${C.line}; border-radius: 12px; padding: 12px 14px; background: rgba(249,247,242,0.03); min-width: 0; }
.gd .gd-stat b { display: block; font-family: ${serif}; font-weight: 400; font-size: 28px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.gd .gd-stat span { display: block; margin-top: 4px; color: ${C.muted}; font-size: 12.5px; line-height: 1.35; }
.gd table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.gd th { text-align: right; font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${C.muted}; padding: 6px 0 8px 12px; border-bottom: 1px solid rgba(249,247,242,0.14); white-space: nowrap; vertical-align: bottom; }
.gd td { text-align: right; font-size: 14px; color: ${C.body}; padding: 9px 0 9px 12px; border-bottom: 1px solid rgba(249,247,242,0.06); vertical-align: middle; white-space: nowrap; }
.gd th:first-child, .gd td:first-child { text-align: left; padding-left: 0; white-space: normal; }
.gd tr.gd-sub-row td { font-size: 12.5px; color: ${C.muted}; padding-top: 4px; padding-bottom: 4px; border-bottom: none; }
.gd tr.gd-sub-row td:first-child { padding-left: 16px; }
.gd .gd-num-bar { display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; }
.gd .gd-bar { display: inline-block; height: 6px; border-radius: 3px; background: ${C.accent}; opacity: 0.85; }
.gd .gd-cards { display: none; }
.gd .gd-card { border: 1px solid ${C.line}; border-radius: 12px; padding: 12px 14px; background: rgba(249,247,242,0.03); margin-bottom: 10px; }
.gd .gd-card h3 { margin: 0 0 10px; font: 600 15px ${sans}; display: flex; justify-content: space-between; gap: 8px; }
.gd .gd-card dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 8px; margin: 0; }
.gd .gd-card dl.gd-rates { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 10px; }
.gd .gd-card dt { color: ${C.muted}; font-size: 11.5px; letter-spacing: 0.04em; text-transform: uppercase; }
.gd .gd-card dd { margin: 2px 0 0; font-size: 16px; font-variant-numeric: tabular-nums; }
.gd .gd-card .gd-parts { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid rgba(249,247,242,0.06); color: ${C.muted}; font-size: 12.5px; line-height: 1.6; }
.gd .gd-empty { border: 1px dashed rgba(249,247,242,0.18); border-radius: 12px; padding: 18px 16px; color: ${C.muted}; font-size: 14px; line-height: 1.6; }
.gd .gd-empty strong { color: ${C.ink}; font-weight: 600; }
.gd .gd-warn { border: 1px solid rgba(240,168,120,0.4); border-radius: 12px; padding: 10px 14px; color: ${C.warn}; font-size: 13.5px; line-height: 1.5; margin-top: 14px; }
.gd .gd-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.gd a { color: ${C.accent}; text-underline-offset: 3px; }
.gd .gd-foot { margin-top: 36px; padding-top: 14px; border-top: 1px solid ${C.line}; color: ${C.dim}; font-size: 12.5px; line-height: 1.7; }
@media (max-width: 760px) {
  .gd .gd-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gd .gd-stats .gd-stat:first-child { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
  .gd h1 { font-size: 28px; }
  .gd .gd-table-wide { display: none; }
  .gd .gd-cards { display: block; }
}
`;

function Rate({ v }: { v: number | null }) {
  return v === null ? <span title={NO_RATE} style={{ color: C.dim }}>—</span> : <>{pct(v)}</>;
}

function ChannelTable({ rows, maxSignups }: { rows: GrowthChannelRow[]; maxSignups: number }) {
  return (
    <div className="gd-table-wide gd-scroll">
      <table>
        <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Visits, sign-ups and paying customers by channel</caption>
        <thead>
          <tr>
            <th scope="col">Channel</th>
            <th scope="col">Visits</th>
            <th scope="col">Sign-ups</th>
            <th scope="col" title="Sign-ups whose own answer named this channel">Said so</th>
            <th scope="col">Paying</th>
            <th scope="col">Visit → sign-up</th>
            <th scope="col">Sign-up → paying</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((r) => [
            <tr key={r.id}>
              <td style={{ color: C.ink, fontWeight: 600 }}>{r.label}</td>
              <td>{fmt(r.visits)}</td>
              <td>
                <span className="gd-num-bar">
                  {maxSignups > 0 && r.signups > 0 && <span className="gd-bar" style={{ width: Math.max(4, Math.round((r.signups / maxSignups) * 56)) }} aria-hidden="true" />}
                  {fmt(r.signups)}
                </span>
              </td>
              <td>{fmt(r.said)}</td>
              <td>{fmt(r.paid)}</td>
              <td><Rate v={r.visitToSignupPct} /></td>
              <td><Rate v={r.signupToPaidPct} /></td>
            </tr>,
            ...r.breakdown.map((b) => (
              <tr key={`${r.id}:${b.channel}`} className="gd-sub-row">
                <td>{b.label}</td>
                <td>{fmt(b.visits)}</td>
                <td>{fmt(b.signups)}</td>
                <td />
                <td>{fmt(b.paid)}</td>
                <td colSpan={2} />
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function ChannelCards({ rows }: { rows: GrowthChannelRow[] }) {
  return (
    <div className="gd-cards">
      {rows.map((r) => (
        <section key={r.id} className="gd-card" aria-label={r.label}>
          <h3><span>{r.label}</span><span style={{ color: C.muted, fontWeight: 500 }}>{fmt(r.signups)} sign-up{r.signups === 1 ? "" : "s"}</span></h3>
          <dl>
            <div><dt>Visits</dt><dd>{fmt(r.visits)}</dd></div>
            <div><dt>Said so</dt><dd>{fmt(r.said)}</dd></div>
            <div><dt>Paying</dt><dd>{fmt(r.paid)}</dd></div>
          </dl>
          <dl className="gd-rates">
            <div><dt>Visit → sign-up</dt><dd><Rate v={r.visitToSignupPct} /></dd></div>
            <div><dt>Sign-up → paying</dt><dd><Rate v={r.signupToPaidPct} /></dd></div>
          </dl>
          {r.breakdown.length > 0 && (
            <p className="gd-parts">
              {r.breakdown.map((b) => `${b.label}: ${fmt(b.visits)} visit${b.visits === 1 ? "" : "s"}, ${fmt(b.signups)} sign-up${b.signups === 1 ? "" : "s"}`).join(" · ")}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

export function GrowthDashboard({
  payload, days, onDays, loading = false,
}: {
  payload: GrowthPayload | null;
  days: GrowthWindow;
  onDays: (d: GrowthWindow) => void;
  loading?: boolean;
}) {
  const header = (
    <>
      <style>{css}</style>
      <h1>What&rsquo;s working</h1>
      <p className="gd-sub">Visits, sign-ups and paying customers, by where people came from. Channels with the most sign-ups come first.</p>
      <div className="gd-switch" role="group" aria-label="Time window">
        {([7, 30, 90] as const).map((d) => (
          <button key={d} type="button" aria-pressed={d === days} onClick={() => onDays(d)}>Last {d} days</button>
        ))}
      </div>
    </>
  );

  if (!payload) {
    return <div className="gd">{header}<p className="gd-note" style={{ marginTop: 20 }}>Loading…</p></div>;
  }
  if (!payload.available) {
    return <div className="gd">{header}<div className="gd-warn">{payload.reason}</div></div>;
  }

  const s = payload.summary;
  const t = s.totals;
  const maxSignups = Math.max(0, ...s.channels.map((c) => c.signups));
  const maxWeek = Math.max(0, ...s.weekly.map((w) => w.signups));
  const nothing = t.visits === 0 && t.signups === 0;

  return (
    <div className="gd" aria-busy={loading}>
      {header}

      {!payload.sources.visits && <div className="gd-warn">Visit counts are not available yet: run migration 033 in Supabase. Sign-ups below still count.</div>}
      {!payload.sources.signups && <div className="gd-warn">Sign-ups are not available yet: run migration 033 in Supabase. Visits below still count.</div>}
      {payload.sources.signups && !payload.sources.paying && <div className="gd-warn">Could not read plans right now, so Paying shows 0.</div>}

      <div className="gd-stats" style={{ opacity: loading ? 0.55 : 1 }}>
        <div className="gd-stat"><b>{fmt(t.visits)}</b><span>Visits ({day(s.startDay)} to {day(s.endDay)})</span></div>
        <div className="gd-stat"><b>{fmt(t.signups)}</b><span>Sign-ups</span></div>
        <div className="gd-stat"><b>{fmt(t.paid)}</b><span>Paying now</span></div>
        <div className="gd-stat"><b>{pct(t.visitToSignupPct)}</b><span>Visit → sign-up</span></div>
        <div className="gd-stat"><b>{pct(t.signupToPaidPct)}</b><span>Sign-up → paying</span></div>
      </div>

      <h2>By channel</h2>
      <p className="gd-note">
        Sign-ups are counted by where their first visit came from. &ldquo;Said so&rdquo; is how many new accounts named that channel themselves; apps like Instagram and TikTok often hide the link, so those visits land in Direct and the answer is the better signal.
      </p>
      {nothing ? (
        <div className="gd-empty">
          <strong>Nothing in the last {s.days} days yet.</strong> Visits show up here as people arrive on the site; sign-ups once a new account answers &ldquo;How did you hear about us?&rdquo; in the app.
        </div>
      ) : (
        <div style={{ opacity: loading ? 0.55 : 1 }}>
          <ChannelTable rows={s.channels} maxSignups={maxSignups} />
          <ChannelCards rows={s.channels} />
        </div>
      )}
      {s.quiet.length > 0 && !nothing && (
        <p className="gd-note" style={{ marginTop: 12 }}>No visits or sign-ups yet from: {s.quiet.join(", ")}.</p>
      )}

      <h2>What new accounts said</h2>
      <p className="gd-note">Their own answer to &ldquo;How did you hear about D.scribe?&rdquo;, for sign-ups in this window.</p>
      {s.answers.length === 0 ? (
        <div className="gd-empty">No answers in the last {s.days} days yet.</div>
      ) : (
        <div className="gd-scroll">
          <table>
            <thead><tr><th scope="col">Answer</th><th scope="col">Accounts</th><th scope="col">Paying</th></tr></thead>
            <tbody>
              {s.answers.map((a) => (
                <tr key={a.source}><td>{a.label}</td><td>{fmt(a.count)}</td><td>{fmt(a.paid)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Week by week</h2>
      <p className="gd-note">Weeks start Monday (UTC), newest first. The bar is sign-ups that week.</p>
      {t.visits === 0 && t.signups === 0 ? (
        <div className="gd-empty">Weekly numbers start with the first visit or sign-up.</div>
      ) : (
        <div className="gd-scroll">
          <table style={{ minWidth: s.weeklyGroups.length > 2 ? 520 : undefined }}>
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">Visits</th>
                <th scope="col">Sign-ups</th>
                {s.weeklyGroups.map((g) => <th key={g.id} scope="col">{g.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {s.weekly.map((w) => (
                <tr key={w.week}>
                  <td style={{ whiteSpace: "nowrap" }}>{day(w.week)}</td>
                  <td>{fmt(w.visits)}</td>
                  <td>
                    <span className="gd-num-bar">
                      <svg width="48" height="8" viewBox="0 0 48 8" aria-hidden="true">
                        <rect x="0" y="1" width="48" height="6" rx="3" fill="rgba(249,247,242,0.08)" />
                        {w.signups > 0 && <rect x="0" y="1" width={Math.max(4, Math.round((w.signups / Math.max(1, maxWeek)) * 48))} height="6" rx="3" fill={C.accent} />}
                      </svg>
                      {fmt(w.signups)}
                    </span>
                  </td>
                  {s.weeklyGroups.map((g) => <td key={g.id}>{fmt(w.byGroup[g.id] ?? 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="gd-foot">
        <p style={{ margin: "0 0 6px" }}>
          {s.countingSince
            ? <>Visits started counting on {day(s.countingSince)} (the day this went live), so visit numbers and rates before then are blank, and a rate shows &ldquo;—&rdquo; until both sides have data.</>
            : <>No visits counted yet. Counting starts with the first visitor after this goes live; rates show &ldquo;—&rdquo; until then.</>}
        </p>
        <p style={{ margin: "0 0 6px" }}>
          A visit is a browser&rsquo;s first ever visit (browsers that had already declined analytics, and bots, are not counted). Sign-ups are new accounts that answered the first question in the app. {payload.paying_definition}
        </p>
        <p style={{ margin: "0 0 6px" }}>
          Raw traffic, referrers and top pages: <a href={payload.vercel_analytics_url} target="_blank" rel="noopener noreferrer">Vercel Analytics</a> (needs a Vercel login on the D.scribe team).
        </p>
        <p style={{ margin: 0 }}>Updated {new Date(payload.generated_at).toLocaleString("en-US")}{payload.viewer === "viewer" ? " · read-only view" : ""}</p>
      </div>
    </div>
  );
}
