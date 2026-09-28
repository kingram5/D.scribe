"use client";

import { useEffect, useState } from "react";

interface Pair { id: string; option_a: string; option_b: string; dimension: string }

/**
 * "Which would you actually say out loud?" Shown while the editor reads the
 * book (dead time the author would otherwise spend watching a progress bar),
 * once per author. Two lines from their own chapter, written two ways; or
 * "neither" with a box to say it their way.
 */
export default function VoicePicker({ projectId, onClose }: { projectId: string; onClose?: () => void }) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [idx, setIdx] = useState(0);
  const [state, setState] = useState<"loading" | "asking" | "done" | "hidden">("loading");
  const [rewriting, setRewriting] = useState(false);
  const [rewrite, setRewrite] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/voice-picker?project_id=${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || data.done || !data.pairs?.length) { setState("hidden"); onClose?.(); return; }
        setPairs(data.pairs);
        setState("asking");
      })
      .catch(() => { setState("hidden"); onClose?.(); });
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps -- fetch once per project

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
    if (idx + 1 >= pairs.length) setState("done");
    else setIdx(idx + 1);
  };

  if (state === "loading" || state === "hidden") return null;
  if (state === "done") {
    return (
      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        Got it. Your picks go into the rewrite, and every book after this one.{" "}
        <button type="button" onClick={() => onClose?.()} style={{ marginLeft: 8, fontSize: 13, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--ds-card-border)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}>Close</button>
      </div>
    );
  }

  const pair = pairs[idx];
  const option = (text: string, choice: "a" | "b") => (
    <button
      type="button"
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
        While your editor reads · {idx + 1} of {pairs.length}
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
          <button type="button" disabled={busy || !rewrite.trim()} onClick={() => answer("neither")}
            style={{ justifySelf: "start", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--ds-accent-500, #C17A47)", color: "#fff", cursor: "pointer" }}>
            Use my version
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setRewriting(true)}
          style={{ justifySelf: "start", fontSize: 13, padding: "6px 12px", borderRadius: 10, border: "1px solid var(--ds-card-border)", background: "transparent", color: "var(--text-primary)", cursor: "pointer" }}>
          Neither. I&apos;d say it like this…
        </button>
      )}
    </div>
  );
}
