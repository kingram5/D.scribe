import dagre from "@dagrejs/dagre";
import { Chapter, KeyPoint } from "@/types";
import type { Edge } from "@xyflow/react";

export const CHAPTER_WIDTH = 320;
export const CHAPTER_HEIGHT = 280;
export const KP_WIDTH = 160;
export const KP_HEIGHT = 120;

export const NOTE_COLORS = ["#fdf5c9", "#fbe0e0", "#e0f2fe", "#e6f4ea"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface NotePosition {
  id: string;
  type: "chapter" | "keyPoint";
  x: number;
  y: number;
  width: number;
  height: number;
  chapterId?: string;
  color: NoteColor;
}

export interface EdgeDef {
  id: string;
  sourceId: string;
  targetId: string;
  type: "chapter-chapter" | "chapter-keypoint";
}

export function buildLayout(
  chapters: Chapter[],
  keyPoints: KeyPoint[]
): { positions: NotePosition[]; edges: EdgeDef[] } {
  const positions: NotePosition[] = [];
  const edges: EdgeDef[] = [];
  const kpMap = new Map(keyPoints.map((kp) => [kp.id, kp]));

  // Build dagre graph for auto-layout
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 120, nodesep: 80, marginx: 60, marginy: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add chapter nodes
  chapters.forEach((ch) => {
    g.setNode(`ch-${ch.id}`, { width: CHAPTER_WIDTH, height: CHAPTER_HEIGHT });
  });

  // Add key point nodes
  chapters.forEach((ch) => {
    (ch.key_point_ids || []).forEach((kpId) => {
      if (!kpMap.has(kpId)) return;
      g.setNode(`kp-${kpId}`, { width: KP_WIDTH, height: KP_HEIGHT });
      g.setEdge(`ch-${ch.id}`, `kp-${kpId}`);
    });
  });

  // Chapter-to-chapter edges
  for (let i = 0; i < chapters.length - 1; i++) {
    g.setEdge(`ch-${chapters[i].id}`, `ch-${chapters[i + 1].id}`);
  }

  // Dagre edges for layout reference
  const dagreEdges: Edge[] = [];
  chapters.forEach((ch, i) => {
    (ch.key_point_ids || []).forEach((kpId) => {
      if (!kpMap.has(kpId)) return;
      dagreEdges.push({ id: `e-${ch.id}-${kpId}`, source: `ch-${ch.id}`, target: `kp-${kpId}` });
    });
    if (i < chapters.length - 1) {
      dagreEdges.push({
        id: `e-ch-${chapters[i].id}-${chapters[i + 1].id}`,
        source: `ch-${chapters[i].id}`,
        target: `ch-${chapters[i + 1].id}`,
      });
    }
  });

  dagre.layout(g);

  // Extract positions
  chapters.forEach((ch, i) => {
    const pos = g.node(`ch-${ch.id}`);
    positions.push({
      id: ch.id,
      type: "chapter",
      x: pos.x - CHAPTER_WIDTH / 2,
      y: pos.y - CHAPTER_HEIGHT / 2,
      width: CHAPTER_WIDTH,
      height: CHAPTER_HEIGHT,
      color: NOTE_COLORS[i % NOTE_COLORS.length],
    });

    (ch.key_point_ids || []).forEach((kpId) => {
      if (!kpMap.has(kpId)) return;
      const kpPos = g.node(`kp-${kpId}`);
      positions.push({
        id: kpId,
        type: "keyPoint",
        x: kpPos.x - KP_WIDTH / 2,
        y: kpPos.y - KP_HEIGHT / 2,
        width: KP_WIDTH,
        height: KP_HEIGHT,
        chapterId: ch.id,
        color: NOTE_COLORS[i % NOTE_COLORS.length],
      });

      edges.push({
        id: `e-${ch.id}-${kpId}`,
        sourceId: ch.id,
        targetId: kpId,
        type: "chapter-keypoint",
      });
    });
  });

  // Chapter-to-chapter edges
  for (let i = 0; i < chapters.length - 1; i++) {
    edges.push({
      id: `e-ch-${chapters[i].id}-${chapters[i + 1].id}`,
      sourceId: chapters[i].id,
      targetId: chapters[i + 1].id,
      type: "chapter-chapter",
    });
  }

  return { positions, edges };
}
