"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { KeyPoint, MindMapNode, MindMapEdge, VoiceProfile, Chapter } from "@/types";
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
import JobProgress from "@/components/ui/JobProgress";
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
  const [numChapters, setNumChapters] = useState(5);
  const [targetWords, setTargetWords] = useState(3000);
  const analyzeJob = useJob();

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
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function runAnalysis() {
    await analyzeJob.start({
      type: "analyze",
      project_id: projectId,
      num_chapters: numChapters,
      target_word_count: targetWords,
    });
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

  // Pre-analysis view: inputs + analyze button
  if (!hasAnalysis) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <div style={{ padding: "0 40px 40px", maxWidth: 600, margin: "0 auto" }}>
          <GlassCard style={{ padding: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#191816", marginBottom: 8 }}>
              Analysis
            </h1>
            <p style={{ fontSize: 14, color: "#7a7369", marginBottom: 32, lineHeight: 1.6 }}>
              AI will extract key points, build a voice profile, and create your chapter outline.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <div>
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
              <div>
                <label style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#a0978a", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
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

            {analyzeJob.isRunning && (
              <div style={{ marginBottom: 16 }}>
                <JobProgress
                  progress={analyzeJob.progress}
                  error={analyzeJob.error}
                  status={analyzeJob.status}
                />
              </div>
            )}
            {analyzeJob.status === "failed" && (
              <div style={{ marginBottom: 16 }}>
                <JobProgress
                  progress={null}
                  error={analyzeJob.error}
                  status="failed"
                  onRetry={runAnalysis}
                />
              </div>
            )}

            <button
              onClick={runAnalysis}
              disabled={analyzeJob.isRunning}
              className="nodum-btn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {analyzeJob.isRunning ? "Analyzing..." : "Analyze"}
            </button>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  // Post-analysis view: tabs for outline editor, voice profile, concept map
  return (
    <PageShell projectId={projectId} currentStep="analysis">
      <div style={{ padding: "0 40px 40px" }}>
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
