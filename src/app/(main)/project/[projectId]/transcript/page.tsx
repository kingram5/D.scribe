"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Transcript, TranscriptSegment } from "@/types";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import JobProgress from "@/components/ui/JobProgress";
import { useJob } from "@/hooks/useJob";
import { SPEAKER_COLORS } from "@/lib/constants";

/* ── palette tokens ─────────────────────────────────────────────── */
const P = {
  bg: "var(--env-bg)",
  card: "var(--ds-card-bg)",
  border: "var(--ds-card-border)",
  text: "var(--text-primary)",
  muted: "var(--text-secondary)",
  light: "var(--text-tertiary)",
  accent: "#C17A47",
  accentHover: "#D98B58",
  inputBg: "var(--ds-input-bg)",
  serif: "var(--font-playfair), var(--font-lora), serif",
  sans: "var(--font-manrope), var(--font-inter), sans-serif",
  mono: "var(--font-geist-mono), monospace",
};

/* ── merge consecutive same-speaker segments ────────────────────── */
/** Merge consecutive same-speaker segments into paragraphs.
 *  Break on: speaker change, ">>" markers, or every ~30 seconds to keep timestamps visible. */
function mergeSegments(segments: TranscriptSegment[]): { speaker: string; text: string; start: number }[] {
  if (!segments?.length) return [];
  const BREAK_INTERVAL = 30; // seconds — create a new paragraph every ~30s
  const merged: { speaker: string; text: string; start: number }[] = [];
  let current = { speaker: segments[0].speaker, text: segments[0].text, start: segments[0].start };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const timeSinceStart = seg.start - current.start;
    const hasLineBreak = seg.text.startsWith(">>") || current.text.endsWith(">>");
    const speakerChanged = seg.speaker !== current.speaker;
    const timeBreak = timeSinceStart >= BREAK_INTERVAL;

    if (speakerChanged || hasLineBreak || timeBreak) {
      merged.push({ ...current });
      current = { speaker: seg.speaker, text: seg.text.replace(/^>>\s*/, ""), start: seg.start };
    } else {
      current.text += " " + seg.text;
    }
  }
  merged.push(current);

  return merged.map((m) => ({
    ...m,
    text: m.text.replace(/\s*>>\s*/g, "\n"),
  }));
}

/* ── helpers ─────────────────────────────────────────────────────── */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function speakerLabel(raw: string): string {
  return raw === "Speaker 0" ? "Narrator" : raw;
}

function speakerInitial(raw: string, idx: number): string {
  if (raw === "Speaker 0") return "N";
  const match = raw.match(/(\d+)/);
  return match ? `S${match[1]}` : `S${idx + 1}`;
}

