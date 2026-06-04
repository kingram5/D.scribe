"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { KeyPoint, VoiceProfile, Chapter, Audience } from "@/types";
import dynamic from "next/dynamic";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import InkUpgradeModal from "@/components/ui/InkUpgradeModal";
import AnalysisLoadingScreen from "@/components/analysis/AnalysisLoadingScreen";

const OutlineEditor = dynamic(
  () => import("@/components/outline-editor/OutlineEditor"),
  { ssr: false }
);

interface AnalysisData {
  key_points: KeyPoint[];
  chapters: Chapter[];
  voice_profile: VoiceProfile | null;
}

// Map a real voice profile to the 3 display traits shown during analysis.
function deriveTraits(vp: VoiceProfile | null): string[] {
  if (!vp) return [];
  return [
    vp.tone,
    vp.vocabulary_level ? `${vp.vocabulary_level} vocabulary` : null,
    vp.formality_score != null ? `Formality ${vp.formality_score}/5` : null,
  ].filter(Boolean) as string[];
}

export default function AnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"outline" | "voice">("outline");
  const [audience, setAudience] = useState<Audience>("General");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // Live data surfaced into the analysis loading screen as each stage completes
  const [liveKeyPoints, setLiveKeyPoints] = useState<string[]>([]);
  const [liveTraits, setLiveTraits] = useState<string[]>([]);
  const [liveChapters, setLiveChapters] = useState<string[]>([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [numChapters, setNumChapters] = useState(5);
  const [targetWords, setTargetWords] = useState(3000);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [expandState, setExpandState] = useState<"idle" | "previewing" | "review" | "confirming">("idle");
  const [proposedChapters, setProposedChapters] = useState<
    { title: string; summary: string; narrative_arc: string; key_point_ids: string[]; included: boolean }[]
  >([]);
  const [expandError, setExpandError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((project) => {
        setData({
          key_points: project.key_points || [],
          chapters: project.chapters || [],
          voice_profile: project.voice_profile,
        });
        if (project.audience) setAudience(project.audience);
        if (project.num_chapters) setNumChapters(project.num_chapters);
        if (project.target_words_per_chapter) setTargetWords(project.target_words_per_chapter);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setLiveKeyPoints([]);
    setLiveTraits([]);
    setLiveChapters((data?.chapters ?? []).map((c) => c.title));
    setAnalysisComplete(false);

    // Save audience to project before analyzing
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audience }),
    }).catch(() => {});

    // Get transcript ID — use the most recent transcript with actual content
    const projRes = await fetch(`/api/project/${projectId}`);
    const projData = await projRes.json();
    const transcripts = projData.transcripts || [];
    const validTranscript = [...transcripts]
      .reverse()
      .find((t: { full_text?: string; word_count?: number }) => t.full_text && (t.word_count ?? 0) > 0);
    const transcriptId = validTranscript?.id;

    if (!transcriptId) {
      setAnalyzeError("No transcript with content found. Please upload and transcribe audio first.");
      setAnalyzing(false);
      return;
    }

    const body = { project_id: projectId, transcript_id: transcriptId };
    const headers = { "Content-Type": "application/json" };

    try {
      // Step 1: Key points — one chunk at a time
      let chunkIndex = 0;
      let totalChunks = 1;
      let done = false;
      const allTitles: string[] = [];

      while (!done) {
        setAnalyzeStep(`Extracting key points (${chunkIndex + 1}/${totalChunks})...`);
        const kpRes = await fetch("/api/analyze/key-points", {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...body,
            chunk_index: chunkIndex,
            previous_titles: allTitles,
          }),
        });
        if (!kpRes.ok) {
          if (kpRes.status === 402) { setShowUpgrade(true); setAnalyzing(false); setAnalyzeStep(null); return; }
          const e = await kpRes.json().catch(() => ({ error: "Key points failed" }));
          throw new Error(e.error || "Key points failed");
        }
        const kpData = await kpRes.json();
        totalChunks = kpData.total_chunks;
        done = kpData.done;
        if (kpData.key_points) {
          allTitles.push(...kpData.key_points.map((kp: { title: string }) => kp.title));
          setLiveKeyPoints([...allTitles]);
        }
        chunkIndex++;
      }

      // Step 2: Voice profile
      setAnalyzeStep("Building voice profile...");
      const vpRes = await fetch("/api/analyze/voice-profile", { method: "POST", headers, body: JSON.stringify(body) });
      if (!vpRes.ok) {
        if (vpRes.status === 402) { setShowUpgrade(true); setAnalyzing(false); setAnalyzeStep(null); return; }
        const e = await vpRes.json().catch(() => ({ error: "Voice profile failed" })); throw new Error(e.error || "Voice profile failed");
      }
      const vpData = await vpRes.json().catch(() => null);
      if (vpData?.voice_profile) setLiveTraits(deriveTraits(vpData.voice_profile));

      // Step 3: Generate outline only if no chapters exist yet (prevents wiping a custom outline)
      const existingChapters = data?.chapters ?? [];
      if (existingChapters.length === 0) {
        setAnalyzeStep("Generating chapter outline...");
        const olRes = await fetch("/api/outline", { method: "POST", headers, body: JSON.stringify({ project_id: projectId, num_chapters: numChapters }) });
        if (!olRes.ok) { const e = await olRes.json().catch(() => ({ error: "Outline failed" })); throw new Error(e.error || "Outline generation failed"); }
      }

      // Refresh data
      const project = await fetch(`/api/project/${projectId}`).then((r) => r.json());
      setData({
        key_points: project.key_points || [],
        chapters: project.chapters || [],
        voice_profile: project.voice_profile,
      });
      setLiveChapters((project.chapters || []).map((c: { title: string }) => c.title));
      if (project.voice_profile) setLiveTraits(deriveTraits(project.voice_profile));

      // Brief "complete" beat so the outline column fills before we transition.
      setAnalyzeStep(null);
      setAnalysisComplete(true);
      await new Promise((r) => setTimeout(r, 1000));
      setTab("outline");
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    }

    setAnalyzing(false);
    setAnalyzeStep(null);
    setAnalysisComplete(false);
  }

  const unassignedKeyPoints = useMemo(() => {
    const assignedIds = new Set((data?.chapters ?? []).flatMap((c) => c.key_point_ids ?? []));
    return (data?.key_points ?? []).filter((kp) => !assignedIds.has(kp.id));
  }, [data]);

  async function previewExpand() {
    setExpandState("previewing");
    setExpandError(null);
    try {
      const res = await fetch("/api/outline/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, dry_run: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Preview failed");
      setProposedChapters(
        json.proposed_chapters.map((ch: { title: string; summary: string; narrative_arc: string; key_point_ids: string[] }) => ({
          ...ch,
          included: true,
        }))
      );
      setExpandState("review");
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : "Preview failed");
      setExpandState("idle");
    }
  }

  async function confirmExpand() {
    setExpandState("confirming");
    setExpandError(null);
    try {
      const toSave = proposedChapters.filter((ch) => ch.included);
      const res = await fetch("/api/outline/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, chapters: toSave }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Confirm failed");
      // Refresh project data
      const project = await fetch(`/api/project/${projectId}`).then((r) => r.json());
      setData({
        key_points: project.key_points || [],
        chapters: project.chapters || [],
        voice_profile: project.voice_profile,
      });
      setExpandState("idle");
      setProposedChapters([]);
      setTab("outline");
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : "Could not save chapters");
      setExpandState("review");
    }
  }

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <Spinner />
      </PageShell>
    );
  }

  // Analysis running: full-area Neural loading screen, driven by real pipeline data
  if (analyzing) {
    return (
      <PageShell projectId={projectId} currentStep="analysis" hideFooterNav>
        <AnalysisLoadingScreen
          step={analyzeStep}
          complete={analysisComplete}
          keyPoints={liveKeyPoints}
          traits={liveTraits}
          chapters={liveChapters}
        />
      </PageShell>
    );
  }

  const hasAnalysis = (data?.key_points?.length || 0) > 0;
  const hasChapters = (data?.chapters?.length || 0) > 0;

  // Pre-analysis: show audience selector + run analysis button
  if (!hasAnalysis) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <div className="ds-analyze-card" style={{ padding: "0 40px 40px", maxWidth: 500, margin: "0 auto" }}>
          <GlassCard style={{ padding: 32, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              Analysis
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
              Run analysis to extract key themes, build a voice profile, and generate your chapter outline.
            </p>

            {analyzeError && (
              <p style={{ fontSize: 13, color: "#dc2626", marginBottom: 16 }}>{analyzeError}</p>
            )}

            {analyzing && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-manrope), sans-serif" }}>
                    {analyzeStep || "Starting analysis..."}
                  </span>
                </div>
                {/* Indeterminate progress bar */}
                <div style={{ height: 4, background: "var(--ds-card-border)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: "40%",
                    background: "linear-gradient(90deg, transparent 0%, #C17A47 50%, transparent 100%)",
                    borderRadius: 2,
                    animation: "analysisProgress 1.4s ease-in-out infinite",
                  }} />
                </div>
                <style>{`
                  @keyframes analysisProgress {
                    0% { transform: translateX(-200%); }
                    100% { transform: translateX(350%); }
                  }
                `}</style>
              </div>
            )}

            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="nodum-btn"
              style={{ justifyContent: "center", opacity: analyzing ? 0.6 : 1, width: "100%" }}
            >
              {analyzing ? "Analyzing..." : "Run Analysis"}
            </button>
          </GlassCard>
        </div>
        {showUpgrade && <InkUpgradeModal onClose={() => setShowUpgrade(false)} />}
      </PageShell>
    );
  }

  // Post-analysis view: tabs for outline editor, voice profile, concept map
  return (
    <PageShell projectId={projectId} currentStep="analysis">
      {analyzing && (
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 40px",
          background: "rgba(193,122,71,0.12)",
          borderBottom: "1px solid rgba(193,122,71,0.2)",
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            border: "2px solid rgba(193,122,71,0.3)",
            borderTopColor: "#C17A47",
            animation: "spin 0.8s linear infinite",
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#C17A47",
            fontFamily: "var(--font-manrope), sans-serif",
          }}>
            {analyzeStep || "Analyzing your transcript..."}
          </span>
        </div>
      )}
      <div style={{ padding: "0 40px 40px" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "outline" as const, label: `Outline (${data?.chapters?.length || 0} chapters)` },
            { key: "voice" as const, label: "Voice Profile" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                borderRadius: 20,
                background: tab === t.key ? "#191816" : "rgba(255,255,255,0.6)",
                color: tab === t.key ? "white" : "#7a7369",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Outline tab — interactive mind map editor */}
        {tab === "outline" && hasChapters && unassignedKeyPoints.length > 0 && expandState === "idle" && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            marginBottom: 16,
            background: "rgba(217,119,6,0.08)",
            border: "1px solid rgba(217,119,6,0.2)",
            borderRadius: 12,
          }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#92400e", marginBottom: 2 }}>
                {unassignedKeyPoints.length} new key point{unassignedKeyPoints.length !== 1 ? "s" : ""} from your latest upload
              </p>
              <p style={{ fontSize: 12, color: "#b45309" }}>
                These haven&apos;t been added to the outline yet.
              </p>
            </div>
            <button
              onClick={previewExpand}
              style={{
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 600,
                background: "#92400e",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Preview New Chapters →
            </button>
          </div>
        )}

        {tab === "outline" && hasChapters && expandState === "previewing" && (
          <div style={{
            padding: "14px 20px",
            marginBottom: 16,
            background: "rgba(217,119,6,0.06)",
            border: "1px solid rgba(217,119,6,0.15)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              border: "2px solid rgba(217,119,6,0.3)",
              borderTopColor: "#b45309",
              animation: "spin 0.8s linear infinite",
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>
              Generating chapter proposals...
            </span>
          </div>
        )}

        {tab === "outline" && (expandState === "review" || expandState === "confirming") && (
          <div style={{
            marginBottom: 20,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            overflow: "hidden",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#191816" }}>
                Proposed New Chapters
              </p>
              <p style={{ fontSize: 12, color: "#7a7369", marginTop: 2 }}>
                Review and edit before adding to your outline. Uncheck any you want to skip.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {proposedChapters.map((ch, i) => (
                <div key={i} style={{
                  display: "flex",
                  gap: 14,
                  padding: "16px 20px",
                  borderBottom: i < proposedChapters.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                  background: ch.included ? "transparent" : "rgba(0,0,0,0.02)",
                  opacity: ch.included ? 1 : 0.5,
                }}>
                  <input
                    type="checkbox"
                    checked={ch.included}
                    onChange={(e) => {
                      setProposedChapters((prev) =>
                        prev.map((c, j) => j === i ? { ...c, included: e.target.checked } : c)
                      );
                    }}
                    style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={ch.title}
                      onChange={(e) => setProposedChapters((prev) =>
                        prev.map((c, j) => j === i ? { ...c, title: e.target.value } : c)
                      )}
                      style={{
                        width: "100%",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#191816",
                        border: "none",
                        background: "transparent",
                        outline: "none",
                        marginBottom: 4,
                        fontFamily: "inherit",
                      }}
                    />
                    <textarea
                      value={ch.summary}
                      onChange={(e) => setProposedChapters((prev) =>
                        prev.map((c, j) => j === i ? { ...c, summary: e.target.value } : c)
                      )}
                      rows={2}
                      style={{
                        width: "100%",
                        fontSize: 12,
                        color: "#7a7369",
                        border: "none",
                        background: "transparent",
                        outline: "none",
                        resize: "none",
                        fontFamily: "inherit",
                        lineHeight: 1.5,
                      }}
                    />
                    <p style={{ fontSize: 11, color: "#a0978a", marginTop: 4 }}>
                      {ch.key_point_ids.length} key point{ch.key_point_ids.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {expandError && (
              <div style={{ padding: "10px 20px", background: "rgba(220,38,38,0.06)", borderTop: "1px solid rgba(220,38,38,0.1)" }}>
                <p style={{ fontSize: 12, color: "#dc2626" }}>{expandError}</p>
              </div>
            )}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              padding: "14px 20px",
              borderTop: "1px solid rgba(0,0,0,0.06)",
            }}>
              <button
                onClick={() => { setExpandState("idle"); setProposedChapters([]); setExpandError(null); }}
                style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "transparent", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8, cursor: "pointer", color: "#7a7369" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmExpand}
                disabled={expandState === "confirming" || proposedChapters.filter((c) => c.included).length === 0}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "#191816",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: expandState === "confirming" ? "wait" : "pointer",
                  opacity: proposedChapters.filter((c) => c.included).length === 0 ? 0.4 : 1,
                }}
              >
                {expandState === "confirming" ? "Saving..." : `Confirm & Add ${proposedChapters.filter((c) => c.included).length} Chapter${proposedChapters.filter((c) => c.included).length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {tab === "outline" && hasChapters && data && (
          <OutlineEditor
            projectId={projectId}
            initialChapters={data.chapters}
            initialKeyPoints={data.key_points}
            onContinue={() => router.push(`/project/${projectId}/generate`)}
          />
        )}

        {tab === "outline" && !hasChapters && (
          <EmptyState
            message="No outline generated yet. Re-run analysis to create chapters."
            actionLabel="Re-analyze"
            onAction={runAnalysis}
          />
        )}

        {/* Voice Profile tab */}
        {tab === "voice" && (
          <GlassCard style={{ padding: 32 }}>
            <PanelTitle>Voice Profile</PanelTitle>
            {data?.voice_profile ? (
              <div className="ds-voice-grid" style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#a0978a", letterSpacing: "0.08em" }}>
                    Tone
                  </label>
                  <p style={{ fontSize: 14, color: "#191816", marginTop: 4 }}>
                    {data.voice_profile.tone}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#a0978a", letterSpacing: "0.08em" }}>
                    Vocabulary Level
                  </label>
                  <p style={{ fontSize: 14, color: "#191816", marginTop: 4 }}>
                    {data.voice_profile.vocabulary_level}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#a0978a", letterSpacing: "0.08em" }}>
                    Formality
                  </label>
                  <p style={{ fontSize: 14, color: "#191816", marginTop: 4 }}>
                    {data.voice_profile.formality_score}/5
                  </p>
                </div>
                {data.voice_profile.signature_phrases && (
                  <div>
                    <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#a0978a", letterSpacing: "0.08em" }}>
                      Signature Phrases
                    </label>
                    <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {data.voice_profile.signature_phrases.map((p, i) => (
                        <span key={i} style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          background: "rgba(180,83,9,0.08)",
                          borderRadius: 12,
                          color: "#7a7369",
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: "#a0978a", marginTop: 16 }}>No voice profile yet.</p>
            )}
          </GlassCard>
        )}
      </div>
      {showUpgrade && <InkUpgradeModal onClose={() => setShowUpgrade(false)} />}
    </PageShell>
  );
}
