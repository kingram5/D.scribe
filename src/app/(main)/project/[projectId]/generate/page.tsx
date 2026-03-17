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
import { STATUS_COLORS } from "@/lib/constants";

export default function GeneratePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [creativeFreedom, setCreativeFreedom] = useState(50);
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [enrichments, setEnrichments] = useState<Record<string, Enrichment[]>>({});
  const [generating, setGenerating] = useState<string | null>(null);
  const [enriching, setEnriching] = useState<string | null>(null);
  const [includeForeword, setIncludeForeword] = useState(false);
  const [generatingForeword, setGeneratingForeword] = useState(false);

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

  async function fetchEnrichments(chapterId: string) {
    setEnriching(chapterId);
    const res = await fetch("/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: chapterId }),
    });
    if (res.ok) {
      const data = await res.json();
      setEnrichments((prev) => ({ ...prev, [chapterId]: data }));
    }
    setEnriching(null);
  }

  async function toggleEnrichment(id: string, included: boolean) {
    await fetch("/api/enrich", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, included }),
    });
    // Update local state
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

  async function generateChapter(chapterId: string) {
    setGenerating(chapterId);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: chapterId, creative_freedom: creativeFreedom }),
    });

    if (res.ok) {
      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === chapterId ? { ...ch, status: "generated" as const } : ch
        )
      );
    }
    setGenerating(null);
  }

  async function generateForeword() {
    setGeneratingForeword(true);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        type: "foreword",
        creative_freedom: creativeFreedom,
        chapters: chapters.map((ch) => ({ title: ch.title, summary: ch.summary })),
      }),
    });

    if (res.ok) {
      setIncludeForeword(true);
    }
    setGeneratingForeword(false);
  }

  const freedomLabel =
    creativeFreedom <= 30
      ? "Faithful"
      : creativeFreedom <= 70
        ? "Balanced"
        : "Creative";

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
          onAction={() => router.push(`/project/${projectId}/outline`)}
        />
      </PageShell>
    );
  }

  const active = chapters.find((ch) => ch.id === activeChapter);
  const chapterEnrichments = activeChapter ? enrichments[activeChapter] || [] : [];

  return (
    <PageShell projectId={projectId} currentStep="generate">
      <div style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 24,
        padding: "0 40px 40px",
      }}>
        {/* Left sidebar: chapter list */}
        <GlassCard className="nodum-float-1" style={{ padding: 24, alignSelf: "start" }}>
          <PanelTitle>Chapters</PanelTitle>
          <div style={{ marginTop: 16 }}>
            <MenuSection
              items={chapters.map((ch) => ({
                label: `Ch ${ch.chapter_number}: ${ch.title}`,
                statusDot: STATUS_COLORS[ch.status] || "#a0978a",
                meta: `${ch.target_word_count}w`,
                active: ch.id === activeChapter,
                onClick: () => setActiveChapter(ch.id),
              }))}
            />
          </div>
        </GlassCard>

        {/* Right: chapter detail + enrichments */}
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <GlassCard style={{ padding: 32 }}>
              {/* Foreword toggle */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                background: includeForeword ? "rgba(25,24,22,0.04)" : "rgba(255,255,255,0.5)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 24,
                transition: "all 0.15s",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#191816" }}>
                    Include Foreword
                  </div>
                  <div style={{ fontSize: 12, color: "#7a7369", marginTop: 2 }}>
                    AI-generated intro chapter previewing the topics ahead
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {includeForeword && !generatingForeword && (
                    <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>Generated</span>
                  )}
                  {generatingForeword && (
                    <span style={{ fontSize: 11, color: "#a0978a", fontWeight: 600 }}>Writing...</span>
                  )}
                  <button
                    onClick={() => {
                      if (!includeForeword) {
                        generateForeword();
                      } else {
                        setIncludeForeword(false);
                      }
                    }}
                    disabled={generatingForeword}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      border: "none",
                      cursor: generatingForeword ? "wait" : "pointer",
                      background: includeForeword ? "#191816" : "rgba(0,0,0,0.15)",
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#191816" }}>
                    Creative Freedom: <span style={{ color: "#7a7369" }}>{freedomLabel}</span>
                  </span>
                  <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "#a0978a", fontWeight: 600 }}>
                    {creativeFreedom}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={creativeFreedom}
                  onChange={(e) => setCreativeFreedom(parseInt(e.target.value))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#a0978a", marginTop: 4 }}>
                  <span>Faithful to transcript</span>
                  <span>Freely interpreted</span>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(0,0,0,0.06)", marginBottom: 24 }} />

              {/* Chapter info */}
              <div style={{ fontSize: 10, fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600, color: "#a0978a", letterSpacing: "0.1em", marginBottom: 8 }}>
                CHAPTER {active.chapter_number}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#191816", marginBottom: 8 }}>
                {active.title}
              </h2>
              <p style={{ fontSize: 14, color: "#7a7369", lineHeight: 1.6, marginBottom: 24 }}>{active.summary}</p>

              {/* Enrichment quotes */}
              {chapterEnrichments.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <PanelTitle>Enrichment Quotes</PanelTitle>
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {chapterEnrichments.map((e) => (
                      <div
                        key={e.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: 12,
                          borderRadius: "var(--radius-sm)",
                          borderLeft: e.included ? "3px solid #191816" : "3px solid rgba(0,0,0,0.1)",
                          background: e.included ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                          opacity: e.included ? 1 : 0.5,
                          transition: "all 0.15s",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={e.included}
                          onChange={(ev) =>
                            toggleEnrichment(e.id, ev.target.checked)
                          }
                          style={{ marginTop: 3, cursor: "pointer" }}
                        />
                        <div>
                          <p style={{ fontSize: 13, fontStyle: "italic", color: "#191816", marginBottom: 4 }}>
                            &ldquo;{e.quote_text}&rdquo;
                          </p>
                          <p style={{ fontSize: 11, color: "#7a7369" }}>
                            — {e.source_author}, <em>{e.source_title}</em>
                          </p>
                          <p style={{ fontSize: 11, color: "#a0978a", marginTop: 2 }}>
                            {e.relevance_note}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer buttons */}
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => fetchEnrichments(active.id)}
                  disabled={enriching === active.id}
                  className="nodum-btn-ghost"
                >
                  {enriching === active.id
                    ? "Finding quotes..."
                    : chapterEnrichments.length > 0
                      ? "Refresh Quotes"
                      : "Find Enrichment Quotes"}
                </button>
                <button
                  onClick={() => generateChapter(active.id)}
                  disabled={generating === active.id}
                  className="nodum-btn"
                >
                  {generating === active.id
                    ? "Generating..."
                    : active.status === "generated"
                      ? "Regenerate"
                      : "Generate Chapter"}
                </button>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </PageShell>
  );
}
