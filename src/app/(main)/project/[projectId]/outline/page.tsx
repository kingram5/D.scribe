"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { KeyPoint, Chapter, Enrichment } from "@/types";
import dynamic from "next/dynamic";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

const OutlineEditor = dynamic(
  () => import("@/components/outline-editor/OutlineEditor"),
  { ssr: false }
);

interface OutlineData {
  key_points: KeyPoint[];
  chapters: Chapter[];
}

export default function OutlinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [data, setData] = useState<OutlineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrichments, setEnrichments] = useState<Record<string, Enrichment[]>>({});
  const [enriching, setEnriching] = useState<string | null>(null);
  const [activeEnrichChapter, setActiveEnrichChapter] = useState<string | null>(null);

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

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((project) => {
        setData({
          key_points: project.key_points || [],
          chapters: project.chapters || [],
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="outline">
        <Spinner />
      </PageShell>
    );
  }

  const hasAnalysis = (data?.key_points?.length || 0) > 0;
  const hasChapters = (data?.chapters?.length || 0) > 0;

  // No analysis yet — redirect to analysis
  if (!hasAnalysis) {
    return (
      <PageShell projectId={projectId} currentStep="outline">
        <div style={{ padding: "0 40px 40px", maxWidth: 600, margin: "0 auto" }}>
          <GlassCard style={{ padding: 32, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#FFFFFF", marginBottom: 8 }}>
              Outline
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 24, lineHeight: 1.6 }}>
              Run analysis first to extract your key ideas. The outline is built from those ideas.
            </p>
            <button
              onClick={() => router.push(`/project/${projectId}/analysis`)}
              className="nodum-btn"
              style={{ justifyContent: "center" }}
            >
              Go to Analysis
            </button>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  // Has analysis but no chapters yet
  if (!hasChapters) {
    return (
      <PageShell projectId={projectId} currentStep="outline">
        <div style={{ padding: "0 40px 40px", maxWidth: 600, margin: "0 auto" }}>
          <EmptyState
            message="No outline generated yet. Re-run analysis to create chapters."
            actionLabel="Go to Analysis"
            onAction={() => router.push(`/project/${projectId}/analysis`)}
          />
        </div>
      </PageShell>
    );
  }

  const chapters = data!.chapters;
  const activeChapterEnrichments = activeEnrichChapter ? enrichments[activeEnrichChapter] || [] : [];

  // Has chapters — show the outline editor
  return (
    <PageShell projectId={projectId} currentStep="outline">
      <div className="ds-outline-body" style={{ padding: "0 40px 40px" }}>
        <OutlineEditor
          projectId={projectId}
          initialChapters={chapters}
          initialKeyPoints={data!.key_points}
          onContinue={() => router.push(`/project/${projectId}/generate`)}
        />

        {/* Enrichment Quotes Section */}
        <GlassCard className="ds-enrich-card" style={{ padding: 32, marginTop: 24 }}>
          <PanelTitle>Enrichment Quotes</PanelTitle>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4, marginBottom: 20 }}>
            Find relevant quotes from books, articles, and research to weave into each chapter.
          </p>

          {/* Chapter selector */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {chapters.map((ch) => {
              const isActive = activeEnrichChapter === ch.id;
              const hasEnrichments = (enrichments[ch.id] || []).length > 0;
              return (
                <button
                  key={ch.id}
                  className="ds-enrich-chip"
                  onClick={() => setActiveEnrichChapter(isActive ? null : ch.id)}
                  style={{
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: isActive
                      ? "1px solid rgba(224,93,58,0.6)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: isActive
                      ? "rgba(224,93,58,0.15)"
                      : "rgba(255,255,255,0.04)",
                    color: isActive ? "#E05D3A" : "rgba(255,255,255,0.7)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    position: "relative",
                  }}
                >
                  Ch {ch.chapter_number}: {ch.title}
                  {hasEnrichments && (
                    <span style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#E05D3A",
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Find quotes button + results for active chapter */}
          {activeEnrichChapter && (
            <div>
              <button
                onClick={() => fetchEnrichments(activeEnrichChapter)}
                disabled={enriching === activeEnrichChapter}
                className="nodum-btn-ghost"
                style={{ marginBottom: 16 }}
              >
                {enriching === activeEnrichChapter
                  ? "Finding quotes..."
                  : activeChapterEnrichments.length > 0
                    ? "Refresh Quotes"
                    : "Find Enrichment Quotes"}
              </button>

              {/* Enrichment results */}
              {activeChapterEnrichments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeChapterEnrichments.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: 12,
                        borderRadius: "var(--radius-sm)",
                        borderLeft: e.included ? "3px solid #E05D3A" : "3px solid rgba(255,255,255,0.08)",
                        background: e.included ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
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
                        <p style={{ fontSize: 13, fontStyle: "italic", color: "#FFFFFF", marginBottom: 4 }}>
                          &ldquo;{e.quote_text}&rdquo;
                        </p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                          — {e.source_author}, <em>{e.source_title}</em>
                        </p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                          {e.relevance_note}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </GlassCard>
      </div>
    </PageShell>
  );
}
