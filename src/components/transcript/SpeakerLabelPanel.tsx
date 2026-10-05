"use client";

import { useMemo, useState } from "react";
import type { Transcript } from "@/types";
import { SPEAKER_COLORS } from "@/lib/constants";

type Draft = { role: "author" | "other" | ""; name: string; relationship: string; sameAs: string };

interface Props {
  transcript: Transcript;
  onSaved: () => void | Promise<void>;
}

/**
 * "Who is speaking?" at the transcript step (Kyle 2026-09-27). One card per
 * detected speaker with a sample line: the book's author, or someone else
 * with a name and how they relate. "Same person as…" merges a speaker the
 * detector split in two. Optional (Kyle 9/28): skipping it treats every voice
 * as the author, exactly as before labels existed.
 */
export default function SpeakerLabelPanel({ transcript, onSaved }: Props) {
  const speakers = useMemo(() => {
    const order: string[] = [];
    const words: Record<string, number> = {};
    const sample: Record<string, string> = {};
    for (const s of transcript.segments ?? []) {
      if (!order.includes(s.speaker)) order.push(s.speaker);
      const n = s.text.split(/\s+/).filter(Boolean).length;
      words[s.speaker] = (words[s.speaker] ?? 0) + n;
      if (!sample[s.speaker] || (s.text.length > sample[s.speaker].length && s.text.length < 260)) sample[s.speaker] = s.text;
    }
    const total = Object.values(words).reduce((a, b) => a + b, 0) || 1;
    return order.map((sp) => ({ speaker: sp, pct: Math.round((words[sp] / total) * 100), sample: sample[sp] ?? "" }));
  }, [transcript.segments]);

  const initial = useMemo(() => {
    const d: Record<string, Draft> = {};
    for (const s of speakers) {
      const l = transcript.speaker_map?.[s.speaker];
      d[s.speaker] = {
        // One speaker and nothing saved yet: default to the author (one tap to confirm).
        role: l?.role ?? (speakers.length === 1 ? "author" : ""),
        name: l?.name ?? "",
        relationship: l?.relationship ?? "",
        sameAs: "",
      };
    }
    return d;
  }, [speakers, transcript.speaker_map]);

  const [draft, setDraft] = useState<Record<string, Draft>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = !!transcript.speakers_confirmed_at;

  const set = (sp: string, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [sp]: { ...d[sp], ...patch } }));

  const ready = speakers.every((s) => {
    const d = draft[s.speaker];
    if (!d) return false;
    if (d.sameAs) return true;
    return d.role === "author" || (d.role === "other" && d.name.trim().length > 0);
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const map: Record<string, { role: string; name?: string; relationship?: string }> = {};
      const reassign: { index: number; speaker: string }[] = [];
      for (const s of speakers) {
        const d = draft[s.speaker];
        if (d.sameAs) {
          (transcript.segments ?? []).forEach((seg, i) => { if (seg.speaker === s.speaker) reassign.push({ index: i, speaker: d.sameAs }); });
          continue;
        }
        map[s.speaker] = d.role === "author" ? { role: "author" } : { role: "other", name: d.name.trim(), relationship: d.relationship.trim() };
      }
      const res = await fetch("/api/transcript-speakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript_id: transcript.id, speaker_map: map, reassign }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save speakers");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save speakers");
    } finally {
      setSaving(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, fontSize: 16,
    border: "1px solid var(--ds-input-border)", background: "var(--ds-input-bg)", color: "var(--text-primary)",
  };
  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 999, cursor: "pointer",
    border: on ? "1px solid #C17A47" : "1px solid var(--ds-card-border)",
    background: on ? "rgba(193,122,71,0.12)" : "transparent", color: "var(--text-primary)",
  });

  return (
    <div data-tut="transcript-speakers" style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 20 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          {confirmed ? "Speakers" : "Who is speaking?"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.5 }}>
          {confirmed
            ? "Saved. Change them anytime; the next analysis uses the new labels."
            : "Optional. Tell us who each voice is, so your interviewer and writer never mix up your story with someone else's. Skip it and every voice is treated as yours."}
        </div>
      </div>

      {speakers.map((s, idx) => {
        const d = draft[s.speaker];
        if (!d) return null;
        const others = speakers.filter((o) => o.speaker !== s.speaker && !draft[o.speaker]?.sameAs);
        return (
          <div key={s.speaker} style={{ background: "var(--ds-input-bg)", border: "1px solid var(--ds-card-border)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: SPEAKER_COLORS[idx % SPEAKER_COLORS.length] }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{s.speaker} · {s.pct}% of the words</span>
            </div>
            {s.sample && (
              <div style={{ fontSize: 13, color: "var(--text-primary)", fontStyle: "italic", lineHeight: 1.5 }}>
                “{s.sample.length > 180 ? `${s.sample.slice(0, 180)}…` : s.sample}”
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button type="button" style={chip(d.role === "author" && !d.sameAs)} onClick={() => set(s.speaker, { role: "author", sameAs: "" })}>The book&apos;s author</button>
              <button type="button" style={chip(d.role === "other" && !d.sameAs)} onClick={() => set(s.speaker, { role: "other", sameAs: "" })}>Someone else</button>
              {others.length > 0 && (
                <select
                  value={d.sameAs}
                  onChange={(e) => set(s.speaker, { sameAs: e.target.value })}
                  aria-label={`Same person as another speaker (${s.speaker})`}
                  style={{ ...field, width: "auto", fontSize: 12, padding: "5px 8px" }}
                >
                  <option value="">Same person as…</option>
                  {others.map((o) => <option key={o.speaker} value={o.speaker}>{o.speaker}</option>)}
                </select>
              )}
            </div>
            {d.role === "other" && !d.sameAs && (
              <div style={{ display: "grid", gap: 6 }}>
                <input style={field} placeholder="Their name (e.g. Pastor Mike)" value={d.name} maxLength={60} onChange={(e) => set(s.speaker, { name: e.target.value })} />
                <input style={field} placeholder="Who they are to you (e.g. my pastor)" value={d.relationship} maxLength={60} onChange={(e) => set(s.speaker, { relationship: e.target.value })} />
              </div>
            )}
          </div>
        );
      })}

      {error && <div role="alert" style={{ fontSize: 12, color: "#B4532A" }}>{error}</div>}
      <button
        type="button"
        onClick={save}
        disabled={!ready || saving}
        style={{
          fontSize: 13, fontWeight: 600, padding: "9px 14px", borderRadius: 10, border: "none",
          background: ready ? "var(--ds-accent-500, #C17A47)" : "var(--ds-card-border)", color: "#fff",
          cursor: ready && !saving ? "pointer" : "not-allowed",
        }}
      >
        {saving ? "Saving..." : confirmed ? "Update speakers" : speakers.length === 1 ? "That's right" : "Save speakers"}
      </button>
    </div>
  );
}
