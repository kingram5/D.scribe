"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chapter, KeyPoint } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import DataPill from "@/components/ui/DataPill";
import PanelTitle from "@/components/ui/PanelTitle";
import MenuSection from "@/components/ui/MenuSection";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import { STATUS_COLORS } from "@/lib/constants";

export default function OutlinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [numChapters, setNumChapters] = useState(5);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [showKeyPoints, setShowKeyPoints] = useState(false);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const chs: Chapter[] = data.chapters || [];
        setChapters(chs);
        setKeyPoints(data.key_points || []);
        // Auto-select first chapter only on initial load (selectedChapterId intentionally excluded from deps)
        setSelectedChapterId((prev) => (chs.length > 0 && !prev ? chs[0].id : prev));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function generateOutline() {
    setGenerating(true);
    const res = await fetch("/api/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, num_chapters: numChapters }),
    });

    if (res.ok) {
      const data = await res.json();
      setChapters(data);
      if (data.length > 0) setSelectedChapterId(data[0].id);
    }
    setGenerating(false);
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="outline">
        <Spinner />
      </PageShell>
    );
  }

  const selectedChapter = chapters.find((c) => c.id === selectedChapterId);

  return (
    <PageShell projectId={projectId} currentStep="outline">
      <div style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 24,
        padding: "0 40px 40px",
      }}>
        {/* Left sidebar */}
        <GlassCard className="nodum-float-1" style={{ padding: 24, alignSelf: "start" }}>
          <PanelTitle>Chapters</PanelTitle>

          {/* Generate controls */}
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#a0978a", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
              Number of Chapters
            </label>
            <input
              type="number"
              min={2}
              max={20}
              value={numChapters}
              onChange={(e) => setNumChapters(parseInt(e.target.value) || 5)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 12px",
                fontSize: 14,
                color: "#191816",
                textAlign: "center",
                outline: "none",
                marginBottom: 10,
              }}
            />
            <button
              onClick={generateOutline}
              disabled={generating}
              className="nodum-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {generating
                ? "Generating..."
                : chapters.length > 0
                  ? "Regenerate"
                  : "Generate Outline"}
            </button>
          </div>

          {/* Chapter list */}
          {chapters.length > 0 && (
            <MenuSection
              items={chapters.map((ch) => ({
                label: `Ch ${ch.chapter_number}: ${ch.title}`,
                statusDot: STATUS_COLORS[ch.status] || "#a0978a",
                active: ch.id === selectedChapterId,
                onClick: () => setSelectedChapterId(ch.id),
              }))}
            />
          )}
        </GlassCard>

        {/* Right: selected chapter detail */}
        <GlassCard style={{ padding: 32, alignSelf: "start" }}>
          {selectedChapter ? (
            <>
              <div style={{ fontSize: 10, fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600, color: "#a0978a", letterSpacing: "0.1em", marginBottom: 8 }}>
                CHAPTER {selectedChapter.chapter_number}
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#191816", marginBottom: 12 }}>
                {selectedChapter.title}
              </h2>
              <p style={{ fontSize: 14, color: "#7a7369", lineHeight: 1.7, marginBottom: 24 }}>
                {selectedChapter.summary}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div
                  onClick={() => setShowKeyPoints(!showKeyPoints)}
                  style={{ cursor: "pointer" }}
                >
                  <DataPill
                    label={`Key Points ${showKeyPoints ? "▾" : "▸"}`}
                    metric={String(selectedChapter.key_point_ids?.length || 0)}
                    accentColor="#191816"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#a0978a", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
                    Target Words
                  </label>
                  <input
                    type="number"
                    min={500}
                    max={10000}
                    step={500}
                    value={selectedChapter.target_word_count}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 3000;
                      setChapters((prev) =>
                        prev.map((c) =>
                          c.id === selectedChapter.id ? { ...c, target_word_count: val } : c
                        )
                      );
                    }}
                    onBlur={async () => {
                      await fetch(`/api/project/${projectId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          chapter_id: selectedChapter.id,
                          target_word_count: selectedChapter.target_word_count,
                        }),
                      });
                    }}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "rgba(255,255,255,0.6)",
                      border: "1px solid rgba(0,0,0,0.1)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 14px",
                      fontSize: 18,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontWeight: 700,
                      color: "#191816",
                      textAlign: "center",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
              {showKeyPoints && (selectedChapter.key_point_ids?.length || 0) > 0 && (
                <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedChapter.key_point_ids?.map((kpId) => {
                    const kp = keyPoints.find((k) => k.id === kpId);
                    if (!kp) return null;
                    return (
                      <div key={kpId} style={{
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.5)",
                        border: "1px solid rgba(255,255,255,0.8)",
                        borderRadius: "var(--radius-sm)",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#191816" }}>{kp.title}</div>
                        <div style={{ fontSize: 12, color: "#7a7369", marginTop: 4, lineHeight: 1.5 }}>{kp.summary}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {chapters.length > 0 && (
                <button
                  onClick={() => router.push(`/project/${projectId}/generate`)}
                  className="nodum-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Start Generating
                </button>
              )}
            </>
          ) : (
            <div style={{ padding: "60px 0", textAlign: "center", color: "#a0978a" }}>
              <p>No outline yet. Set the number of chapters and generate.</p>
            </div>
          )}
        </GlassCard>
      </div>
    </PageShell>
  );
}
