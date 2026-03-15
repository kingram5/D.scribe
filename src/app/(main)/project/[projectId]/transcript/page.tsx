"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Transcript } from "@/types";
import GlassCard from "@/components/ui/GlassCard";
import DataPill from "@/components/ui/DataPill";
import MenuSection from "@/components/ui/MenuSection";
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { SPEAKER_COLORS } from "@/lib/constants";

export default function TranscriptPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setTranscripts(data.transcripts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function runAnalysis() {
    if (transcripts.length === 0) return;
    setAnalyzing(true);

    // Analyze each transcript
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

  const active = transcripts[activeIdx];

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
            {active.segments && active.segments.length > 0
              ? active.segments.map((seg, i) => (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <span style={{
                      marginRight: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-geist-mono), monospace",
                      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
                    }}>
                      {seg.speaker}
                    </span>
                    <span style={{ fontSize: 14, lineHeight: 1.7, color: "#191816" }}>{seg.text}</span>
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
