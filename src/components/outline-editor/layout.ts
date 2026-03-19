import { Chapter, KeyPoint } from "@/types";

export const CHAPTER_WIDTH = 320;
export const CHAPTER_HEIGHT = 120;
export const KP_WIDTH = 280;
export const KP_HEIGHT = 80;

// Spacing
const COLUMN_GAP = 60;        // horizontal gap between chapter columns
const KP_GAP = 8;             // vertical gap between key points
const KP_TOP_OFFSET = 16;     // gap between chapter card bottom and first key point
const KP_INDENT = 20;         // indent key points from chapter left edge
const CANVAS_PADDING = 60;    // padding from top-left origin

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
  type: "chapter-chapter";
}

export function buildLayout(
  chapters: Chapter[],
  keyPoints: KeyPoint[]
): { positions: NotePosition[]; edges: EdgeDef[] } {
  const positions: NotePosition[] = [];
  const edges: EdgeDef[] = [];
  const kpMap = new Map(keyPoints.map((kp) => [kp.id, kp]));

  let cursorX = CANVAS_PADDING;

  chapters.forEach((ch, i) => {
    const color = NOTE_COLORS[i % NOTE_COLORS.length];
    const chX = cursorX;
    const chY = CANVAS_PADDING;

    // Chapter card
    positions.push({
      id: ch.id,
      type: "chapter",
      x: chX,
      y: chY,
      width: CHAPTER_WIDTH,
      height: CHAPTER_HEIGHT,
      color,
    });

    // Key points stacked vertically below chapter, indented slightly
    let kpY = chY + CHAPTER_HEIGHT + KP_TOP_OFFSET;
    const validKpIds = (ch.key_point_ids || []).filter((id) => kpMap.has(id));

    validKpIds.forEach((kpId) => {
      positions.push({
        id: kpId,
        type: "keyPoint",
        x: chX + KP_INDENT,
        y: kpY,
        width: KP_WIDTH,
        height: KP_HEIGHT,
        chapterId: ch.id,
        color,
      });

      kpY += KP_HEIGHT + KP_GAP;
    });

    // Column width is max of chapter width and key-point block width
    const columnWidth = Math.max(CHAPTER_WIDTH, KP_INDENT + KP_WIDTH);
    cursorX += columnWidth + COLUMN_GAP;
  });

  // Chapter-to-chapter edges (sequential)
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
