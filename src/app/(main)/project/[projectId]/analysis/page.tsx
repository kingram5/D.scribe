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

const OutlineEditor = dynamic(
  () => import("@/components/outline-editor/OutlineEditor"),
  { ssr: false }
);
import PanelTitle from "@/components/ui/PanelTitle";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import JobProgress from "@/components/ui/JobProgress";
import { useJob } from "@/hooks/useJob";

interface AnalysisData {
  key_points: KeyPoint[];
  chapters: Chapter[];
  voice_profile: VoiceProfile | null;
  mind_map_nodes: MindMapNode[];
  mind_map_edges: MindMapEdge[];
}

const NODE_COLORS: Record<string, string> = {
  topic: "#FFFFFF",
  subtopic: "var(--text-secondary)",
  quote: "#d4b895",
  scripture: "#8b8276",
  illustration: "var(--text-tertiary)",
};

export default function AnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"outline" | "voice" | "map">("outline");
  const [numChapters, setNumChapters] = useState(5);
  const [targetWords, setTargetWords] = useState(3000);
  const [audience, setAudience] = useState<Audience>("General");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const analyzeJob = useJob();

  const AUDIENCES: Audience[] = [
    "General",
    "Academic",
    "Faith Community",
    "Business/Leadership",
    "Self-Help",
    "Young Adult",
  ];

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
          background: NODE_COLORS[node.node_type] || "var(--text-secondary)",
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
            background: NODE_COLORS[node.node_type] || "var(--text-tertiary)",
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
        stroke: e.edge_type === "supports" ? "#059669" : e.edge_type === "contradicts" ? "#D98B58" : "var(--text-tertiary)",
        strokeWidth: 1.5,
      },
    }));
  }, [data?.mind_map_edges]);

  const miniMapNodeColor = useCallback((node: Node) => {
    return (node.style as Record<string, string>)?.background || "var(--text-secondary)";
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

  // Pre-analysis view: inputs + analyze button
  if (!hasAnalysis) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <div style={{ padding: "0 40px 40px", maxWidth: 600, margin: "0 auto" }}>
          <GlassCard style={{ padding: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              Analysis
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
              AI will extract key points, build a voice profile, and create your chapter outline. Takes 2-5 minutes depending on transcript length.
            </p>

            {/* Target Audience */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                Who is this book for?
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {AUDIENCES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAudience(a)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-pill, 20px)",
                      border: "1px solid",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      background: audience === a ? "#C17A47" : "transparent",
                      color: audience === a ? "white" : "#FFFFFF",
                      borderColor: audience === a ? "#C17A47" : "var(--ds-input-border)",
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
              <div>
                <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
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
                    background: "var(--ds-input-bg)",
                    border: "1px solid var(--ds-input-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 14px",
                    fontSize: 18,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
                  Words per Chapter
                </label>
                <input
                  type="number"
                  min={500}
                  max={10000}
                  step={500}
                  value={targetWords}
                  onChange={(e) => setTargetWords(parseInt(e.target.value) || 3000)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "var(--ds-input-bg)",
                    border: "1px solid var(--ds-input-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 14px",
                    fontSize: 18,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Word count context */}
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 24, textAlign: "center" }}>
              ~{(numChapters * targetWords).toLocaleString()} words total
              {numChapters * targetWords < 20000 && " (pamphlet/short guide)"}
              {numChapters * targetWords >= 20000 && numChapters * targetWords < 50000 && " (short book)"}
              {numChapters * targetWords >= 50000 && numChapters * targetWords < 80000 && " (standard book)"}
              {numChapters * targetWords >= 80000 && " (long book)"}
            </p>

            {analyzeError && (
              <div style={{
                marginBottom: 16,
                padding: "12px 16px",
                background: "rgba(193,122,71,0.1)",
                border: "1px solid rgba(193,122,71,0.2)",
                borderRadius: 8,
                fontSize: 13,
                color: "#D98B58",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span>Still working on it — give it another try</span>
                <button
                  onClick={runAnalysis}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#D98B58",
                    background: "none",
                    border: "1px solid rgba(193,122,71,0.3)",
                    borderRadius: 6,
                    padding: "4px 12px",
                    cursor: "pointer",
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {analyzing && analyzeStep && (
              <div style={{
                marginBottom: 16,
                padding: "12px 16px",
                background: "rgba(193,122,71,0.1)",
                border: "1px solid rgba(193,122,71,0.12)",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: "2px solid #C17A47",
                  borderTopColor: "transparent",
                  animation: "spin 0.8s linear infinite",
                }} />
                {analyzeStep}
              </div>
            )}

            {/* What happens next */}
            <div style={{
              marginBottom: 20,
              padding: "14px 16px",
              background: "var(--ds-card-bg)",
              borderRadius: 10,
              border: "1px solid var(--ds-input-bg)",
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                What happens next?
              </p>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                AI reads your transcript, identifies key themes and arguments, captures your speaking voice, and generates a chapter-by-chapter outline. You&apos;ll be able to rearrange chapters and refine before generating.
              </p>
            </div>

            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="nodum-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {analyzing ? "Analyzing..." : "Find my key ideas (1 credit)"}
            </button>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  // Post-analysis view: tabs for outline editor, voice profile, concept map
  return (
    <PageShell projectId={projectId} currentStep="analysis">
      <div style={{ padding: "0 40px 40px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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
                background: tab === t.key ? "var(--text-primary)" : "var(--ds-input-bg)",
                color: tab === t.key ? "var(--ds-paper)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Outline tab — interactive post-it board editor */}
        {tab === "outline" && hasChapters && data && (
          <div style={{ minHeight: 600 }}>
            <OutlineEditor
              projectId={projectId}
              initialChapters={data.chapters}
              initialKeyPoints={data.key_points}
              onContinue={() => router.push(`/project/${projectId}/generate`)}
            />
          </div>
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
                  <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                    Tone
                  </label>
                  <p style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 4 }}>
                    {data.voice_profile.tone}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                    Vocabulary Level
                  </label>
                  <p style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 4 }}>
                    {data.voice_profile.vocabulary_level}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                    Formality
                  </label>
                  <p style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 4 }}>
                    {data.voice_profile.formality_score}/5
                  </p>
                </div>
                {data.voice_profile.signature_phrases && (
                  <div>
                    <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>
                      Signature Phrases
                    </label>
                    <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {data.voice_profile.signature_phrases.map((p, i) => (
                        <span key={i} style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          background: "rgba(193,122,71,0.1)",
                          borderRadius: 12,
                          color: "var(--text-secondary)",
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: "var(--text-tertiary)", marginTop: 16 }}>No voice profile yet.</p>
            )}
          </GlassCard>
        )}

        {/* Concept Map tab (AI-generated, read-only) */}
        {tab === "map" && (
          <GlassCard style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {flowNodes.length > 0 ? (
              <div style={{ height: 600 }}>
                <ReactFlow
                  nodes={flowNodes}
                  edges={flowEdges}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  proOptions={{ hideAttribution: true }}
                  style={{ background: "transparent" }}
                >
                  <Background color="var(--ds-input-bg)" gap={20} />
                  <Controls showInteractive={false} />
                  <MiniMap
                    nodeColor={miniMapNodeColor}
                    style={{ background: "var(--ds-input-bg)", borderRadius: 8 }}
                  />
                </ReactFlow>
              </div>
            ) : (
              <div style={{ padding: 60, textAlign: "center", color: "var(--text-tertiary)" }}>
                No concept map generated yet.
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}
