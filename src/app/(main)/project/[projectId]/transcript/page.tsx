"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Transcript, TranscriptSegment } from "@/types";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
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
/** A rendered paragraph, plus the raw-segment range it was built from.
 *  fromIdx/toIdx are what make an edit writable back into `segments` — without
 *  them the view was read-only in practice: edits went to full_text while the
 *  screen kept rendering the untouched segments. */
interface MergedParagraph {
  speaker: string;
  text: string;
  start: number;
  end: number;
  fromIdx: number;
  toIdx: number;
}

/** Merge consecutive same-speaker segments into paragraphs.
 *  Break on: speaker change, ">>" markers, or every ~30 seconds to keep timestamps visible. */
function mergeSegments(segments: TranscriptSegment[]): MergedParagraph[] {
  if (!segments?.length) return [];
  const BREAK_INTERVAL = 30; // seconds — create a new paragraph every ~30s
  const merged: MergedParagraph[] = [];
  let current: MergedParagraph = {
    speaker: segments[0].speaker,
    text: segments[0].text,
    start: segments[0].start,
    end: segments[0].end,
    fromIdx: 0,
    toIdx: 0,
  };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const timeSinceStart = seg.start - current.start;
    const hasLineBreak = seg.text.startsWith(">>") || current.text.endsWith(">>");
    const speakerChanged = seg.speaker !== current.speaker;
    const timeBreak = timeSinceStart >= BREAK_INTERVAL;

    if (speakerChanged || hasLineBreak || timeBreak) {
      merged.push({ ...current });
      current = {
        speaker: seg.speaker,
        text: seg.text.replace(/^>>\s*/, ""),
        start: seg.start,
        end: seg.end,
        fromIdx: i,
        toIdx: i,
      };
    } else {
      current.text += " " + seg.text;
      current.end = seg.end;
      current.toIdx = i;
    }
  }
  merged.push(current);

  return merged.map((m) => ({
    ...m,
    text: m.text.replace(/\s*>>\s*/g, "\n"),
  }));
}

