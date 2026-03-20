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

export interface ColumnLayout {
  chapterId: string;
  x: number;
  y: number;
  color: NoteColor;
  kpIds: string[];
  columnHeight: number;
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
): { columns: ColumnLayout[]; edges: EdgeDef[] } {
  const columns: ColumnLayout[] = [];
  const edges: EdgeDef[] = [];
  const kpMap = new Map(keyPoints.map((kp) => [kp.id, kp]));

  let cursorX = CANVAS_PADDING;

  chapters.forEach((ch, i) => {
    const color = NOTE_COLORS[i % NOTE_COLORS.length];
    const validKpIds = (ch.key_point_ids || []).filter((id) => kpMap.has(id));

    // Column height = chapter header + gap + stacked KPs
    const kpStackHeight = validKpIds.length > 0
      ? KP_TOP_OFFSET + validKpIds.length * KP_HEIGHT + (validKpIds.length - 1) * KP_GAP
      : 0;
    const columnHeight = CHAPTER_HEIGHT + kpStackHeight;

    columns.push({
      chapterId: ch.id,
      x: cursorX,
      y: CANVAS_PADDING,
      color,
      kpIds: validKpIds,
      columnHeight,
    });

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

  return { columns, edges };
}

// Re-export constants needed by OutlineEditor for KP positioning within columns
export { KP_GAP, KP_TOP_OFFSET, KP_INDENT };