/* ── component ──────────────────────────────────────────────────── */
export default function TranscriptPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const analyzeJob = useJob();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const active = transcripts[activeIdx] ?? null;
  const merged = active?.segments ? mergeSegments(active.segments) : [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setTranscripts(data.transcripts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  /* compute speaker stats */
  const speakerStats = useMemo(() => {
    if (!merged.length) return [];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const m of merged) {
      const words = m.text.split(/\s+/).filter(Boolean).length;
      counts[m.speaker] = (counts[m.speaker] || 0) + words;
      total += words;
    }
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const m of merged) {
      if (!seen.has(m.speaker)) { ordered.push(m.speaker); seen.add(m.speaker); }
    }
    return ordered.map((s, idx) => ({
      speaker: s,
      words: counts[s],
      pct: total > 0 ? Math.round((counts[s] / total) * 100) : 0,
      color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
      idx,
    }));
  }, [merged]);

  async function runAnalysis() {
    if (transcripts.length === 0) return;
    for (const transcript of transcripts) {
      await analyzeJob.start({
        type: "analyze",
        project_id: projectId,
        transcript_id: transcript.id,
      });
    }
  }

  useEffect(() => {
    if (analyzeJob.status === "completed") {
      router.push(`/project/${projectId}/analysis`);
    }
  }, [analyzeJob.status, projectId, router]);

  async function saveEdit(paragraphIdx: number, newText: string) {
    if (!active) return;
    setSaving(true);

    const updatedMerged = merged.map((m, i) =>
      i === paragraphIdx ? { ...m, text: newText } : m
    );
    const newFullText = updatedMerged.map((m) => m.text).join(" ");
    const newWordCount = newFullText.split(/\s+/).filter(Boolean).length;

    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_id: active.id,
        full_text: newFullText,
        word_count: newWordCount,
      }),
    });

    setTranscripts((prev) =>
      prev.map((t, i) =>
        i === activeIdx ? { ...t, full_text: newFullText, word_count: newWordCount } : t
      )
    );
    setEditingIdx(null);
    setSaving(false);
  }

  /* ── sync thumb position with scroll ────────────────────────── */
  useEffect(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!el || !thumb || !track) return;

    function syncThumb() {
      if (!el || !thumb || !track) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) { thumb.style.display = "none"; return; }
      thumb.style.display = "";
      const ratio = el.scrollTop / maxScroll;
      const trackH = track.clientHeight;
      const thumbH = 120;
      thumb.style.top = `${ratio * (trackH - thumbH)}px`;
    }

    el.addEventListener("scroll", syncThumb, { passive: true });
    syncThumb();
    const obs = new ResizeObserver(syncThumb);
    obs.observe(el);
    return () => { el.removeEventListener("scroll", syncThumb); obs.disconnect(); };
  }, [merged]);

  /* ── drag-to-scroll on thumb ───────────────────────────────── */
  useEffect(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    const track = trackRef.current;
    if (!el || !thumb || !track) return;

    let dragging = false;
    let startY = 0;
    let startScrollTop = 0;

    function onDown(e: MouseEvent) {
      dragging = true;
      startY = e.clientY;
      startScrollTop = el!.scrollTop;
      e.preventDefault();
    }
    function onMove(e: MouseEvent) {
      if (!dragging) return;
      const dy = e.clientY - startY;
      const maxScroll = el!.scrollHeight - el!.clientHeight;
      const trackH = track!.clientHeight;
      const thumbH = 120;
      const ratio = dy / (trackH - thumbH);
      el!.scrollTop = startScrollTop + ratio * maxScroll;

      // mouse glow
      const rect = thumb!.getBoundingClientRect();
      thumb!.style.setProperty("--mouse-x", String(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))));
      thumb!.style.setProperty("--mouse-y", String(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))));
    }
    function onUp() { dragging = false; }

    // Mouse glow on hover (non-drag)
    function onThumbMove(e: MouseEvent) {
      if (dragging) return;
      const rect = thumb!.getBoundingClientRect();
      thumb!.style.setProperty("--mouse-x", String(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))));
      thumb!.style.setProperty("--mouse-y", String(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))));
    }

    thumb.addEventListener("mousedown", onDown);
    thumb.addEventListener("mousemove", onThumbMove);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      thumb.removeEventListener("mousedown", onDown);
      thumb.removeEventListener("mousemove", onThumbMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [merged]);

  /* ── click-on-track to jump ────────────────────────────────── */
  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    function onClick(e: MouseEvent) {
      if ((e.target as HTMLElement).classList.contains("lq-thumb")) return;
      const rect = track!.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      const maxScroll = el!.scrollHeight - el!.clientHeight;
      el!.scrollTo({ top: ratio * maxScroll, behavior: "smooth" });
    }
    track.addEventListener("click", onClick);
    return () => track.removeEventListener("click", onClick);
  }, [merged]);

  /* ── loading / empty states ─────────────────────────────────── */
  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="transcript">
        <Spinner />
      </PageShell>
    );
  }

  if (transcripts.length === 0) {
    return (
      <PageShell projectId={projectId} currentStep="transcript">
        <EmptyState
          message="No transcripts yet."
          actionLabel="Upload Audio"
          onAction={() => router.push(`/project/${projectId}/upload`)}
        />
      </PageShell>
    );
  }

  /* ── determine when to show speaker labels in main content ──── */
  function shouldShowSpeaker(idx: number): boolean {
    if (idx === 0) return true;
    return merged[idx].speaker !== merged[idx - 1].speaker;
  }

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <PageShell projectId={projectId} currentStep="transcript">
      <style>{`
        @media (max-width: 768px) {
          .ds-transcript-layout { flex-direction: column !important; }
          .ds-transcript-layout > aside { width: 100% !important; min-width: 100% !important; height: auto !important; max-height: 300px !important; overflow-y: auto !important; }
          .ds-transcript-layout > div:last-child { flex: 1 !important; }
        }
      `}</style>
      <div className="ds-transcript-layout" style={{
        display: "flex",
        flex: 1,
        background: P.bg,
        overflow: "hidden",
      }}>

        {/* ═══════ LEFT SIDEBAR ═══════ */}
        <aside style={{
          width: 340,
          minWidth: 340,
          background: P.card,
          borderRight: `1px solid ${P.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* ── header ── */}
          <div style={{
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${P.border}`,
          }}>
            {/* logo + status row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{
                fontFamily: P.serif,
                fontSize: 16,
                fontWeight: 700,
                color: P.accent,
                letterSpacing: "0.02em",
              }}>
                D.&thinsp;scribe
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: P.accent,
                  background: "rgba(193,122,71,0.15)",
                  padding: "2px 10px",
                  borderRadius: 999,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                }}>
                  Draft
                </span>
                <span style={{ fontSize: 11, color: P.light, fontFamily: P.mono }}>
                  Saved
                </span>
              </div>
            </div>
            {/* project title */}
            <h2 style={{
              fontFamily: P.serif,
              fontSize: 20,
              fontWeight: 700,
              color: P.text,
              margin: 0,
              lineHeight: 1.3,
            }}>
              {active ? `Transcript ${activeIdx + 1}` : "Untitled"}
            </h2>
          </div>

          {/* ── scrollable middle ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 24px" }} className="no-scrollbar">

            {/* insights */}
            <div style={{ paddingTop: 20, paddingBottom: 16 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 12,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={P.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: P.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: P.sans,
                }}>
                  Insights
                </span>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}>
                {/* duration */}
                <div style={{
                  background: P.inputBg,
                  border: `1px solid ${P.border}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: P.light, fontFamily: P.mono, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    Duration
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: P.text, fontFamily: P.sans }}>
                    &mdash;
                  </div>
                </div>
                {/* word count */}
                <div style={{
                  background: P.inputBg,
                  border: `1px solid ${P.border}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: P.light, fontFamily: P.mono, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    Words
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: P.text, fontFamily: P.sans }}>
                    {active ? active.word_count.toLocaleString() : "0"}
                  </div>
                </div>
              </div>
            </div>

            {/* speakers */}
            {speakerStats.length > 0 && (
              <div style={{ paddingBottom: 20 }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 12,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={P.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: P.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontFamily: P.sans,
                  }}>
                    Speakers
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {speakerStats.map((s) => (
                    <div key={s.speaker} style={{
                      background: P.inputBg,
                      border: `1px solid ${P.border}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: s.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#fff",
                            fontFamily: P.mono,
                          }}>
                            {speakerInitial(s.speaker, s.idx)}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: P.text, fontFamily: P.sans }}>
                            {speakerLabel(s.speaker)}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: P.muted, fontFamily: P.mono }}>
                          {s.pct}%
                        </span>
                      </div>
                      {/* progress bar */}
                      <div style={{
                        height: 4,
                        borderRadius: 2,
                        background: "var(--ds-card-border)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${s.pct}%`,
                          background: s.color,
                          borderRadius: 2,
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* transcript selector (if multiple) */}
            {transcripts.length > 1 && (
              <div style={{ paddingBottom: 20 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: P.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontFamily: P.sans,
                  marginBottom: 8,
                }}>
                  Transcripts
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {transcripts.map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveIdx(i)}
                      style={{
                        background: i === activeIdx ? "rgba(193,122,71,0.15)" : "transparent",
                        border: "none",
                        borderRadius: 6,
                        padding: "8px 12px",
                        color: i === activeIdx ? P.accent : P.muted,
                        fontWeight: i === activeIdx ? 600 : 400,
                        fontSize: 13,
                        fontFamily: P.sans,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      Transcript {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── bottom CTA ── */}
          <div style={{
            padding: "16px 24px 20px",
            borderTop: `1px solid ${P.border}`,
          }}>
            <div style={{
              background: P.inputBg,
              border: `1px solid ${P.border}`,
              borderRadius: 10,
              padding: "16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={P.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: P.text,
                  fontFamily: P.sans,
                }}>
                  AI Analysis
                </span>
              </div>
              <p style={{
                fontSize: 12,
                color: P.muted,
                lineHeight: 1.5,
                margin: "0 0 12px",
                fontFamily: P.sans,
              }}>
                Extract voice patterns, themes, and structural insights from your transcript.
              </p>
              {analyzeJob.isRunning && (
                <div style={{ marginBottom: 10 }}>
                  <JobProgress
                    progress={analyzeJob.progress}
                    error={analyzeJob.error}
                    status={analyzeJob.status}
                  />
                </div>
              )}
              {analyzeJob.status === "failed" && (
                <div style={{ marginBottom: 10 }}>
                  <JobProgress
                    progress={null}
                    error={analyzeJob.error}
                    status="failed"
                    onRetry={runAnalysis}
                  />
                </div>
              )}
              <button
                onClick={runAnalysis}
                disabled={analyzeJob.isRunning}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: analyzeJob.isRunning ? "rgba(193,122,71,0.3)" : P.accent,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: P.sans,
                  cursor: analyzeJob.isRunning ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { if (!analyzeJob.isRunning) e.currentTarget.style.background = P.accentHover; }}
                onMouseLeave={(e) => { if (!analyzeJob.isRunning) e.currentTarget.style.background = P.accent; }}
              >
                {analyzeJob.isRunning ? "Analyzing..." : "Analyze Transcript"}
              </button>
            </div>
          </div>
        </aside>

        {/* ═══════ MAIN CONTENT ═══════ */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* styled native scrollbar */}
          <style>{`
            /* Hide native scrollbar but keep scroll functionality */
            .lq-scroll::-webkit-scrollbar { width: 0; display: none; }
            .lq-scroll { -ms-overflow-style: none; scrollbar-width: none; }

            /* Liquid glass track */
            .lq-track {
              position: absolute; top: 0; right: 0; width: 60px; height: 100%;
              display: flex; justify-content: center; pointer-events: none; z-index: 20;
            }
            .lq-track-line {
              position: absolute; top: 0; left: 50%; transform: translateX(-50%);
              width: 2px; height: 100%;
              background: linear-gradient(to bottom, transparent 0%, var(--ds-input-bg) 10%, var(--ds-input-bg) 90%, transparent 100%);
              border-radius: 2px;
            }
            .lq-thumb {
              position: absolute; left: 50%; width: 14px; height: 120px; margin-left: -7px;
              border-radius: 20px; pointer-events: auto; cursor: grab;
              background: linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.01) 100%);
              backdrop-filter: blur(16px) saturate(120%);
              -webkit-backdrop-filter: blur(16px) saturate(120%);
              box-shadow: inset 1px 1px 2px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
              transition: width 0.4s cubic-bezier(0.19,1,0.22,1), margin-left 0.4s cubic-bezier(0.19,1,0.22,1);
              will-change: top;
              --mouse-x: 0.5; --mouse-y: 0.5;
            }
            .lq-thumb::before {
              content: ''; position: absolute; inset: 0; border-radius: inherit;
              background: radial-gradient(circle at calc(var(--mouse-x) * 100%) calc(var(--mouse-y) * 100%), rgba(193,122,71,0.8) 0%, rgba(193,122,71,0.1) 40%, transparent 70%);
              mix-blend-mode: color-dodge; opacity: 0; transition: opacity 0.5s ease; pointer-events: none;
            }
            .lq-thumb:hover { width: 24px; margin-left: -12px; }
            .lq-thumb:hover::before { opacity: 1; }
            .lq-thumb:active { width: 18px; margin-left: -9px; cursor: grabbing;
              background: linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 100%);
            }
          `}</style>
          {/* scrollable transcript area */}
          <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
            <div
              ref={scrollRef}
              className="lq-scroll"
              style={{
                height: "100%",
                overflowY: "auto",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: "100%",
                  padding: "64px 48px 160px 48px",
                }}
              >
              {merged.length > 0
                ? merged.map((para, i) => {
                    const show = shouldShowSpeaker(i);
                    const colorIdx = speakerStats.findIndex((s) => s.speaker === para.speaker);
                    const color = SPEAKER_COLORS[(colorIdx >= 0 ? colorIdx : i) % SPEAKER_COLORS.length];

                    // 5-minute marker: show before this paragraph if it crosses a 5min boundary
                    const prevEnd = i > 0 ? merged[i - 1].start : 0;
                    const prevMarker = Math.floor(prevEnd / 300);
                    const currMarker = Math.floor(para.start / 300);
                    const show5minMarker = i > 0 && currMarker > prevMarker;
                    const markerMinutes = currMarker * 5;

                    return (
                      <div key={i}>
                      {show5minMarker && (
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                          padding: "16px 0 20px",
                          marginLeft: 80,
                          paddingLeft: 25,
                        }}>
                          <div style={{ height: 1, flex: 1, background: "rgba(193,122,71,0.2)" }} />
                          <span style={{
                            fontSize: 10,
                            fontFamily: P.mono,
                            fontWeight: 700,
                            color: P.accent,
                            textTransform: "uppercase",
                            letterSpacing: "0.15em",
                            padding: "4px 12px",
                            background: "rgba(193,122,71,0.08)",
                            borderRadius: 9999,
                            border: "1px solid rgba(193,122,71,0.15)",
                            whiteSpace: "nowrap",
                          }}>
                            {markerMinutes} min
                          </span>
                          <div style={{ height: 1, flex: 1, background: "rgba(193,122,71,0.2)" }} />
                        </div>
                      )}
                      <div style={{
                        display: "flex",
                        gap: 0,
                        position: "relative",
                      }}>
                        {/* left gutter: timestamp + speaker label */}
                        <div style={{
                          width: 80,
                          minWidth: 80,
                          paddingTop: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          paddingRight: 20,
                          position: "relative",
                        }}>
                          <span style={{
                            fontSize: 11,
                            fontFamily: P.mono,
                            color: P.light,
                            fontWeight: 500,
                            marginBottom: 2,
                          }}>
                            {formatTime(para.start)}
                          </span>
                          {show && (
                            <span style={{
                              fontSize: 10,
                              fontFamily: P.mono,
                              fontWeight: 600,
                              color: color,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}>
                              {speakerLabel(para.speaker)}
                            </span>
                          )}
                        </div>

                        {/* timeline line */}
                        <div style={{
                          width: 1,
                          background: P.border,
                          position: "relative",
                          marginRight: 24,
                          flexShrink: 0,
                        }}>
                          {/* dot at speaker change */}
                          {show && (
                            <div style={{
                              position: "absolute",
                              top: 6,
                              left: -3,
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: color,
                            }} />
                          )}
                        </div>

                        {/* text content */}
                        <div style={{
                          flex: 1,
                          paddingBottom: 24,
                          minWidth: 0,
                        }}>
                          {editingIdx === i ? (
                            <div>
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  minHeight: 200,
                                  maxHeight: 600,
                                  fontSize: "1.15rem",
                                  lineHeight: 1.8,
                                  color: P.text,
                                  background: P.inputBg,
                                  border: `1px solid ${P.accent}`,
                                  borderRadius: 8,
                                  padding: "14px 16px",
                                  outline: "none",
                                  resize: "vertical",
                                  fontFamily: P.serif,
                                }}
                              />
                              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                <button
                                  onClick={() => saveEdit(i, editText)}
                                  disabled={saving}
                                  style={{
                                    padding: "7px 20px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    fontFamily: P.sans,
                                    background: P.accent,
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 6,
                                    cursor: saving ? "not-allowed" : "pointer",
                                  }}
                                >
                                  {saving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingIdx(null)}
                                  style={{
                                    padding: "7px 20px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    fontFamily: P.sans,
                                    background: "transparent",
                                    color: P.muted,
                                    border: `1px solid ${P.border}`,
                                    borderRadius: 6,
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p
                              onClick={() => { setEditingIdx(i); setEditText(para.text); }}
                              style={{
                                fontSize: "1.15rem",
                                lineHeight: 1.8,
                                color: P.text,
                                margin: 0,
                                cursor: "text",
                                padding: "4px 8px",
                                borderRadius: 6,
                                transition: "background 0.15s",
                                whiteSpace: "pre-wrap",
                                fontFamily: P.serif,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = P.inputBg)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              {para.text}
                            </p>
                          )}
                        </div>
                      </div>
                      </div>
                    );
                  })
                : (
                  <p style={{
                    fontSize: "1.15rem",
                    lineHeight: 1.8,
                    color: P.text,
                    whiteSpace: "pre-wrap",
                    fontFamily: P.serif,
                  }}>
                    {active.full_text}
                  </p>
                )}
              </div>
            </div>
            {/* liquid glass track overlay */}
            <div ref={trackRef} className="lq-track" style={{ pointerEvents: "auto" }}>
              <div className="lq-track-line" />
              <div ref={thumbRef} className="lq-thumb" />
            </div>
          </div>

          {/* ═══════ BOTTOM AUDIO PLAYER BAR ═══════ */}
          <div style={{
            height: 96,
            minHeight: 96,
            background: P.card,
            borderTop: `1px solid ${P.border}`,
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            gap: 20,
          }}>
            {/* playback controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* rewind */}
              <button style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 6,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 19 2 12 11 5 11 19" />
                  <polygon points="22 19 13 12 22 5 22 19" />
                </svg>
              </button>
              {/* play */}
              <button style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: P.accent,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" stroke="none">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
              </button>
              {/* forward */}
              <button style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 6,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 19 22 12 13 5 13 19" />
                  <polygon points="2 19 11 12 2 5 2 19" />
                </svg>
              </button>
            </div>

            {/* time display */}
            <span style={{ fontSize: 12, fontFamily: P.mono, color: P.muted, minWidth: 40, textAlign: "right" }}>
              0:00
            </span>

            {/* waveform + scrubber */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
              {/* waveform bars */}
              <div style={{ display: "flex", alignItems: "end", gap: 2, height: 28 }}>
                {Array.from({ length: 80 }).map((_, i) => {
                  const jitter = ((i * 37) % 9);
                  const h = 6 + Math.sin(i * 0.4) * 10 + jitter;
                  return (
                    <div
                      key={i}
                      style={{
                        width: 3,
                        height: Math.max(4, h),
                        borderRadius: 1.5,
                        background: i < 0 ? P.accent : "var(--ds-input-border)",
                      }}
                    />
                  );
                })}
              </div>
              {/* scrubber */}
              <div style={{
                height: 3,
                borderRadius: 2,
                background: "var(--ds-card-border)",
                position: "relative",
                cursor: "pointer",
              }}>
                <div style={{
                  height: "100%",
                  width: "0%",
                  background: P.accent,
                  borderRadius: 2,
                }} />
                <div style={{
                  position: "absolute",
                  top: -4,
                  left: "0%",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: P.accent,
                  border: `2px solid ${P.bg}`,
                }} />
              </div>
            </div>

            {/* end time */}
            <span style={{ fontSize: 12, fontFamily: P.mono, color: P.light, minWidth: 40 }}>
              &mdash;
            </span>

            {/* speed + volume */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button style={{
                background: P.inputBg,
                border: `1px solid ${P.border}`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: P.mono,
                color: P.muted,
                cursor: "pointer",
              }}>
                1.5x
              </button>
              <button style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
