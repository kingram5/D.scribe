"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { setGenerationBusy } from "@/lib/generation-guard";
import { Chapter, Enrichment } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import JobProgress from "@/components/ui/JobProgress";
import { STATUS_COLORS } from "@/lib/constants";
import CelebrationToast from "@/components/ui/CelebrationToast";
import GenerationStage from "@/components/ui/GenerationStage";
import InkUpgradeModal from "@/components/ui/InkUpgradeModal";
import { useInkGuard } from "@/hooks/useInkGuard";
import InkTooltip from "@/components/ui/InkTooltip";

export default function GeneratePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  // Living page: streamed prose for the chapter currently being written.
  // The SSE stream is still consumed (it carries done/error and keeps the request
  // honest), but partial prose is never surfaced: D.Scribe only ever shows finished
  // chapters, in whole (Kyle 2026-08-09). Nothing accumulates the text client-side.
  const [loading, setLoading] = useState(true);
  const { showUpgrade, setShowUpgrade, guardedFetch } = useInkGuard();
  const [creativeFreedom, setCreativeFreedom] = useState(50);
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [enrichments, setEnrichments] = useState<Record<string, Enrichment[]>>({});
  const [enriching, setEnriching] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  // Client-orchestrated generate-all state (replaces single long-running job)
  const [genAllRunning, setGenAllRunning] = useState(false);
  const [applyingWordCount, setApplyingWordCount] = useState(false);
  const [dismissedWordCountFor, setDismissedWordCountFor] = useState<string | null>(null);
  const [genAllError, setGenAllError] = useState<string | null>(null);
  const [genAllResult, setGenAllResult] = useState<{ chapters_generated: number } | null>(null);
  const [genAllProgress, setGenAllProgress] = useState<{ step: string; current: number; total: number; message?: string } | null>(null);
  const [regenRunning, setRegenRunning] = useState(false);

  // Leave-guard: chapter generation is a long streaming run — losing the tab
  // mid-stream wastes the Ink already spent. PageShell turns this into an info
  // pill + a confirm on any step navigation; beforeunload covers tab close.
  useEffect(() => {
    setGenerationBusy(
      genAllRunning || regenRunning ? "Chapters are still generating" : null
    );
    return () => setGenerationBusy(null);
  }, [genAllRunning, regenRunning]);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [includeForeword, setIncludeForeword] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [inkEstimate, setInkEstimate] = useState<{ total_low: number; total_high: number; chapter_count: number; per_chapter?: number[] } | null>(null);

  // Are all chapters generated?
  const allGenerated = chapters.length > 0 && chapters.every((ch) => ch.status === "generated");
  const anyGenerated = chapters.some((ch) => ch.status === "generated");

  // Load foreword preference from localStorage
  useEffect(() => {
    if (!projectId) return;
    const stored = localStorage.getItem(`dscribe_foreword_${projectId}`);
    if (stored === "true") setIncludeForeword(true);
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const chs = data.chapters || [];
        setChapters(chs);
        if (chs.length > 0) setActiveChapter(chs[0].id);
        // #14 — restore the persisted Creative Freedom for this project (cross-device)
        if (typeof data.creative_freedom === "number") setCreativeFreedom(data.creative_freedom);
        setLoading(false);
        const hasUngenerated = chs.some((ch: { status: string }) => ch.status !== "generated");
        if (hasUngenerated) {
          fetch(`/api/ink/estimate?project_id=${projectId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((est) => {
              if (est && est.chapter_count > 0) setInkEstimate({ ...est, per_chapter: est.per_chapter });
            })
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  // Load existing enrichments from DB (no API calls to Claude)
  useEffect(() => {
    if (chapters.length === 0) return;
    fetch(`/api/enrich?project_id=${projectId}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((grouped) => {
        if (grouped && typeof grouped === "object") {
          setEnrichments(grouped as Record<string, Enrichment[]>);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.length]);

  async function fetchEnrichments(chapterId: string) {
    setEnriching(chapterId);
    setEnrichError(null);
    try {
      const res = await guardedFetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnrichments((prev) => ({ ...prev, [chapterId]: data }));
      } else if (res.status !== 402) {
        // 402 is handled by the upgrade modal via guardedFetch — skip it here
        const e = await res.json().catch(() => ({}));
        setEnrichError(e.error || `Couldn't find quotes (error ${res.status}). Try again.`);
      }
    } catch (err) {
      console.error("Enrichment error:", err);
      setEnrichError("Couldn't reach the server. Check your connection and try again.");
    }
    setEnriching(null);
  }

  async function toggleEnrichment(id: string, included: boolean) {
    await fetch("/api/enrich", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, included }),
    });
    setEnrichments((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map((e) =>
          e.id === id ? { ...e, included } : e
        );
      }
      return updated;
    });
  }

  // #14 — persist Creative Freedom on the project so it survives reloads / other
  // devices. Best-effort: if the column isn't migrated yet, this silently no-ops
  // and the slider falls back to its in-session value.
  function persistCreativeFreedom(value: number) {
    fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creative_freedom: value }),
    }).catch(() => {});
  }

  // Consume the /api/generate SSE response purely to await done/error. Text chunks are
  // deliberately discarded — the chapter becomes visible only once it is finished.
  async function streamGenerate(chapterId: string): Promise<void> {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: chapterId, creative_freedom: creativeFreedom }),
    });

    if (res.status === 402) { setShowUpgrade(true); throw new Error("out_of_ink"); }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error((e as { error?: string }).error || "Generation failed");
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return;
        try {
          const ev = JSON.parse(raw);
          // ev.chunk intentionally ignored — no partial prose reaches the UI.
          if (ev.done) return;
          if (ev.error) throw new Error(ev.error);
        } catch (parseErr) {
          // JSON.parse on a partial/heartbeat chunk throws SyntaxError — ignore.
          // A real error thrown above (ev.error) is not a SyntaxError — re-throw it.
          if (parseErr instanceof SyntaxError) continue;
          throw parseErr;
        }
      }
    }

    // Stream closed without ever sending a done/[DONE] event — the server was
    // killed mid-generation (timeout/crash) and never saved the chapter. Treat
    // as a failure so the chapter isn't falsely marked generated.
    throw new Error("Generation stopped before this chapter finished — retry to continue.");
  }

  async function generateAll() {
    const toGenerate = chapters.filter(ch => ch.status !== "generated");
    if (toGenerate.length === 0) return;

    setGenAllRunning(true);
    setGenAllError(null);
    setGenAllResult(null);

    const failed: string[] = [];
    try {
      const total = toGenerate.length;

      for (let i = 0; i < toGenerate.length; i++) {
        const ch = toGenerate[i];
        setGenAllProgress({ step: "generating", current: i + 1, total, message: `Writing chapter ${i + 1} of ${total}: ${ch.title}` });

        try {
          await streamGenerate(ch.id);
          setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, status: "generated" as const } : c));
        } catch (chErr) {
          // Out of Ink: stop the whole batch (upgrade modal already surfaced).
          if ((chErr as Error).message === "out_of_ink") throw chErr;
          // Any other failure: record it and keep going so one bad chapter
          // doesn't block the rest. Status stays un-generated → retryable.
          failed.push(`Ch ${ch.chapter_number}`);
        }
      }

      // If anything failed, skip the finishing passes and surface a retry prompt.
      // Re-running "Generate All" only re-attempts chapters that aren't generated.
      if (failed.length > 0) {
        setGenAllError(`${failed.length} of ${total} chapters didn't finish (${failed.join(", ")}). Hit "Generate All" again to retry just those.`);
      } else {
        // Coherence pass — direct call, synchronous
        setGenAllProgress({ step: "coherence", current: total, total, message: "Smoothing transitions between chapters..." });
        await fetch("/api/coherence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId }),
        }).catch(() => {/* non-fatal: coherence is best-effort */});

        // Foreword (optional) — direct call to /api/generate with type=foreword
        if (includeForeword) {
          setGenAllProgress({ step: "foreword", current: total, total, message: "Writing foreword..." });
          await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "foreword", project_id: projectId, creative_freedom: creativeFreedom, chapters: chapters.map(c => ({ title: c.title, summary: c.summary })) }),
          }).catch(() => {});
        }

        setGenAllResult({ chapters_generated: toGenerate.length });
        setShowCelebration(true);
      }

      const fresh = await fetch(`/api/project/${projectId}`);
      if (fresh.ok) { const d = await fresh.json(); setChapters(d.chapters || []); }
    } catch (err) {
      if ((err as Error).message !== "out_of_ink") {
        setGenAllError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setGenAllRunning(false);
      setGenAllProgress(null);
    }
  }

  async function regenerateChapter(chapterId: string) {
    // #15 — never overwrite existing content without an explicit confirmation.
    const ch = chapters.find((c) => c.id === chapterId);
    if (
      ch?.status === "generated" &&
      typeof window !== "undefined" &&
      !window.confirm(`"${ch.title || "This chapter"}" already has content. Regenerate and replace it? The current version is saved in history.`)
    ) {
      return;
    }
    setRegenRunning(true);
    setRegenError(null);
    try {
      await streamGenerate(chapterId);
      setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, status: "generated" as const } : c));
      // #15 — re-run the coherence pass so transitions stay smooth after a regenerate
      await fetch("/api/coherence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      }).catch(() => {});
    } catch (err) {
      if ((err as Error).message !== "out_of_ink") {
        setRegenError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      setRegenRunning(false);
    }
  }



  // Foreword toggle is just a flag — generation happens in "Generate All".
  // When all chapters are already generated, allow standalone foreword generation
  // via a direct metered call to /api/generate (mirrors the inline path above).
  const [forewordRunning, setForewordRunning] = useState(false);
  async function generateForewordOnly() {
    // #15 — if a foreword already exists, confirm before replacing it.
    const hasForeword = chapters.some((c) => c.chapter_number === 0);
    if (hasForeword && typeof window !== "undefined" &&
        !window.confirm("A foreword already exists. Regenerate and replace it?")) {
      return;
    }
    setForewordRunning(true);
    setGenAllError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "foreword",
          project_id: projectId,
          creative_freedom: creativeFreedom,
          regenerate: hasForeword,
          chapters: chapters.map((ch) => ({ title: ch.title, summary: ch.summary })),
        }),
      });
      if (res.status === 402) { setShowUpgrade(true); return; }
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Foreword generation failed" }));
        throw new Error((e as { error?: string }).error || "Foreword generation failed");
      }
      // Refresh so the new foreword (chapter_number 0) shows up in the list.
      const fresh = await fetch(`/api/project/${projectId}`);
      if (fresh.ok) { const d = await fresh.json(); setChapters(d.chapters || []); }
    } catch (err) {
      setGenAllError(err instanceof Error ? err.message : "Foreword generation failed");
    } finally {
      setForewordRunning(false);
    }
  }

  // Generation progress derived values
  const genCurrent = genAllProgress?.current ?? 0;
  const genTotal = genAllProgress?.total ?? chapters.length;
  const genStep = genAllProgress?.step;
  const genRemaining = Math.max(0, genTotal - genCurrent);
  const genEstMin = Math.ceil((genRemaining * 35 + (genStep === "coherence" ? 0 : 60)) / 60);
  const genIsCoherence = genStep === "coherence";
  const genProgressMessage = genAllProgress?.message ?? (genCurrent > 0 ? `Chapter ${genCurrent} printing...` : "Starting generation...");

  const freedomLabel =
    creativeFreedom <= 30
      ? "Faithful"
      : creativeFreedom <= 70
        ? "Balanced"
        : "Creative";

  const freedomDescription =
    creativeFreedom <= 20
      ? "Sticks closely to your exact words and phrasing"
      : creativeFreedom <= 40
        ? "Follows your ideas with light editorial polish"
        : creativeFreedom <= 60
          ? "Balances your voice with book-quality writing"
          : creativeFreedom <= 80
            ? "Takes creative liberties while preserving your message"
            : "Freely expands and reinterprets your ideas";

  const freedomBadgeBg =
    creativeFreedom <= 33
      ? "rgba(52,211,153,0.15)"
      : creativeFreedom <= 66
        ? "rgba(255,215,0,0.15)"
        : "rgba(193,122,71,0.15)";

  const freedomBadgeColor =
    creativeFreedom <= 33
      ? "#34d399"
      : creativeFreedom <= 66
        ? "#ffd700"
        : "#C17A47";

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="generate">
        <Spinner />
      </PageShell>
    );
  }

  if (chapters.length === 0) {
    return (
      <PageShell projectId={projectId} currentStep="generate">
        <EmptyState
          message="No chapters yet. The outline surfaces from Analysis."
          actionLabel="Create Outline"
          onAction={() => router.push(`/project/${projectId}/analysis`)}
        />
      </PageShell>
    );
  }

  const active = chapters.find((ch) => ch.id === activeChapter);
  const chapterEnrichments = activeChapter ? enrichments[activeChapter] || [] : [];
  const activeGenCh = activeChapter ? chapters.find((c) => c.id === activeChapter) : null;
  const recommendedQuotes = activeGenCh ? Math.max(1, Math.min(6, Math.round((activeGenCh.target_word_count || 1500) / 750))) : 0;
  const selectedQuoteCount = chapterEnrichments.filter((e) => e.included).length;

  /* Word-count suggestion — 750 words of room per selected quote, rounded to the nearest
     100, and only offered when it is a meaningful jump (>=250 words) over the current
     target. Returns null when there is nothing worth suggesting. */
  const wordCountSuggestion = (() => {
    if (!activeGenCh || dismissedWordCountFor === activeChapter) return null;
    if (selectedQuoteCount <= recommendedQuotes) return null;
    const current = activeGenCh.target_word_count || 1500;
    const proposed = Math.round((selectedQuoteCount * 750) / 100) * 100;
    return proposed - current >= 250 ? proposed : null;
  })();

  async function applyWordCountSuggestion(words: number) {
    if (!activeChapter) return;
    setApplyingWordCount(true);
    try {
      const res = await fetch(`/api/project/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: activeChapter, target_word_count: words }),
      });
      if (res.ok) {
        setChapters((prev) => prev.map((c) => (c.id === activeChapter ? { ...c, target_word_count: words } : c)));
      }
    } catch { /* leave the chip up so the author can retry */ }
    setApplyingWordCount(false);
  }
  const isGenerating = genAllRunning || regenRunning;

  const ungeneratedCount = chapters.filter(ch => ch.status !== "generated").length;
  const estimatedSeconds = ungeneratedCount * 45;
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  const activeIdx = chapters.findIndex(ch => ch.id === activeChapter);
  const nextChapter = activeIdx >= 0 && activeIdx < chapters.length - 1 ? chapters[activeIdx + 1] : null;

  return (
    <PageShell
      projectId={projectId}
      currentStep="generate"
      disabledStepKeys={!anyGenerated || isGenerating ? ["editor"] : []}
    >
      <GenerationStage
        open={isGenerating}
        coherence={genIsCoherence}
        progressLabel={
          genIsCoherence
            ? "Smoothing transitions across the manuscript"
            : genTotal > 0
              ? `Chapter ${Math.min(genCurrent + 1, genTotal)} of ${genTotal}`
              : undefined
        }
        progress={genTotal > 0 ? genCurrent / genTotal : undefined}
      />
      <div className="ds-pipeline-grid" style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        gap: 24,
        padding: "0 40px 40px",
        overflowY: "auto",
        flex: 1,
      }}>
        {/* Left sidebar: chapter list — lined paper card */}
        <div className="lined-paper" data-tut="generate-chapters" style={{ alignSelf: "start", transform: "rotate(-0.5deg)" }}>
          <div className="scribble" style={{ top: 12, right: 15, transform: "rotate(8deg)" }}>
            {allGenerated ? "All done!" : "Writing..."}
          </div>
          <h2 className="lined-paper-title">Chapters</h2>
          <div className="handwritten-note">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {chapters.map((ch) => {
                const isActive = ch.id === activeChapter;
                const statusColor = STATUS_COLORS[ch.status] || "#A39B7D";
                return (
                  <div
                    key={ch.id}
                    onClick={() => setActiveChapter(ch.id)}
                    style={{
                      cursor: "pointer",
                      padding: "6px 8px",
                      borderRadius: 4,
                      background: isActive ? "rgba(193, 122, 71, 0.1)" : "transparent",
                      textDecoration: isActive ? "underline" : "none",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "1.2rem" }}>{isActive ? "→" : "•"}</span>
                      <span style={{ fontSize: "1.1rem" }}>Ch {ch.chapter_number}: {ch.title}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
                      <span style={{ fontSize: "0.8rem", color: "#7A7358" }}>{ch.target_word_count}w</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: chapter detail */}
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <GlassCard style={{ padding: 32 }}>
              {/* Foreword toggle */}
              <div data-tut="generate-foreword" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                background: includeForeword ? "var(--ds-input-bg)" : "var(--ds-card-bg)",
                border: "1px solid var(--ds-card-border)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 24,
                transition: "all 0.15s",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Include Foreword
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                    AI-generated intro chapter previewing the topics ahead
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {allGenerated && includeForeword && (
                    <button
                      onClick={generateForewordOnly}
                      disabled={forewordRunning}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "5px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "var(--ds-accent-500, #C17A47)",
                        color: "#fff",
                        cursor: forewordRunning ? "wait" : "pointer",
                        fontFamily: "var(--font-manrope), sans-serif",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {forewordRunning ? "Writing..." : "Generate Foreword"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const next = !includeForeword;
                      setIncludeForeword(next);
                      localStorage.setItem(`dscribe_foreword_${projectId}`, String(next));
                    }}
                    disabled={forewordRunning}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      cursor: forewordRunning ? "wait" : "pointer",
                      background: includeForeword ? "#C17A47" : "var(--ds-input-border)",
                      position: "relative",
                      transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "white",
                      position: "absolute",
                      top: 3,
                      left: includeForeword ? 23 : 3,
                      transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              </div>

              {/* Slider */}
              <div data-tut="generate-freedom" style={{ marginBottom: 24 }}>
                <style>{`
                  .ds-freedom-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    background: linear-gradient(to right, #34d399, #ffd700, #C17A47);
                    outline: none;
                    cursor: pointer;
                  }
                  .ds-freedom-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: var(--text-primary);
                    border: 2px solid var(--ds-input-border);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    cursor: pointer;
                    transition: box-shadow 0.15s;
                  }
                  .ds-freedom-slider::-webkit-slider-thumb:hover {
                    box-shadow: 0 2px 12px rgba(0,0,0,0.5);
                  }
                  .ds-freedom-slider::-moz-range-thumb {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: var(--text-primary);
                    border: 2px solid var(--ds-input-border);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    cursor: pointer;
                  }
                  .ds-freedom-slider::-moz-range-track {
                    height: 6px;
                    border-radius: 3px;
                    background: linear-gradient(to right, #34d399, #ffd700, #C17A47);
                  }
                `}</style>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    Creative Freedom
                  </span>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: freedomBadgeColor,
                    background: freedomBadgeBg,
                    padding: "4px 12px",
                    borderRadius: 20,
                    letterSpacing: "0.02em",
                  }}>
                    {freedomLabel} — {creativeFreedom}%
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Microphone icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={creativeFreedom}
                    onChange={(e) => setCreativeFreedom(parseInt(e.target.value))}
                    onMouseUp={(e) => persistCreativeFreedom(parseInt((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => persistCreativeFreedom(parseInt((e.target as HTMLInputElement).value))}
                    onKeyUp={(e) => persistCreativeFreedom(parseInt((e.target as HTMLInputElement).value))}
                    className="ds-freedom-slider"
                  />
                  {/* Quill/pen icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(193,122,71,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                    <line x1="16" y1="8" x2="2" y2="22" />
                    <line x1="17.5" y1="15" x2="9" y2="15" />
                  </svg>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>Faithful to transcript</span>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>Freely interpreted</span>
                </div>
                <div style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginTop: 8,
                  textAlign: "center",
                  fontStyle: "italic",
                }}>
                  {freedomDescription}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "var(--ds-card-border)", marginBottom: 24 }} />

              {!allGenerated && inkEstimate && (
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 9999,
                  background: "rgba(193,122,71,0.08)",
                  border: "1px solid rgba(193,122,71,0.2)",
                  marginBottom: 20,
                }}>
                  <svg width="13" height="16" viewBox="0 0 13 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.5 0C6.5 0 1 6.5 1 10.5C1 13.537 3.463 16 6.5 16C9.537 16 12 13.537 12 10.5C12 6.5 6.5 0Z" fill="#C17A47" opacity="0.9" />
                  </svg>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#C17A47",
                    fontFamily: "var(--font-manrope), sans-serif",
                  }}>
                    ~{inkEstimate.total_low}–{inkEstimate.total_high} Ink to generate {inkEstimate.chapter_count} chapter{inkEstimate.chapter_count !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* The chapter plate. Partial prose is NEVER rendered (Kyle 2026-08-09: the
                  site only ever produces finished chapters in whole) — while a chapter is
                  being written the GenerationStage owns the screen, and the finished text
                  appears in the Editor. */}
              <div style={{
                background: "#FDFCF8",
                border: "1px solid var(--ds-card-border)",
                borderRadius: 6,
                boxShadow: "0 8px 28px rgba(44,36,25,0.1)",
                padding: "28px 34px 30px",
                marginBottom: 24,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22 }}>
                  <span className="ds-stamp" style={{ color: "var(--text-tertiary)" }}>
                    Chapter {active.chapter_number}
                  </span>
                  <span className="ds-stamp" style={{ color: "#C17A47" }}>
                    {active.status === "generated" || active.status === "edited" ? "Drafted" : "Outlined"}
                  </span>
                </div>
                <h2 style={{ fontSize: 26, fontWeight: 500, color: "var(--text-primary)", marginBottom: 14, fontFamily: "var(--font-lora), serif" }}>
                  {active.title}
                </h2>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  {active.summary}
                  {active.status !== "generated" && active.status !== "edited" && (
                    <span style={{ display: "block", marginTop: 10, fontStyle: "italic", color: "var(--text-tertiary)" }}>
                      This chapter is outlined and ready to become prose.
                    </span>
                  )}
                </p>
              </div>

              {/* Enrichment quotes — interactive */}
              <div data-tut="generate-quotes" style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <PanelTitle>Enrichment Quotes</PanelTitle>
                  {chapterEnrichments.length > 0 && (
                    <InkTooltip label="~0.5 Ink to fetch a fresh set of quotes" position="top">
                      {/* Was a near-invisible ghost button reading "Refresh" (Kyle's note 9):
                          accent-outlined, labelled with what it actually does, icon-led. */}
                      <button
                        onClick={() => activeChapter && fetchEnrichments(activeChapter)}
                        disabled={enriching === activeChapter}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: enriching === activeChapter ? "var(--text-tertiary)" : "#A05526",
                          background: enriching === activeChapter ? "transparent" : "rgba(193,122,71,0.1)",
                          border: `1px solid ${enriching === activeChapter ? "var(--ds-input-border)" : "rgba(193,122,71,0.5)"}`,
                          borderRadius: 9999,
                          padding: "8px 16px",
                          cursor: enriching === activeChapter ? "wait" : "pointer",
                          fontFamily: "var(--font-manrope), sans-serif",
                          transition: "background 0.15s, border-color 0.15s, color 0.15s",
                        }}
                      >
                        <svg
                          width="13" height="13" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                          className={enriching === activeChapter ? "ds-spin" : undefined}
                          aria-hidden="true"
                        >
                          <path d="M21 2v6h-6" />
                          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                          <path d="M3 22v-6h6" />
                          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                        {enriching === activeChapter ? "Finding quotes..." : "New quotes"}
                      </button>
                    </InkTooltip>
                  )}
                </div>
                {chapterEnrichments.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
                      Suggested <strong>~{recommendedQuotes}</strong> for a chapter this length — pick your favorites.{" "}
                      <span style={{ color: selectedQuoteCount > recommendedQuotes ? "#E0A35D" : "var(--text-tertiary)" }}>
                        {selectedQuoteCount} selected{selectedQuoteCount > recommendedQuotes ? " (a few more than suggested)" : ""}.
                      </span>
                    </p>

                    {/* Word-count suggestion (Kyle's note 10). A CHIP, never an auto-adjust:
                        more quotes than the length recommends means the chapter needs more
                        room, but the number stays the author's to set. */}
                    {wordCountSuggestion !== null && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                        padding: "10px 14px",
                        marginBottom: 4,
                        borderRadius: 10,
                        background: "rgba(193,122,71,0.08)",
                        border: "1px solid rgba(193,122,71,0.3)",
                      }}>
                        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {selectedQuoteCount} quotes selected. Give this chapter room to hold them:{" "}
                          <strong style={{ color: "#A05526" }}>
                            {activeGenCh?.target_word_count?.toLocaleString()} → {wordCountSuggestion.toLocaleString()} words
                          </strong>?
                        </span>
                        <span style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                          <button
                            type="button"
                            onClick={() => applyWordCountSuggestion(wordCountSuggestion)}
                            disabled={applyingWordCount}
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              fontFamily: "var(--font-manrope), sans-serif",
                              color: "#241D14",
                              background: "#C17A47",
                              border: "none",
                              borderRadius: 9999,
                              padding: "7px 15px",
                              cursor: applyingWordCount ? "wait" : "pointer",
                            }}
                          >
                            {applyingWordCount ? "Updating..." : "Use it"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDismissedWordCountFor(activeChapter)}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: "var(--font-manrope), sans-serif",
                              color: "var(--text-tertiary)",
                              background: "transparent",
                              border: "1px solid var(--ds-input-border)",
                              borderRadius: 9999,
                              padding: "7px 13px",
                              cursor: "pointer",
                            }}
                          >
                            Keep as is
                          </button>
                        </span>
                      </div>
                    )}
                    {chapterEnrichments.map((e) => (
                      <div
                        key={e.id}
                        onClick={() => toggleEnrichment(e.id, !e.included)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: 12,
                          borderRadius: "var(--radius-sm)",
                          borderLeft: `3px solid ${e.included ? "rgba(193,122,71,0.6)" : "var(--ds-input-bg)"}`,
                          background: e.included ? "rgba(193,122,71,0.06)" : "var(--ds-input-bg)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          opacity: e.included ? 1 : 0.5,
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2,
                          border: e.included ? "2px solid #C17A47" : "2px solid var(--ds-input-border)",
                          background: e.included ? "#C17A47" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}>
                          {e.included && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontStyle: "italic", color: "var(--text-secondary)", marginBottom: 4 }}>
                            &ldquo;{e.quote_text}&rdquo;
                          </p>
                          <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            — {e.source_author}, <em>{e.source_title}</em>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <InkTooltip label="~0.5 Ink to find quotes" position="top">
                  <button
                    onClick={() => activeChapter && fetchEnrichments(activeChapter)}
                    disabled={enriching === activeChapter}
                    style={{
                      width: "100%",
                      padding: "20px 24px",
                      background: enriching === activeChapter ? "rgba(193,122,71,0.15)" : "rgba(193,122,71,0.1)",
                      border: "1px solid rgba(193,122,71,0.25)",
                      borderRadius: 12,
                      cursor: enriching === activeChapter ? "wait" : "pointer",
                      fontFamily: "var(--font-manrope), sans-serif",
                      transition: "all 0.2s",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    {enriching === activeChapter ? (
                      <>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          border: "3px solid rgba(193,122,71,0.3)",
                          borderTopColor: "#C17A47",
                          animation: "spin 0.8s linear infinite",
                        }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#C17A47" }}>
                          Finding enrichment quotes...
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          Searching for quotes that support this chapter
                        </span>
                      </>
                    ) : (
                      <>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C17A47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                          <path d="M11 8v6" /><path d="M8 11h6" />
                        </svg>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#C17A47" }}>
                          Find Enrichment Quotes
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          Discover supporting quotes to strengthen this chapter
                        </span>
                      </>
                    )}
                  </button>
                  </InkTooltip>
                )}
                {enrichError && (
                  <p style={{ fontSize: 12, color: "#dc2626", marginTop: 10, textAlign: "center" }}>{enrichError}</p>
                )}
              </div>

              {/* Generate All progress */}
              {genAllRunning && (
                <div style={{ marginBottom: 16 }}>
                  {/* Stay-on-page notice */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    background: "rgba(99,102,241,0.07)",
                    border: "1px solid rgba(99,102,241,0.18)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: 8,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#6366f1", fontFamily: "var(--font-manrope), sans-serif" }}>
                      Keep this page open while writing
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif", marginLeft: "auto" }}>
                      ~{estimatedMinutes} min remaining
                    </span>
                  </div>
                  <div style={{
                    padding: "14px 18px",
                    background: "var(--ds-input-bg)",
                    border: "1px solid var(--ds-card-border)",
                    borderRadius: "var(--radius-sm)",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                      {genProgressMessage}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{
                        height: 4,
                        background: "var(--ds-card-border)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          background: "#C17A47",
                          borderRadius: 2,
                          width: `${(genCurrent / Math.max(genTotal, 1)) * 100}%`,
                          transition: "width 0.5s ease",
                        }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {genIsCoherence ? "Final pass" : `${genCurrent} of ${genTotal} chapters`}
                        </span>
                        {genEstMin > 0 && !genIsCoherence && (
                          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            Est. ~{genEstMin} min remaining
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {genAllError && !genAllRunning && (
                <div style={{ marginBottom: 16 }}>
                  <JobProgress
                    progress={null}
                    error={genAllError}
                    status="failed"
                    onRetry={generateAll}
                  />
                </div>
              )}

              {/* Regenerate progress */}
              {regenRunning && (
                <div style={{ marginBottom: 16 }}>
                  <JobProgress progress={null} error={null} status="running" />
                </div>
              )}
              {regenError && !regenRunning && (
                <div style={{ marginBottom: 16 }}>
                  <JobProgress
                    progress={null}
                    error={regenError}
                    status="failed"
                    onRetry={() => regenerateChapter(active.id)}
                  />
                </div>
              )}

              {/* Footer buttons — Next Chapter (left) | Generate Chapter (center) | Generate All (right) */}
              <div data-tut="generate-actions" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                {/* Left: Next Chapter navigation */}
                <button
                  onClick={() => nextChapter && setActiveChapter(nextChapter.id)}
                  disabled={!nextChapter || isGenerating}
                  className="nodum-btn"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--ds-card-border)",
                    color: "var(--text-secondary)",
                    opacity: !nextChapter ? 0.3 : 1,
                  }}
                >
                  Next Chapter →
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  {/* Center: Generate this chapter */}
                  <InkTooltip
                    label={inkEstimate && inkEstimate.per_chapter
                      ? `~${inkEstimate.per_chapter[chapters.findIndex(c => c.id === active.id)] ?? Math.round((inkEstimate.total_low + inkEstimate.total_high) / 2 / inkEstimate.chapter_count * 10) / 10} Ink`
                      : "~5–7 Ink"}
                    position="top"
                  >
                    <button
                      onClick={() => regenerateChapter(active.id)}
                      disabled={isGenerating}
                      className="nodum-btn"
                      style={{ background: "rgba(193,122,71,0.15)", border: "1px solid rgba(193,122,71,0.4)", color: "#C17A47" }}
                    >
                      {regenRunning
                        ? "Writing..."
                        : active.status === "generated"
                          ? "Regenerate"
                          : "Generate Chapter"}
                    </button>
                  </InkTooltip>

                  {/* Right: Generate All */}
                  <InkTooltip
                    label={inkEstimate
                      ? `~${inkEstimate.total_low}–${inkEstimate.total_high} Ink for all ${inkEstimate.chapter_count} chapters`
                      : "Ink cost calculated before generating"}
                    position="top"
                  >
                    <button
                      onClick={generateAll}
                      disabled={isGenerating}
                      className="nodum-btn"
                    >
                      {genAllRunning
                        ? "Generating..."
                        : `Generate All ${chapters.length} Chapters`}
                    </button>
                  </InkTooltip>
                </div>
              </div>

              {/* Generate All completed summary */}
              {genAllResult && !genAllRunning && (
                <div style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "rgba(52,211,153,0.1)",
                  border: "1px solid rgba(5,150,105,0.15)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  color: "#059669",
                }}>
                  All {genAllResult.chapters_generated} chapters generated with coherence pass applied. Your manuscript is taking shape — nicely done.
                </div>
              )}

              {/* Review & Edit link — shown when any chapter is generated */}
              {anyGenerated && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => { if (!isGenerating) router.push(`/project/${projectId}/editor`); }}
                    className={`nodum-btn${allGenerated && !isGenerating ? " ds-cta-pulse" : ""}`}
                    disabled={isGenerating}
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      opacity: isGenerating ? 0.4 : 1,
                      cursor: isGenerating ? "not-allowed" : "pointer",
                    }}
                  >
                    Review &amp; Edit Manuscript →
                  </button>
                </div>
              )}
            </GlassCard>
          </div>
        )}
      </div>
      <CelebrationToast
        show={showCelebration}
        message="The manuscript is written. Now make every line more yours."
        onDone={() => setShowCelebration(false)}
      />
      {showUpgrade && <InkUpgradeModal onClose={() => setShowUpgrade(false)} />}
    </PageShell>
  );
}
