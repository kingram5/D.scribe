"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Transcript, TranscriptSegment } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import DataPill from "@/components/ui/DataPill";
import MenuSection from "@/components/ui/MenuSection";
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { SPEAKER_COLORS } from "@/lib/constants";

/** Merge consecutive same-speaker segments into paragraphs */
function mergeSegments(segments: TranscriptSegment[]): { speaker: string; text: string }[] {
  if (!segments?.length) return [];
  const merged: { speaker: string; text: string }[] = [];
  let current = { speaker: segments[0].speaker, text: segments[0].text };

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].speaker === current.speaker) {
      current.text += " " + segments[i].text;
    } else {
      merged.push({ ...current });
      current = { speaker: segments[i].speaker, text: segments[i].text };
    }
  }
  merged.push(current);
  return merged;
}

export default function TranscriptPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setTranscripts(data.transcripts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  const active = transcripts[activeIdx] ?? null;
  const merged = active?.segments ? mergeSegments(active.segments) : [];

  async function runAnalysis() {
    if (transcripts.length === 0) return;
    setAnalyzing(true);

    for (const transcript of transcripts) {
      await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          transcript_id: transcript.id,
        }),
      });
    }

    setAnalyzing(false);
    router.push(`/project/${projectId}/analysis`);
  }

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

  return (
    <PageShell projectId={projectId} currentStep="transcript">
      <div style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 24,
        height: "calc(100vh - 88px)",
        minHeight: 400,
        padding: "0 32px 32px",
      }}>
        {/* Left sidebar */}
        <GlassCard className="nodum-float-1" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
          <PanelTitle>Transcripts</PanelTitle>
          <div style={{ marginTop: 16 }}>
            <MenuSection
              items={transcripts.map((t, i) => ({
                label: `Transcript ${i + 1}`,
                active: i === activeIdx,
                onClick: () => setActiveIdx(i),
              }))}
            />
          </div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <DataPill
              label="Word Count"
              metric={active.word_count.toLocaleString()}
              accentColor="#191816"
            />
            <DataPill
              label="Speakers"
              metric={`${active.speaker_count} speaker${active.speaker_count !== 1 ? "s" : ""}`}
              accentColor="#d4b895"
            />
          </div>
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="nodum-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {analyzing ? "Analyzing..." : "Analyze All"}
            </button>
          </div>
        </GlassCard>

        {/* Right: transcript content */}
        <GlassCard style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.5)",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#191816" }}>
              Transcript {activeIdx + 1}
            </span>
            <span style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11,
              color: "#a0978a",
              fontWeight: 600,
            }}>
              {active.word_count.toLocaleString()} words
            </span>
          </div>

          {/* Scrollable body */}
          <div className="no-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
            {merged.length > 0
              ? merged.map((para, i) => (
                  <div key={i} style={{ marginBottom: 20 }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-geist-mono), monospace",
                      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
                      marginBottom: 6,
                    }}>
                      {para.speaker}
                    </div>
                    {editingIdx === i ? (
                      <div>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            height: 750,
                            fontSize: 14,
                            lineHeight: 1.8,
                            color: "#191816",
                            background: "rgba(255,255,255,0.7)",
                            border: "1px solid rgba(0,0,0,0.15)",
                            borderRadius: "var(--radius-sm)",
                            padding: "12px 14px",
                            outline: "none",
                            resize: "none",
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button
                            onClick={() => saveEdit(i, editText)}
                            disabled={saving}
                            className="nodum-btn"
                            style={{ padding: "6px 16px", fontSize: 12 }}
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingIdx(null)}
                            className="nodum-btn-ghost"
                            style={{ padding: "6px 16px", fontSize: 12 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        onClick={() => { setEditingIdx(i); setEditText(para.text); }}
                        style={{
                          fontSize: 14,
                          lineHeight: 1.8,
                          color: "#191816",
                          margin: 0,
                          cursor: "text",
                          padding: "4px 0",
                          borderRadius: "var(--radius-sm)",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.4)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {para.text}
                      </p>
                    )}
                  </div>
                ))
              : (
                <p style={{ fontSize: 14, lineHeight: 1.8, color: "#191816", whiteSpace: "pre-wrap" }}>
                  {active.full_text}
                </p>
              )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
