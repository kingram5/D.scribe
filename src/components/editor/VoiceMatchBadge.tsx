"use client";

import { useEffect, useRef, useState } from "react";

interface CachedScores {
  reads_human: number;
  voice_match: number;
  version: number;
  computed_at: string;
}

interface Breakdown {
  reads_human: {
    score: number;
    em_dashes: number;
    banned_hits: { phrase: string; count: number; soft: boolean }[];
    negation_flips: number;
    rhetorical_transitions: number;
    uniform_paragraphs: boolean;
  };
  voice_match: {
    score: number;
    components: {
      sentenceRhythm: number;
      sentenceVariety: number;
      contractions: number;
      signaturePhrases: number;
      aiTellBleed: number;
    };
    signature_hits: string[];
    baseline_words: number;
  };
}

function scoreColor(score: number): string {
  if (score >= 85) return "var(--ds-score-good)";
  if (score >= 70) return "var(--ds-score-warn)";
  return "var(--ds-score-bad)";
}

/**
 * Voice-Match chip for the editor stats bar. Shows cached scores when they
 * match the current content version; otherwise offers a one-click rescore.
 * Scoring is deterministic and free (no Ink).
 */
export default function VoiceMatchBadge({
  chapterId,
  contentVersion,
  cachedScores,
}: {
  chapterId: string;
  contentVersion: number;
  cachedScores?: CachedScores | null;
}) {
  const [scores, setScores] = useState<CachedScores | null>(
    cachedScores && cachedScores.version === contentVersion ? cachedScores : null
  );
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Chapter switch or new version: drop stale state
  useEffect(() => {
    setScores(cachedScores && cachedScores.version === contentVersion ? cachedScores : null);
    setBreakdown(null);
    setError(null);
    setOpen(false);
  }, [chapterId, contentVersion, cachedScores]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function score() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/voice-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Scoring failed");
        return;
      }
      setScores(data.scores);
      setBreakdown({ reads_human: data.reads_human, voice_match: data.voice_match });
      setOpen(true);
    } catch {
      setError("Scoring failed");
    } finally {
      setLoading(false);
    }
  }

  const chipStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    fontFamily: "var(--font-geist-mono), monospace",
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {scores ? (
        <button
          onClick={() => (breakdown ? setOpen((o) => !o) : score())}
          title="Voice-match breakdown"
          aria-label={`Voice match ${scores.voice_match}, reads human ${scores.reads_human}. Show breakdown`}
          aria-expanded={open}
          aria-haspopup="dialog"
          style={chipStyle}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-10" transform="translate(0 -2)" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: scoreColor(scores.voice_match) }}>
            {scores.voice_match}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-manrope), sans-serif" }}>
            voice
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: scoreColor(scores.reads_human) }}>
            {scores.reads_human}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-manrope), sans-serif" }}>
            human
          </span>
        </button>
      ) : (
        <button onClick={score} disabled={loading} style={chipStyle} title="Score this chapter against your spoken voice">
          <span style={{ fontSize: 11, color: loading ? "var(--text-tertiary)" : "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif" }}>
            {loading ? "scoring…" : error ? "retry score" : "voice score"}
          </span>
        </button>
      )}

      {open && breakdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 12px)",
            right: 0,
            zIndex: "var(--z-dropdown)",
            width: 260,
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--ds-card-bg)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--ds-card-border)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
            fontFamily: "var(--font-manrope), sans-serif",
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
            Voice match {breakdown.voice_match.score} · Reads human {breakdown.reads_human.score}
          </div>
          {(
            [
              ["Sentence rhythm", breakdown.voice_match.components.sentenceRhythm],
              ["Sentence variety", breakdown.voice_match.components.sentenceVariety],
              ["Contractions", breakdown.voice_match.components.contractions],
              ["Signature phrases", breakdown.voice_match.components.signaturePhrases],
            ] as const
          ).map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span>{label}</span>
              <span style={{ color: scoreColor(value), fontWeight: 600 }}>{Math.round(value)}</span>
            </div>
          ))}
          <div style={{ height: 1, background: "var(--ds-card-border)", margin: "8px 0" }} />
          {breakdown.reads_human.em_dashes > 0 && (
            <div>⚠ {breakdown.reads_human.em_dashes} em dash{breakdown.reads_human.em_dashes > 1 ? "es" : ""}</div>
          )}
          {breakdown.reads_human.negation_flips > 0 && (
            <div>⚠ {breakdown.reads_human.negation_flips} negation-flip pattern{breakdown.reads_human.negation_flips > 1 ? "s" : ""}</div>
          )}
          {breakdown.reads_human.banned_hits.length > 0 && (
            <div>
              ⚠ AI phrases:{" "}
              {breakdown.reads_human.banned_hits.slice(0, 4).map((b) => `"${b.phrase}"`).join(", ")}
              {breakdown.reads_human.banned_hits.length > 4 ? "…" : ""}
            </div>
          )}
          {breakdown.voice_match.signature_hits.length > 0 && (
            <div style={{ color: "var(--ds-score-good)" }}>
              ✓ your phrases: {breakdown.voice_match.signature_hits.slice(0, 3).map((p) => `"${p}"`).join(", ")}
            </div>
          )}
          <div style={{ marginTop: 8, color: "var(--text-tertiary)" }}>
            Baseline: {breakdown.voice_match.baseline_words.toLocaleString()} spoken words
          </div>
          <button
            onClick={score}
            disabled={loading}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "5px 0",
              borderRadius: 8,
              border: "1px solid var(--ds-card-border)",
              background: "none",
              color: "var(--text-secondary)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {loading ? "rescoring…" : "rescore"}
          </button>
        </div>
      )}
    </div>
  );
}
