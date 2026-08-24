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
  columnWidth: number;
  kpOrientation: "vertical" | "horizontal";
}

export interface EdgeDef {
  id: string;
  sourceId: string;
  targetId: string;
  type: "chapter-chapter";
}

export type LayoutMode = "desktop" | "mobile";

const MOBILE_ROW_GAP = 36;

/** Sticky note color keyed by chapter id — survives reorder. */
export function colorForChapter(chapter: Chapter, allChapters: Chapter[]): NoteColor {
  const stable = [...allChapters].sort((a, b) => {
    const byCreated = (a.created_at || "").localeCompare(b.created_at || "");
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
  const idx = Math.max(0, stable.findIndex((c) => c.id === chapter.id));
  return NOTE_COLORS[idx % NOTE_COLORS.length];
}

export function buildLayout(
  chapters: Chapter[],
  keyPoints: KeyPoint[],
  mode: LayoutMode = "desktop"
): { columns: ColumnLayout[]; edges: EdgeDef[] } {
  if (mode === "mobile") {
    return buildMobileLayout(chapters, keyPoints);
  }
  return buildDesktopLayout(chapters, keyPoints);
}

function buildDesktopLayout(
  chapters: Chapter[],
  keyPoints: KeyPoint[]
): { columns: ColumnLayout[]; edges: EdgeDef[] } {
  const columns: ColumnLayout[] = [];
  const edges: EdgeDef[] = [];
  const kpMap = new Map(keyPoints.map((kp) => [kp.id, kp]));

  let cursorX = CANVAS_PADDING;

  chapters.forEach((ch) => {
    const color = colorForChapter(ch, chapters);
    const validKpIds = (ch.key_point_ids || []).filter((id) => kpMap.has(id));

    const kpStackHeight = validKpIds.length > 0
      ? KP_TOP_OFFSET + validKpIds.length * KP_HEIGHT + (validKpIds.length - 1) * KP_GAP
      : 0;
    const columnHeight = CHAPTER_HEIGHT + kpStackHeight;
    const columnWidth = Math.max(CHAPTER_WIDTH, KP_INDENT + KP_WIDTH);

    columns.push({
      chapterId: ch.id,
      x: cursorX,
      y: CANVAS_PADDING,
      color,
      kpIds: validKpIds,
      columnHeight,
      columnWidth,
      kpOrientation: "vertical",
    });

    cursorX += columnWidth + COLUMN_GAP;
  });

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

function buildMobileLayout(
  chapters: Chapter[],
  keyPoints: KeyPoint[]
): { columns: ColumnLayout[]; edges: EdgeDef[] } {
  const columns: ColumnLayout[] = [];
  const edges: EdgeDef[] = [];
  const kpMap = new Map(keyPoints.map((kp) => [kp.id, kp]));

  const MOBILE_CANVAS_PADDING = 20;
  let cursorY = MOBILE_CANVAS_PADDING;
  const x = MOBILE_CANVAS_PADDING;

  chapters.forEach((ch) => {
    const color = colorForChapter(ch, chapters);
    const validKpIds = (ch.key_point_ids || []).filter((id) => kpMap.has(id));

    const kpRowWidth = validKpIds.length > 0
      ? validKpIds.length * KP_WIDTH + (validKpIds.length - 1) * KP_GAP
      : 0;
    const columnWidth = Math.max(CHAPTER_WIDTH, kpRowWidth);
    const kpStackHeight = validKpIds.length > 0 ? KP_TOP_OFFSET + KP_HEIGHT : 0;
    const columnHeight = CHAPTER_HEIGHT + kpStackHeight;

    columns.push({
      chapterId: ch.id,
      x,
      y: cursorY,
      color,
      kpIds: validKpIds,
      columnHeight,
      columnWidth,
      kpOrientation: "horizontal",
    });

    cursorY += columnHeight + MOBILE_ROW_GAP;
  });

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
