import dagre from "@dagrejs/dagre";
import { Chapter, KeyPoint } from "@/types";
import type { Node, Edge } from "@xyflow/react";

const CHAPTER_WIDTH = 240;
const CHAPTER_HEIGHT = 80;
const KP_WIDTH = 200;
const KP_HEIGHT = 56;

export interface OutlineNode extends Node {
  data: {
    chapter?: Chapter;
    keyPoint?: KeyPoint;
    chapterId?: string;
    label: string;
    summary?: string;
    onEdit?: (field: "title" | "summary", value: string) => void;
    onDelete?: () => void;
    isDropTarget?: boolean;
    expanded?: boolean;
    onToggleExpand?: () => void;
  };
}

export function buildNodesAndEdges(
  chapters: Chapter[],
  keyPoints: KeyPoint[]
): { nodes: OutlineNode[]; edges: Edge[] } {
  const nodes: OutlineNode[] = [];
  const edges: Edge[] = [];
  const kpMap = new Map(keyPoints.map((kp) => [kp.id, kp]));

  // Chapter nodes
  chapters.forEach((ch) => {
    nodes.push({
      id: `ch-${ch.id}`,
      type: "chapter",
      position: { x: 0, y: 0 },
      data: {
        chapter: ch,
        label: `Ch. ${ch.chapter_number}: ${ch.title}`,
        summary: ch.summary,
      },
    });

    // Key point nodes for this chapter
    (ch.key_point_ids || []).forEach((kpId) => {
      const kp = kpMap.get(kpId);
      if (!kp) return;

      nodes.push({
        id: `kp-${kpId}`,
        type: "keyPoint",
        position: { x: 0, y: 0 },
        data: {
          keyPoint: kp,
          chapterId: ch.id,
          label: kp.title,
          summary: kp.summary,
        },
      });

      // Chapter → key point edge
      edges.push({
        id: `e-${ch.id}-${kpId}`,
        source: `ch-${ch.id}`,
        target: `kp-${kpId}`,
        type: "default",
        style: { stroke: "#b45309", strokeWidth: 1.5, opacity: 0.4 },
      });
    });
  });

  // Chapter → chapter edges (sequential flow)
  for (let i = 0; i < chapters.length - 1; i++) {
    edges.push({
      id: `e-ch-${chapters[i].id}-${chapters[i + 1].id}`,
      source: `ch-${chapters[i].id}`,
      target: `ch-${chapters[i + 1].id}`,
      type: "default",
      style: { stroke: "#a0978a", strokeWidth: 1.5, strokeDasharray: "6 4", opacity: 0.5 },
    });
  }

  return { nodes, edges };
}

export function applyDagreLayout(nodes: OutlineNode[], edges: Edge[]): OutlineNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", ranksep: 180, nodesep: 60, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const isChapter = node.type === "chapter";
    g.setNode(node.id, {
      width: isChapter ? CHAPTER_WIDTH : KP_WIDTH,
      height: isChapter ? CHAPTER_HEIGHT : KP_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const isChapter = node.type === "chapter";
    return {
      ...node,
      position: {
        x: pos.x - (isChapter ? CHAPTER_WIDTH : KP_WIDTH) / 2,
        y: pos.y - (isChapter ? CHAPTER_HEIGHT : KP_HEIGHT) / 2,
      },
    };
  });
}