/** Rebuild full_text from segments so the two copies can never disagree. */
function fullTextFromSegments(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text.trim()).filter(Boolean).join(" ");
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
  const [saving, setSaving] = useState(false);
  const [fullEditMode, setFullEditMode] = useState(false);
  const [fullEditText, setFullEditText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  /* Per-paragraph editing: index into `merged`, plus the working text. */
  const [editingPara, setEditingPara] = useState<number | null>(null);
  const [paraDraft, setParaDraft] = useState("");

  const active = transcripts[activeIdx] ?? null;
  // Plain computation, not useMemo: an optional-chained dependency defeats the
  // React Compiler ("existing memoization could not be preserved") and it
  // auto-memoizes this anyway.
  const merged = active?.segments ? mergeSegments(active.segments) : [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setTranscripts(data.transcripts || []);
        const uploads = data.audio_uploads || [];
        setIsTranscribing(uploads.some((u: { status: string }) => u.status === "transcribing"));
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

  /** PATCH segments + full_text + word_count together, then refresh from the server.
   *  Both text copies are always written from the SAME segment array, so the
   *  rendered view and the AI pipeline can never diverge again. */
  async function persistSegments(nextSegments: TranscriptSegment[]) {
    if (!active) return;
    const nextFullText = fullTextFromSegments(nextSegments);
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_id: active.id,
        segments: nextSegments,
        full_text: nextFullText,
        word_count: nextFullText.split(/\s+/).filter(Boolean).length,
      }),
    });
    const refreshed = await fetch(`/api/project/${projectId}`).then((r) => r.json());
    setTranscripts(refreshed.transcripts || []);
  }

  /** Save one edited paragraph back into the segments it was rendered from.
   *  A paragraph is a contiguous run of same-speaker segments, so the run
   *  collapses to a single segment spanning the same time window: the timeline
   *  stays honest at paragraph granularity, and only the edited paragraph
   *  loses its finer word timings. Empty text deletes the paragraph. */
  async function saveParagraph(paraIdx: number) {
    if (!active) return;
    const para = merged[paraIdx];
    if (!para) return;

    setSaving(true);
    const segments = active.segments || [];
    const trimmed = paraDraft.trim();
    const group = segments.slice(para.fromIdx, para.toIdx + 1);

    const replacement: TranscriptSegment[] = trimmed
      ? [{
          start: para.start,
          end: para.end,
          speaker: para.speaker,
          text: trimmed,
          // Word timings describe the ORIGINAL wording. Keep them only when the
          // text came back unchanged; a stale map is worse than none.
          ...(trimmed === para.text && group.length === 1 && group[0].words
            ? { words: group[0].words }
            : {}),
        }]
      : [];

    const nextSegments = [
      ...segments.slice(0, para.fromIdx),
      ...replacement,
      ...segments.slice(para.toIdx + 1),
    ];

    await persistSegments(nextSegments);
    setEditingPara(null);
    setParaDraft("");
    setSaving(false);
  }

  /** Whole-transcript editor. Rewrites segments as a single block so the two
   *  copies stay in sync (the old version wrote full_text only, which is why
   *  edits appeared to do nothing). */
  async function saveFullEdit() {
    if (!active) return;
    setSaving(true);
    const segments = active.segments || [];
    const trimmed = fullEditText.trim();
    // Blank lines are paragraph breaks. Each paragraph becomes its own segment
    // again (the old version collapsed EVERYTHING into one segment, which is why
    // an edited transcript turned into a single block with no way back).
    // Timing/speaker metadata carries by index; new paragraphs beyond the old
    // count inherit the last segment's metadata — coarser than word timings,
    // but the sectioned reading view survives the round trip.
    const paras = trimmed
      ? trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      : [];
    const last = segments[segments.length - 1];
    const nextSegments: TranscriptSegment[] = paras.map((text, i) => {
      const src = segments[i] ?? last;
      return {
        start: src?.start ?? i,
        end: src?.end ?? i + 1,
        speaker: src?.speaker ?? "Speaker 0",
        text,
      };
    });
    await persistSegments(nextSegments);
    setFullEditMode(false);
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

    function onDown(e: PointerEvent) {
      dragging = true;
      startY = e.clientY;
      startScrollTop = el!.scrollTop;
      e.preventDefault();
    }
    function onMove(e: PointerEvent) {
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
    function onThumbMove(e: PointerEvent) {
      if (dragging) return;
      const rect = thumb!.getBoundingClientRect();
      thumb!.style.setProperty("--mouse-x", String(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))));
      thumb!.style.setProperty("--mouse-y", String(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))));
    }

    // Pointer events so the custom scrollbar thumb also drags under touch;
    // touch-action: none stops the browser claiming the gesture for scroll.
    thumb.style.touchAction = "none";
    thumb.addEventListener("pointerdown", onDown);
    thumb.addEventListener("pointermove", onThumbMove);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      thumb.removeEventListener("pointerdown", onDown);
      thumb.removeEventListener("pointermove", onThumbMove);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
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
        {isTranscribing ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 24, padding: 40 }}>
            <div style={{ position: "relative", width: 64, height: 64 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{
                  position: "absolute",
                  bottom: 0,
                  left: i * 18,
                  width: 10,
                  height: 10 + i * 12,
                  background: P.accent,
                  borderRadius: 4,
                  opacity: 0.6 + i * 0.1,
                  animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite alternate`,
                }} />
              ))}
              <style>{`@keyframes pulse { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }`}</style>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: P.text, fontFamily: P.serif, marginBottom: 8 }}>
                Transcribing your audio...
              </div>
              <div style={{ fontSize: 14, color: P.muted, fontFamily: P.sans }}>
                This usually takes 1–2 minutes. This page will update automatically.
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            message="No transcripts yet."
            actionLabel="Upload Audio"
            onAction={() => router.push(`/project/${projectId}/upload`)}
          />
        )}
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
                          width: "100%",
                          transform: `scaleX(${s.pct / 100})`,
                          transformOrigin: "left",
                          background: s.color,
                          borderRadius: 2,
                          transition: "transform 0.4s ease",
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

            {/* Edit transcript button */}
            <div style={{ paddingBottom: 20 }}>
              <button
                onClick={() => {
                  // Build the editable text from SEGMENTS joined by blank lines,
                  // not full_text (which is space-joined for the AI pipeline and
                  // erases the paragraph structure the reader sees).
                  const paras = (active?.segments || [])
                    .map((s) => s.text.trim())
                    .filter(Boolean);
                  setFullEditText(paras.length ? paras.join("\n\n") : (active?.full_text || ""));
                  setFullEditMode(true);
                }}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: "transparent",
                  color: P.muted,
                  border: `1px solid ${P.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: P.sans,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = P.inputBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                Edit Transcript
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
          {fullEditMode ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "32px 48px", overflow: "auto" }}>
              {merged.length > 1 && (
                <p style={{
                  margin: "0 0 12px",
                  padding: "10px 14px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  fontFamily: P.sans,
                  color: P.muted,
                  background: "rgba(193,122,71,0.08)",
                  border: "1px solid rgba(193,122,71,0.25)",
                  borderRadius: 8,
                }}>
                  Editing the whole transcript here replaces the speaker labels and
                  timestamps with a single block. To keep them, close this and click
                  any paragraph to edit it on its own.
                </p>
              )}
              <textarea
                value={fullEditText}
                onChange={(e) => setFullEditText(e.target.value)}
                style={{
                  flex: 1,
                  width: "100%",
                  minHeight: 400,
                  fontSize: "1.1rem",
                  lineHeight: 1.8,
                  color: P.text,
                  background: P.inputBg,
                  border: `1px solid ${P.accent}`,
                  borderRadius: 12,
                  padding: "24px",
                  outline: "none",
                  resize: "none",
                  fontFamily: P.serif,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  onClick={saveFullEdit}
                  disabled={saving}
                  style={{
                    padding: "10px 28px",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: P.sans,
                    background: P.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setFullEditMode(false)}
                  style={{
                    padding: "10px 28px",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: P.sans,
                    background: "transparent",
                    color: P.muted,
                    border: `1px solid ${P.border}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
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

                        {/* text content — click to edit THIS paragraph */}
                        <div style={{
                          flex: 1,
                          paddingBottom: 24,
                          minWidth: 0,
                        }}>
                          {editingPara === i ? (
                            <div>
                              <textarea
                                value={paraDraft}
                                onChange={(e) => setParaDraft(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") { setEditingPara(null); setParaDraft(""); }
                                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveParagraph(i);
                                }}
                                rows={Math.max(3, Math.ceil(paraDraft.length / 80))}
                                style={{
                                  width: "100%",
                                  fontSize: "1.15rem",
                                  lineHeight: 1.8,
                                  color: P.text,
                                  fontFamily: P.serif,
                                  background: P.inputBg,
                                  border: `1px solid ${P.accent}`,
                                  borderRadius: 6,
                                  padding: "8px 10px",
                                  outline: "none",
                                  resize: "vertical",
                                  boxSizing: "border-box",
                                }}
                              />
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                                <button
                                  onClick={() => saveParagraph(i)}
                                  disabled={saving}
                                  style={{
                                    padding: "8px 18px",
                                    minHeight: 44,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    fontFamily: P.sans,
                                    background: P.accent,
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 8,
                                    cursor: saving ? "not-allowed" : "pointer",
                                  }}
                                >
                                  {saving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => { setEditingPara(null); setParaDraft(""); }}
                                  disabled={saving}
                                  style={{
                                    padding: "8px 18px",
                                    minHeight: 44,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    fontFamily: P.sans,
                                    background: "transparent",
                                    color: P.muted,
                                    border: `1px solid ${P.border}`,
                                    borderRadius: 8,
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                                <span style={{ fontSize: 11, color: P.light, fontFamily: P.sans }}>
                                  Clear the text to delete this paragraph
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p
                              onClick={() => { setEditingPara(i); setParaDraft(para.text); }}
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
          )}

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
