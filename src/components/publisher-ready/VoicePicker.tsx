"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Pair { id: string; option_a: string; option_b: string; dimension: string }

/** Fetch the next batch when this few pairs are left, so the author never waits on a spinner. */
const PREFETCH_AT = 3;

/**
 * "Which would you actually say out loud?" Shown while the editor reads the
 * book (dead time the author would otherwise spend watching a progress bar).
 * Two lines from their own chapter, written two ways; or "neither" with a box
 * to say it their way. Keeps serving fresh pairs for as long as `active` (the
 * editor is still reading), up to the per-book cap on the server.
 */
export default function VoicePicker({ projectId, active = true, onClose }: { projectId: string; active?: boolean; onClose?: () => void }) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [state, setState] = useState<"loading" | "asking" | "waiting" | "done" | "hidden">("loading");
  const [rewriting, setRewriting] = useState(false);
  const [rewrite, setRewrite] = useState("");
  const [busy, setBusy] = useState(false);
  const fetching = useRef(false);
  const pairsRef = useRef<Pair[]>([]);
  const exhausted = useRef(false);

  /** Pull open pairs (the server tops up a batch when few remain) and append the new ones. */
  const loadMore = useCallback(async (): Promise<number> => {
    if (fetching.current || exhausted.current) return 0;
    fetching.current = true;
    try {
      const data = await fetch(`/api/voice-picker?project_id=${projectId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const incoming: Pair[] = data?.pairs ?? [];
      if (!data || data.done || !incoming.length) exhausted.current = true;
      const seen = new Set(pairsRef.current.map((p) => p.id));
      const fresh = incoming.filter((p) => !seen.has(p.id));
      if (fresh.length) {
        pairsRef.current = [...pairsRef.current, ...fresh];
        setPairs(pairsRef.current);
      }
      return fresh.length;
    } finally {
      fetching.current = false;
    }
  }, [projectId]);

  useEffect(() => {
    void loadMore().then(() => {
      if (!pairsRef.current.length) { setState("hidden"); onClose?.(); } else setState("asking");
    });
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps -- first load once per project

  // Top up in the background as the author nears the end of what's loaded.
  useEffect(() => {
    if (state !== "asking" && state !== "waiting") return;
    if (!active || pairs.length - idx > PREFETCH_AT) return;
    // Only leave "waiting" when a batch actually arrived (an in-flight fetch returns 0).
    void loadMore().then((added) => { if (added) setState((s) => (s === "waiting" ? "asking" : s)); });
  }, [idx, pairs.length, active, state, loadMore]);

  // Ran out: wait for the batch in flight while the editor still reads; otherwise finish.
  useEffect(() => {
    if (state !== "asking" && state !== "waiting") return;
    if (idx < pairs.length) { if (state === "waiting") setState("asking"); return; }
    if (active && !exhausted.current) setState("waiting");
    else setState("done");
  }, [idx, pairs.length, active, state]);

  const answer = async (choice: "a" | "b" | "neither") => {
    const pair = pairs[idx];
    if (!pair) return;
    setBusy(true);
    await fetch("/api/voice-picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_id: pair.id, choice, rewrite: choice === "neither" ? rewrite : null }),
    }).catch(() => null);
    setBusy(false);
    setRewriting(false);
    setRewrite("");
    setAnswered((n) => n + 1);
    setIdx((i) => i + 1);
  };

  if (state === "hidden") return null;
  if (state === "loading" || state === "waiting") {
    return <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Pulling a few more lines from your chapters…</div>;
  }
  if (state === "done") {
    return (
      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        {answered > 0 ? `Got it. ${answered} picks. They go into the rewrite, and every book after this one.` : "Nothing to pick right now."}{" "}
        {onClose && (
          <button type="button" className="ds-picker-btn" onClick={() => onClose()} style={{ marginLeft: 8, fontSize: 13, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--ds-card-border)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}>Close</button>
        )}
      </div>
    );
  }

  const pair = pairs[idx];
  const option = (text: string, choice: "a" | "b") => (
    <button
      type="button"
      className="ds-picker-option"
      disabled={busy}
      onClick={() => answer(choice)}
      style={{
        textAlign: "left", padding: "14px 16px", borderRadius: 12, fontSize: 16, lineHeight: 1.5,
        border: "1px solid var(--ds-card-border)", background: "var(--ds-input-bg)", color: "var(--text-primary)",
        cursor: busy ? "wait" : "pointer", fontFamily: "var(--font-lora), serif",
      }}
    >
      {text}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {active ? "While your editor reads" : "Your editor is done. Pick a few more or move on"} · pick {answered + 1}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>Which would you actually say out loud?</div>
      {option(pair.option_a, "a")}
      {option(pair.option_b, "b")}
      {rewriting ? (
        <div style={{ display: "grid", gap: 8 }}>
          <textarea
            value={rewrite}
            onChange={(e) => setRewrite(e.target.value)}
            rows={3}
            placeholder="Say it the way you would"
            style={{ width: "100%", padding: 12, borderRadius: 10, fontSize: 16, border: "1px solid var(--ds-input-border)", background: "var(--ds-input-bg)", color: "var(--text-primary)", fontFamily: "inherit" }}
          />
          <button type="button" className="ds-picker-btn" disabled={busy || !rewrite.trim()} onClick={() => answer("neither")}
            style={{ justifySelf: "start", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--ds-accent-500, #C17A47)", color: "#fff", cursor: "pointer" }}>
            Use my version
          </button>
        </div>
      ) : (
        <button type="button" className="ds-picker-btn" onClick={() => setRewriting(true)}
          style={{ justifySelf: "start", fontSize: 13, padding: "6px 12px", borderRadius: 10, border: "1px solid var(--ds-card-border)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}>
          Neither. I&apos;d say it like this…
        </button>
      )}
    </div>
  );
}
