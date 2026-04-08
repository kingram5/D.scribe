"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chapter, Enrichment } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import MenuSection from "@/components/ui/MenuSection";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import JobProgress from "@/components/ui/JobProgress";
import { useJob } from "@/hooks/useJob";
import { STATUS_COLORS } from "@/lib/constants";
import CelebrationToast from "@/components/ui/CelebrationToast";

export default function GeneratePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [creativeFreedom, setCreativeFreedom] = useState(50);
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [enrichments, setEnrichments] = useState<Record<string, Enrichment[]>>({});
  const [enriching, setEnriching] = useState<string | null>(null);
  const generateAllJob = useJob<{ chapters_generated: number; coherence_applied: boolean }>();
  const regenerateJob = useJob();
  const forewordJob = useJob();
  const [includeForeword, setIncludeForeword] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // Are all chapters generated?
  const allGenerated = chapters.length > 0 && chapters.every((ch) => ch.status === "generated");
  const anyGenerated = chapters.some((ch) => ch.status === "generated");

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const chs = data.chapters || [];
        setChapters(chs);
        if (chs.length > 0) setActiveChapter(chs[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  // Load existing enrichments (read-only — editing happens on the Outline page)
  useEffect(() => {
    if (chapters.length === 0) return;
    chapters.forEach((ch) => {
      fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: ch.id }),
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            setEnrichments((prev) => ({ ...prev, [ch.id]: data }));
          }
        })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.length]);

  async function fetchEnrichments(chapterId: string) {
    setEnriching(chapterId);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnrichments((prev) => ({ ...prev, [chapterId]: data }));
      } else {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { errMsg = JSON.parse(text).error || errMsg; } catch { errMsg = text.slice(0, 200) || errMsg; }
        console.error("Enrichment failed:", res.status, text);
        alert(`Enrichment failed: ${errMsg}`);
      }
    } catch (err) {
      console.error("Enrichment error:", err);
      alert("Enrichment request failed — check console for details");
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

  async function generateAll() {
    await generateAllJob.start({
      type: "generate-all",
      project_id: projectId,
      creative_freedom: creativeFreedom,
    });
  }

  async function regenerateChapter(chapterId: string) {
    await regenerateJob.start({
      type: "generate",
      project_id: projectId,
      chapter_id: chapterId,
      creative_freedom: creativeFreedom,
    });
  }

  // Update chapter statuses when generate-all completes
  useEffect(() => {
    if (generateAllJob.status === "completed") {
      // Refresh chapters from server
      fetch(`/api/project/${projectId}`)
        .then((r) => r.json())
        .then((data) => {
          const chs = data.chapters || [];
          setChapters(chs);
        });
      setShowCelebration(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateAllJob.status]);

  // Update chapter status when regenerate job completes
  useEffect(() => {
    if (regenerateJob.status === "completed") {
      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === activeChapter ? { ...ch, status: "generated" as const } : ch
        )
      );
      regenerateJob.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerateJob.status]);

  async function generateForeword() {
    await forewordJob.start({
      type: "generate",
      project_id: projectId,
      generate_type: "foreword",
      creative_freedom: creativeFreedom,
      chapters: chapters.map((ch) => ({ title: ch.title, summary: ch.summary })),
    });
  }

  useEffect(() => {
    if (forewordJob.status === "completed") {
      setIncludeForeword(true);
      forewordJob.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forewordJob.status]);

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
          message="No chapters outlined yet."
          actionLabel="Create Outline"
          onAction={() => router.push(`/project/${projectId}/analysis`)}
        />
      </PageShell>
    );
  }

  const active = chapters.find((ch) => ch.id === activeChapter);
  const chapterEnrichments = activeChapter ? enrichments[activeChapter] || [] : [];
  const isGenerating = generateAllJob.isRunning || regenerateJob.isRunning;

  return (
    <PageShell projectId={projectId} currentStep="generate">
      <div className="ds-pipeline-grid" style={{
        display: "grid",
        gridTemplateColumns: "340px 1fr",
        gap: 24,
        padding: "0 40px 40px",
        overflowY: "auto",
        flex: 1,
      }}>
        {/* Left sidebar: chapter list — lined paper card */}
        <div className="lined-paper" style={{ alignSelf: "start", transform: "rotate(-0.5deg)" }}>
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
              <div style={{
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
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {includeForeword && !forewordJob.isRunning && (
                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>Generated</span>
                  )}
                  {forewordJob.isRunning && (
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>Writing...</span>
                  )}
                  <button
                    onClick={() => {
                      if (!includeForeword) {
                        generateForeword();
                      } else {
                        setIncludeForeword(false);
                      }
                    }}
                    disabled={forewordJob.isRunning}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      cursor: forewordJob.isRunning ? "wait" : "pointer",
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
              <div style={{ marginBottom: 24 }}>
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

              {/* Chapter info */}
              <div style={{ fontSize: 10, fontFamily: "var(--font-manrope), sans-serif", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.12em", marginBottom: 8 }}>
                CHAPTER {active.chapter_number}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8, fontFamily: "var(--font-lora), serif" }}>
                {active.title}
              </h2>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>{active.summary}</p>

              {/* Enrichment quotes — interactive */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <PanelTitle>Enrichment Quotes</PanelTitle>
                  {chapterEnrichments.length > 0 && (
                    <button
                      onClick={() => activeChapter && fetchEnrichments(activeChapter)}
                      disabled={enriching === activeChapter}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: enriching === activeChapter ? "var(--text-tertiary)" : "var(--text-secondary)",
                        background: "none",
                        border: "1px solid var(--ds-input-bg)",
                        borderRadius: 8,
                        padding: "6px 14px",
                        cursor: enriching === activeChapter ? "wait" : "pointer",
                        fontFamily: "var(--font-manrope), sans-serif",
                        transition: "all 0.15s",
                      }}
                    >
                      {enriching === activeChapter ? "Refreshing..." : "Refresh"}
                    </button>
                  )}
                </div>
                {chapterEnrichments.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                )}
              </div>

              {/* Generate All progress */}
              {generateAllJob.isRunning && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    padding: "14px 18px",
                    background: "var(--ds-input-bg)",
                    border: "1px solid var(--ds-card-border)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: 8,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                      {(generateAllJob.progress as { message?: string })?.message || "Generating..."}
                    </div>
                    {generateAllJob.progress && (
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
                            width: `${((generateAllJob.progress as { current?: number; total?: number }).current || 0) / ((generateAllJob.progress as { current?: number; total?: number }).total || 1) * 100}%`,
                            transition: "width 0.5s ease",
                          }} />
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                          Chapter {(generateAllJob.progress as { current?: number }).current} of {(generateAllJob.progress as { total?: number }).total}
                          {(generateAllJob.progress as { step?: string }).step === "coherence" && " — polishing transitions"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {generateAllJob.status === "failed" && (
                <div style={{ marginBottom: 16 }}>
                  <JobProgress
                    progress={null}
                    error={generateAllJob.error}
                    status="failed"
                    onRetry={generateAll}
                  />
                </div>
              )}

              {/* Regenerate progress */}
              {regenerateJob.isRunning && (
                <div style={{ marginBottom: 16 }}>
                  <JobProgress
                    progress={regenerateJob.progress}
                    error={regenerateJob.error}
                    status={regenerateJob.status}
                  />
                </div>
              )}
              {regenerateJob.status === "failed" && (
                <div style={{ marginBottom: 16 }}>
                  <JobProgress
                    progress={null}
                    error={regenerateJob.error}
                    status="failed"
                    onRetry={() => regenerateChapter(active.id)}
                  />
                </div>
              )}

              {/* Footer buttons */}
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={generateAll}
                  disabled={isGenerating}
                  className="nodum-btn"
                >
                  {generateAllJob.isRunning
                    ? "Generating..."
                    : `Generate All ${chapters.length} Chapters`}
                </button>
                <button
                  onClick={() => regenerateChapter(active.id)}
                  disabled={isGenerating}
                  className="nodum-btn"
                  style={{ background: "rgba(193,122,71,0.15)", border: "1px solid rgba(193,122,71,0.4)", color: "#C17A47" }}
                >
                  {regenerateJob.isRunning
                    ? "Regenerating..."
                    : active.status === "generated"
                      ? "Regenerate Chapter"
                      : "Generate Chapter"}
                </button>
              </div>

              {/* Generate All completed summary */}
              {generateAllJob.status === "completed" && (
                <div style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "rgba(52,211,153,0.1)",
                  border: "1px solid rgba(5,150,105,0.15)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  color: "#059669",
                }}>
                  All {(generateAllJob.result as { chapters_generated?: number })?.chapters_generated} chapters generated with coherence pass applied. Your manuscript is taking shape — nicely done.
                </div>
              )}

              {/* Review & Edit link — shown when any chapter is generated */}
              {anyGenerated && !isGenerating && (
                <div style={{ marginTop: 16 }}>
                  <button
                    onClick={() => router.push(`/project/${projectId}/editor`)}
                    className="nodum-btn"
                    style={{ width: "100%", justifyContent: "center" }}
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
        message="Your manuscript is ready — time to edit and refine."
        onDone={() => setShowCelebration(false)}
      />
    </PageShell>
  );
}
