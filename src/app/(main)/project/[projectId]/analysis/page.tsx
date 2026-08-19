"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { KeyPoint, MindMapNode, MindMapEdge, VoiceProfile, Chapter, Audience } from "@/types";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dynamic from "next/dynamic";
import GlassCard from "@/components/ui/GlassCard";
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { useJob } from "@/hooks/useJob";

const OutlineEditor = dynamic(
  () => import("@/components/outline-editor/OutlineEditor"),
  { ssr: false }
);

interface AnalysisData {
  key_points: KeyPoint[];
  chapters: Chapter[];
  voice_profile: VoiceProfile | null;
  mind_map_nodes: MindMapNode[];
  mind_map_edges: MindMapEdge[];
}

const NODE_COLORS: Record<string, string> = {
  topic: "#191816",
  subtopic: "#7a7369",
  quote: "#d4b895",
  scripture: "#8b8276",
  illustration: "#a0978a",
};

export default function AnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"outline" | "voice" | "map">("outline");
  const [audience, setAudience] = useState<Audience>("General");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const analyzeJob = useJob();
  const [numChapters, setNumChapters] = useState(5);
  const [targetWords, setTargetWords] = useState(3000);
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
          mind_map_nodes: project.mind_map_nodes || [],
          mind_map_edges: project.mind_map_edges || [],
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
          const e = await kpRes.json().catch(() => ({ error: "Key points failed" }));
          throw new Error(e.error || "Key points failed");
        }
        const kpData = await kpRes.json();
        totalChunks = kpData.total_chunks;
        done = kpData.done;
        if (kpData.key_points) {
          allTitles.push(...kpData.key_points.map((kp: { title: string }) => kp.title));
        }
        chunkIndex++;
      }

      // Step 2: Voice profile
      setAnalyzeStep("Building voice profile...");
      const vpRes = await fetch("/api/analyze/voice-profile", { method: "POST", headers, body: JSON.stringify(body) });
      if (!vpRes.ok) { const e = await vpRes.json().catch(() => ({ error: "Voice profile failed" })); throw new Error(e.error || "Voice profile failed"); }

      // Step 3: Mind map
      setAnalyzeStep("Creating mind map...");
      const mmRes = await fetch("/api/analyze/mind-map", { method: "POST", headers, body: JSON.stringify({ project_id: projectId }) });
      if (!mmRes.ok) { const e = await mmRes.json().catch(() => ({ error: "Mind map failed" })); throw new Error(e.error || "Mind map failed"); }

      // Step 4: Generate outline only if no chapters exist yet (prevents wiping a custom outline)
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
        mind_map_nodes: project.mind_map_nodes || [],
        mind_map_edges: project.mind_map_edges || [],
      });
      setTab("outline");
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    }

    setAnalyzing(false);
    setAnalyzeStep(null);
  }

  // Refresh data after analysis completes
  useEffect(() => {
    if (analyzeJob.status === "completed") {
      fetch(`/api/project/${projectId}`)
        .then((r) => r.json())
        .then((project) => {
          setData({
            key_points: project.key_points || [],
            chapters: project.chapters || [],
            voice_profile: project.voice_profile,
            mind_map_nodes: project.mind_map_nodes || [],
            mind_map_edges: project.mind_map_edges || [],
          });
          setTab("outline");
        });
      analyzeJob.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzeJob.status]);

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
        mind_map_nodes: project.mind_map_nodes || [],
        mind_map_edges: project.mind_map_edges || [],
      });
      setExpandState("idle");
      setProposedChapters([]);
      setTab("outline");
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : "Could not save chapters");
      setExpandState("review");
    }
  }

  // React Flow nodes/edges for concept mind map tab
  const flowNodes: Node[] = useMemo(() => {
    if (!data?.mind_map_nodes.length) return [];
    const topicNodes = data.mind_map_nodes.filter((n) => n.node_type === "topic");
    const childNodes = data.mind_map_nodes.filter((n) => n.node_type !== "topic");
    const nodes: Node[] = [];
    const TOPIC_SPACING_X = 350;
    const CHILD_SPACING_Y = 80;

    topicNodes.forEach((node, i) => {
      nodes.push({
        id: node.id,
        position: { x: node.position_x || i * TOPIC_SPACING_X, y: node.position_y || 0 },
        data: { label: node.label },
        style: {
          background: NODE_COLORS[node.node_type] || "#7a7369",
          color: "#fff",
          borderRadius: "12px",
          padding: "12px 20px",
          fontSize: "14px",
          fontWeight: 600,
          border: "none",
          minWidth: "140px",
          textAlign: "center" as const,
        },
      });
    });

    const childrenByParent: Record<string, MindMapNode[]> = {};
    childNodes.forEach((n) => {
      const parent = n.parent_id || "orphan";
      if (!childrenByParent[parent]) childrenByParent[parent] = [];
      childrenByParent[parent].push(n);
    });

    Object.entries(childrenByParent).forEach(([parentId, children]) => {
      const parentNode = nodes.find((n) => n.id === parentId);
      const baseX = parentNode ? parentNode.position.x : 0;
      const baseY = parentNode ? parentNode.position.y + 120 : 200;

      children.forEach((node, j) => {
        nodes.push({
          id: node.id,
          position: {
            x: node.position_x || baseX + (j - (children.length - 1) / 2) * 200,
            y: node.position_y || baseY + j * CHILD_SPACING_Y,
          },
          data: { label: node.label },
          style: {
            background: NODE_COLORS[node.node_type] || "#a0978a",
            color: "#fff",
            borderRadius: "8px",
            padding: "8px 14px",
            fontSize: "12px",
            border: "none",
            minWidth: "100px",
            textAlign: "center" as const,
          },
        });
      });
    });

    return nodes;
  }, [data?.mind_map_nodes]);

  const flowEdges: Edge[] = useMemo(() => {
    if (!data?.mind_map_edges.length) return [];
    return data.mind_map_edges.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      label: e.label || undefined,
      animated: e.edge_type === "leads_to",
      style: {
        stroke: e.edge_type === "supports" ? "#059669" : e.edge_type === "contradicts" ? "#dc2626" : "#a0978a",
        strokeWidth: 1.5,
      },
    }));
  }, [data?.mind_map_edges]);

  const miniMapNodeColor = useCallback((node: Node) => {
    return (node.style as Record<string, string>)?.background || "#7a7369";
  }, []);

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <Spinner />
      </PageShell>
    );
  }

  const hasAnalysis = (data?.key_points?.length || 0) > 0;
  const hasChapters = (data?.chapters?.length || 0) > 0;

  // Pre-analysis: show audience selector + run analysis button
  if (!hasAnalysis) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <div style={{ padding: "0 40px 40px", maxWidth: 500, margin: "0 auto" }}>
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
            {analyzing && analyzeStep && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>{analyzeStep}</p>
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
      <div className="ds-analyze-body" style={{ padding: "0 40px 40px" }}>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "outline" as const, label: `Outline (${data?.chapters?.length || 0} chapters)` },
            { key: "voice" as const, label: "Voice Profile" },
            { key: "map" as const, label: "Concept Map" },
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
          <div className="ds-analyze-banner" style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
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
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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

        {/* Concept Map tab (AI-generated, read-only) */}
        {tab === "map" && (
          <GlassCard style={{ padding: 0, overflow: "hidden" }}>
            {flowNodes.length > 0 ? (
              <div style={{ height: 500 }}>
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  proOptions={{ hideAttribution: true }}
                  style={{ background: "transparent" }}
                >
                  <Background color="rgba(0,0,0,0.03)" gap={20} />
                  <Controls showInteractive={false} />
                  <MiniMap
                    nodeColor={miniMapNodeColor}
                    style={{ background: "#191816", borderRadius: 8 }}
                  />
                </ReactFlow>
              </div>
            ) : (
              <div style={{ padding: 60, textAlign: "center", color: "#a0978a" }}>
                No concept map generated yet.
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}
