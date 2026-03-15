"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { KeyPoint, MindMapNode, MindMapEdge, VoiceProfile } from "@/types";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import GlassCard from "@/components/ui/GlassCard";
import DataPill from "@/components/ui/DataPill";
import PanelTitle from "@/components/ui/PanelTitle";
import StepBlock from "@/components/ui/StepBlock";
import PageShell from "@/components/ui/PageShell";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";

interface AnalysisData {
  key_points: KeyPoint[];
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
  const [tab, setTab] = useState<"points" | "voice" | "map">("points");

  useEffect(() => {
    fetch(`/api/project/${projectId}`)
      .then((r) => r.json())
      .then((project) => {
        setData({
          key_points: project.key_points || [],
          voice_profile: project.voice_profile,
          mind_map_nodes: project.mind_map_nodes || [],
          mind_map_edges: project.mind_map_edges || [],
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  // Convert DB nodes/edges to React Flow format
  const flowNodes: Node[] = useMemo(() => {
    if (!data?.mind_map_nodes.length) return [];

    const topicNodes = data.mind_map_nodes.filter(
      (n) => n.node_type === "topic"
    );
    const childNodes = data.mind_map_nodes.filter(
      (n) => n.node_type !== "topic"
    );

    const nodes: Node[] = [];
    const TOPIC_SPACING_X = 350;
    const CHILD_SPACING_Y = 80;

    // Layout topic nodes horizontally
    topicNodes.forEach((node, i) => {
      nodes.push({
        id: node.id,
        position: {
          x: node.position_x || i * TOPIC_SPACING_X,
          y: node.position_y || 0,
        },
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

    // Layout child nodes under their parents
    const childrenByParent: Record<string, MindMapNode[]> = {};
    for (const child of childNodes) {
      const parentId = child.parent_id || "orphan";
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(child);
    }

    for (const [parentId, children] of Object.entries(childrenByParent)) {
      const parentNode = nodes.find((n) => n.id === parentId);
      const baseX = parentNode?.position.x ?? 0;
      const baseY = (parentNode?.position.y ?? 0) + 100;

      children.forEach((child, i) => {
        nodes.push({
          id: child.id,
          position: {
            x: child.position_x || baseX + (i - children.length / 2) * 180,
            y: child.position_y || baseY + i * CHILD_SPACING_Y,
          },
          data: { label: child.label },
          style: {
            background: NODE_COLORS[child.node_type] || "#e7e5e4",
            color: "#fff",
            borderRadius: "8px",
            padding: "8px 14px",
            fontSize: "12px",
            fontWeight: 500,
            border: "none",
          },
        });
      });
    }

    return nodes;
  }, [data?.mind_map_nodes]);

  const flowEdges: Edge[] = useMemo(() => {
    if (!data?.mind_map_edges.length) return [];

    return data.mind_map_edges.map((edge) => ({
      id: edge.id,
      source: edge.source_id,
      target: edge.target_id,
      label: edge.label || undefined,
      type: "default",
      style: {
        stroke:
          edge.edge_type === "supports"
            ? "#059669"
            : edge.edge_type === "contradicts"
              ? "#dc2626"
              : "#a8a29e",
        strokeWidth: 1.5,
      },
      animated: edge.edge_type === "leads_to",
    }));
  }, [data?.mind_map_edges]);

  if (loading) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <Spinner />
      </PageShell>
    );
  }

  if (!data || data.key_points.length === 0) {
    return (
      <PageShell projectId={projectId} currentStep="analysis">
        <EmptyState message="No analysis data yet. Go back and run analysis on your transcripts." />
      </PageShell>
    );
  }

  const tabLabels: Record<string, string> = {
    points: `Key Points (${data.key_points.length})`,
    voice: "Voice Profile",
    map: "Mind Map",
  };

  return (
    <PageShell projectId={projectId} currentStep="analysis">
      <div style={{ padding: "0 40px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "#191816" }}>Analysis</h1>
          <button
            onClick={() => router.push(`/project/${projectId}/outline`)}
            className="nodum-btn"
          >
            Generate Outline
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {(["points", "voice", "map"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 18px",
                borderRadius: "var(--radius-pill)",
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                background: tab === t ? "#191816" : "rgba(255,255,255,0.5)",
                color: tab === t ? "white" : "#191816",
              }}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Key Points */}
        {tab === "points" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.key_points.map((kp, i) => (
              <GlassCard key={kp.id} style={{ padding: 20 }}>
                <StepBlock
                  num={`${String(i + 1).padStart(2, "0")} — ${kp.tags[0]?.toUpperCase() || "KEY POINT"}`}
                  title={kp.title}
                  desc={kp.summary}
                  status="active"
                />
                {kp.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {kp.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: "3px 10px",
                          borderRadius: "var(--radius-pill)",
                          background: "rgba(255,255,255,0.6)",
                          border: "1px solid rgba(255,255,255,0.8)",
                          color: "#7a7369",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {kp.supporting_quotes.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    {kp.supporting_quotes.map((q, qi) => (
                      <blockquote
                        key={qi}
                        style={{
                          borderLeft: "3px solid rgba(0,0,0,0.15)",
                          paddingLeft: 12,
                          margin: 0,
                          fontSize: 12,
                          fontStyle: "italic",
                          color: "#7a7369",
                          lineHeight: 1.6,
                        }}
                      >
                        &ldquo;{q}&rdquo;
                      </blockquote>
                    ))}
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}

        {/* Voice Profile */}
        {tab === "voice" && data.voice_profile && (
          <GlassCard style={{ padding: 32 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              <DataPill label="Tone" metric={data.voice_profile.tone} accentColor="#191816" />
              <DataPill label="Vocabulary Level" metric={data.voice_profile.vocabulary_level} accentColor="#d4b895" />
              <DataPill label="Sentence Patterns" metric={data.voice_profile.sentence_patterns} accentColor="#7a7369" />
              <DataPill label="Pacing" metric={data.voice_profile.pacing} accentColor="#a0978a" />
              <DataPill label="Illustration Style" metric={data.voice_profile.illustration_style} accentColor="#8b8276" />
            </div>
            <div style={{ marginBottom: 24 }}>
              <PanelTitle>Formality Score</PanelTitle>
              <div style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 32,
                fontWeight: 700,
                color: "#191816",
                marginTop: 12,
              }}>
                {data.voice_profile.formality_score}
                <span style={{ fontSize: 14, color: "#a0978a", fontWeight: 400, marginLeft: 8 }}>/ 5</span>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <PanelTitle>Signature Phrases</PanelTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {data.voice_profile.signature_phrases.map((p) => (
                  <span
                    key={p}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "var(--radius-pill)",
                      background: "rgba(255,255,255,0.6)",
                      border: "1px solid rgba(255,255,255,0.9)",
                      fontSize: 13,
                      color: "#191816",
                    }}
                  >
                    &ldquo;{p}&rdquo;
                  </span>
                ))}
              </div>
            </div>
            <div>
              <PanelTitle>Rhetorical Devices</PanelTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {data.voice_profile.rhetorical_devices.map((d) => (
                  <span
                    key={d}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "var(--radius-pill)",
                      background: "rgba(0,0,0,0.04)",
                      border: "1px solid rgba(0,0,0,0.08)",
                      fontSize: 13,
                      color: "#7a7369",
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        {tab === "voice" && !data.voice_profile && (
          <EmptyState message="No voice profile generated yet." />
        )}

        {/* Mind Map */}
        {tab === "map" && (
          <div
            style={{
              height: 500,
              background: "rgba(255,255,255,0.45)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.8)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}
          >
            {flowNodes.length > 0 ? (
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                fitView
                minZoom={0.3}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={20} size={1} color="rgba(0,0,0,0.04)" />
                <Controls />
                <MiniMap
                  nodeColor={(n) =>
                    (n.style?.background as string) || "#7a7369"
                  }
                  maskColor="rgba(241,230,205,0.7)"
                />
              </ReactFlow>
            ) : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "#7a7369" }}>
                  No mind map data yet. Run analysis to generate.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
