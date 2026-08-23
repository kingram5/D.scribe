"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chapter, KeyPoint } from "@/types";
import { useOutlineState } from "./useOutlineState";
import {
  buildLayout,
  CHAPTER_WIDTH,
  CHAPTER_HEIGHT,
  KP_WIDTH,
  KP_HEIGHT,
  KP_GAP,
  KP_TOP_OFFSET,
  KP_INDENT,
  type ColumnLayout,
  type EdgeDef,
  type LayoutMode,
  type NoteColor,
} from "./layout";
import { ChapterNote } from "./ChapterNode";
import { KeyPointNote } from "./KeyPointNode";
import { EditorToolbar } from "./EditorToolbar";

interface OutlineEditorProps {
  projectId: string;
  initialChapters: Chapter[];
  initialKeyPoints: KeyPoint[];
  onContinue: () => void;
}

interface DragColumn {
  id: string;
  x: number;
  y: number;
  rotation: number;
  baseRotation: number;
  targetRotation: number;
  vx: number;
  isDragging: boolean;
}

interface KpDragState {
  kpId: string;
  fromChapterId: string;
  fromIndex: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  color: NoteColor;
}

function randomRotation(range: number) {
  return (Math.random() - 0.5) * 2 * range;
}

const MOBILE_ZOOM_MIN = 0.25;
const MOBILE_ZOOM_MAX = 2.5;
const MOBILE_FRAME_PADDING = 20;
const LONG_PRESS_MS = 280;
const LONG_PRESS_CANCEL_PX = 28;

type LongPressPayload =
  | { type: "chapter"; chapterId: string }
  | { type: "kp"; kpId: string; chapterId: string; kpIndex: number; color: NoteColor };

function clampZoom(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function getBorderColor(color: NoteColor) {
  switch (color) {
    case "#fdf5c9": return "rgba(230, 217, 108, 0.3)";
    case "#fbe0e0": return "rgba(232, 160, 160, 0.3)";
    case "#e0f2fe": return "rgba(126, 200, 240, 0.3)";
    case "#e6f4ea": return "rgba(140, 200, 158, 0.3)";
  }
}

function getHighlightBorder(color: NoteColor) {
  switch (color) {
    case "#fdf5c9": return "rgba(230, 217, 108, 0.7)";
    case "#fbe0e0": return "rgba(232, 160, 160, 0.7)";
    case "#e0f2fe": return "rgba(126, 200, 240, 0.7)";
    case "#e6f4ea": return "rgba(140, 200, 158, 0.7)";
  }
}

function getColumnBg(color: NoteColor) {
  switch (color) {
    case "#fdf5c9": return "rgba(253, 245, 201, 0.15)";
    case "#fbe0e0": return "rgba(251, 224, 224, 0.15)";
    case "#e0f2fe": return "rgba(224, 242, 254, 0.15)";
    case "#e6f4ea": return "rgba(230, 244, 234, 0.15)";
  }
}

function getHighlightBg(color: NoteColor) {
  switch (color) {
    case "#fdf5c9": return "rgba(253, 245, 201, 0.35)";
    case "#fbe0e0": return "rgba(251, 224, 224, 0.35)";
    case "#e0f2fe": return "rgba(224, 242, 254, 0.35)";
    case "#e6f4ea": return "rgba(230, 244, 234, 0.35)";
  }
}

function OutlineEditorInner({
  projectId,
  initialChapters,
  initialKeyPoints,
  onContinue,
}: OutlineEditorProps) {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useOutlineState();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-current refs — used inside stale event handler closures
  const stateRef = useRef(state);
  const dispatchRef = useRef(dispatch);
  useEffect(() => { stateRef.current = state; dispatchRef.current = dispatch; }, [state, dispatch]);

  // Mutable column states for physics (avoid re-renders per frame)
  const columnsRef = useRef<Map<string, DragColumn>>(new Map());
  const dragRef = useRef<{
    noteId: string | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    canvasStartX: number;
    canvasStartY: number;
  }>({ noteId: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0, canvasStartX: 0, canvasStartY: 0 });
  const rafRef = useRef<number>(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mobileSpacerRef = useRef<HTMLDivElement>(null);
  const mobileScaleRef = useRef<HTMLDivElement>(null);
  const canvasBoundsRef = useRef({ width: 800, height: 600 });
  const hasMobileFramedRef = useRef(false);
  const pendingPinchRef = useRef<{ zoom: number; viewportX: number; viewportY: number } | null>(null);
  const pinchRafRef = useRef(0);
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    startX: number;
    startY: number;
    payload: LongPressPayload;
  } | null>(null);
  const columnsListRef = useRef<ColumnLayout[]>([]);
  const isNoteDraggingRef = useRef(false);
  const lastTouchRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window === "undefined") return "desktop";
    return window.matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop";
  });
  const layoutModeRef = useRef<LayoutMode>("desktop");

  // KP drag state — separate from column drag
  const kpDragRef = useRef<KpDragState | null>(null);
  const [nearestColId, setNearestColId] = useState<string | null>(null);
  const [isNoteDragging, setIsNoteDragging] = useState(false);

  // Layout data
  const [columns, setColumns] = useState<ColumnLayout[]>([]);
  const [edges, setEdges] = useState<EdgeDef[]>([]);
  // Force re-render counter for physics updates
  const [, setRenderTick] = useState(0);

  // Pan + zoom state (mutable refs for perf, state for render)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const pinchRef = useRef<{ initialDistance: number; initialZoom: number } | null>(null);

  // Combine dialog
  const [confirmCombine, setConfirmCombine] = useState<{
    sourceId: string;
    targetId: string;
    type: "keyPoint" | "chapter";
  } | null>(null);

  // Initialize state — deduplicate KPs so each appears in only one chapter
  useEffect(() => {
    if (initialChapters.length > 0 || initialKeyPoints.length > 0) {
      const seen = new Set<string>();
      const deduped = initialChapters.map((ch) => {
        const uniqueIds = (ch.key_point_ids || []).filter((id) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        return uniqueIds.length !== (ch.key_point_ids || []).length
          ? { ...ch, key_point_ids: uniqueIds }
          : ch;
      });
      dispatch({ type: "INIT", chapters: deduped, keyPoints: initialKeyPoints });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    layoutModeRef.current = layoutMode;
  }, [layoutMode]);

  useEffect(() => {
    columnsListRef.current = columns;
  }, [columns]);

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return { x: clientX, y: clientY };

    const rect = el.getBoundingClientRect();
    const z = zoomRef.current;

    if (layoutModeRef.current === "mobile") {
      return {
        x: (clientX - rect.left + el.scrollLeft) / z,
        y: (clientY - rect.top + el.scrollTop) / z,
      };
    }

    return {
      x: (clientX - rect.left - panRef.current.x) / z,
      y: (clientY - rect.top - panRef.current.y) / z,
    };
  }, []);

  const syncMobileZoomDom = useCallback((newZoom: number) => {
    const bounds = canvasBoundsRef.current;
    const spacer = mobileSpacerRef.current;
    const scaleLayer = mobileScaleRef.current;
    if (spacer) {
      spacer.style.width = `${bounds.width * newZoom}px`;
      spacer.style.height = `${bounds.height * newZoom}px`;
    }
    if (scaleLayer) {
      scaleLayer.style.transform = `scale(${newZoom})`;
    }
  }, []);

  const scrollFirstChapterIntoView = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return false;

    const firstChapterId = columnsListRef.current[0]?.chapterId;
    if (!firstChapterId) return false;

    const note = el.querySelector(`[data-outline-chapter="${firstChapterId}"]`) as HTMLElement | null;
    if (!note) return false;

    const pad = MOBILE_FRAME_PADDING;
    const noteRect = note.getBoundingClientRect();
    const canvasRect = el.getBoundingClientRect();

    el.scrollLeft = Math.max(0, el.scrollLeft + (noteRect.left - canvasRect.left) - pad);
    el.scrollTop = Math.max(0, el.scrollTop + (noteRect.top - canvasRect.top) - pad);
    return true;
  }, []);

  const frameMobileViewport = useCallback(() => {
    const el = canvasRef.current;
    const cols = columnsListRef.current;
    if (!el || cols.length === 0 || layoutModeRef.current !== "mobile") return false;

    const viewW = el.clientWidth;
    const viewH = el.clientHeight;
    if (viewW < 40 || viewH < 40) return false;

    const pad = MOBILE_FRAME_PADDING;
    const firstCol = cols[0];
    const focusWidth = Math.max(CHAPTER_WIDTH, Math.min(firstCol.columnWidth, viewW));
    const fitZoom = clampZoom(
      (viewW - pad * 2) / focusWidth,
      MOBILE_ZOOM_MIN,
      1
    );

    zoomRef.current = fitZoom;
    setZoom(fitZoom);
    syncMobileZoomDom(fitZoom);

    requestAnimationFrame(() => {
      scrollFirstChapterIntoView();
      requestAnimationFrame(() => scrollFirstChapterIntoView());
    });

    return true;
  }, [scrollFirstChapterIntoView, syncMobileZoomDom]);

  const clearLongPress = useCallback(() => {
    if (longPressRef.current?.timer) {
      clearTimeout(longPressRef.current.timer);
    }
    longPressRef.current = null;
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => {
      const mode: LayoutMode = mq.matches ? "mobile" : "desktop";
      setLayoutMode(mode);
      layoutModeRef.current = mode;
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (layoutMode === "mobile") {
      hasMobileFramedRef.current = false;
      panRef.current = { x: 0, y: 0 };
      setPan({ x: 0, y: 0 });
    } else {
      zoomRef.current = 1;
      setZoom(1);
    }
  }, [layoutMode]);

  // Rebuild layout when state changes
  useEffect(() => {
    const sortedChapters = [...state.chapters].sort((a, b) => a.chapter_number - b.chapter_number);
    const { columns: newCols, edges: newEdges } = buildLayout(sortedChapters, state.keyPoints, layoutMode);
    setColumns(newCols);
    setEdges(newEdges);

    // Initialize column physics state — only chapters get drag entries
    const existing = columnsRef.current;
    const newMap = new Map<string, DragColumn>();
    newCols.forEach((col) => {
      const prev = existing.get(col.chapterId);
      if (prev) {
        if (layoutMode === "mobile" && !prev.isDragging) {
          prev.x = col.x;
          prev.y = col.y;
          prev.isDragging = false;
          prev.targetRotation = prev.baseRotation;
        }
        newMap.set(col.chapterId, prev);
      } else {
        const baseRot = randomRotation(2);
        newMap.set(col.chapterId, {
          id: col.chapterId,
          x: col.x,
          y: col.y,
          rotation: baseRot,
          baseRotation: baseRot,
          targetRotation: baseRot,
          vx: 0,
          isDragging: false,
        });
      }
    });
    columnsRef.current = newMap;
    setRenderTick((t) => t + 1);
  }, [state.chapters, state.keyPoints, layoutMode]);

  // Physics animation loop
  useEffect(() => {
    let running = true;
    function tick() {
      if (!running) return;
      let needsUpdate = false;
      columnsRef.current.forEach((col) => {
        if (col.isDragging) return;
        const diff = col.targetRotation - col.rotation;
        if (Math.abs(diff) > 0.1) {
          col.rotation += diff * 0.2;
          needsUpdate = true;
        }
      });
      if (needsUpdate) {
        setRenderTick((t) => t + 1);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Debounced auto-save
  useEffect(() => {
    if (!state.dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        for (const ch of state.chapters) {
          await fetch(`/api/project/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chapter_id: ch.id,
              title: ch.title,
              summary: ch.summary,
              key_point_ids: ch.key_point_ids,
              target_word_count: ch.target_word_count,
              sort_order: ch.sort_order,
              chapter_number: ch.chapter_number,
            }),
          });
        }
        for (const kp of state.keyPoints) {
          await fetch(`/api/project/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key_point_id: kp.id,
              title: kp.title,
              summary: kp.summary,
            }),
          });
        }
        dispatch({ type: "MARK_CLEAN" });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state.dirty, state.chapters, state.keyPoints, projectId, dispatch]);

  // Find nearest column and compute KP insertion index from drag position
  const findNearestColumn = useCallback((canvasX: number, canvasY: number): { chapterId: string; insertIndex: number } | null => {
    let bestDist = Infinity;
    let bestColLayout: ColumnLayout | null = null;
    let bestColState: DragColumn | null = null;

    for (const col of columns) {
      const colState = columnsRef.current.get(col.chapterId);
      if (!colState) continue;

      if (layoutModeRef.current === "mobile") {
        const colCenterY = colState.y + col.columnHeight / 2;
        const dist = Math.abs(canvasY - colCenterY);
        if (dist < bestDist) {
          bestDist = dist;
          bestColLayout = col;
          bestColState = colState;
        }
      } else {
        const colCenterX = colState.x + CHAPTER_WIDTH / 2;
        const dist = Math.abs(canvasX - colCenterX);
        if (dist < bestDist) {
          bestDist = dist;
          bestColLayout = col;
          bestColState = colState;
        }
      }
    }

    if (!bestColLayout || !bestColState) return null;

    if (bestColLayout.kpOrientation === "horizontal") {
      const kpStartX = bestColState.x + KP_INDENT;
      const relX = canvasX - kpStartX;

      if (relX < 0) {
        return { chapterId: bestColLayout.chapterId, insertIndex: 0 };
      }

      const slotWidth = KP_WIDTH + KP_GAP;
      const idx = Math.round(relX / slotWidth);
      const clamped = Math.min(idx, bestColLayout.kpIds.length);
      return { chapterId: bestColLayout.chapterId, insertIndex: clamped };
    }

    const kpStartY = bestColState.y + CHAPTER_HEIGHT + KP_TOP_OFFSET;
    const relY = canvasY - kpStartY;

    if (relY < 0) {
      return { chapterId: bestColLayout.chapterId, insertIndex: 0 };
    }

    const slotHeight = KP_HEIGHT + KP_GAP;
    const idx = Math.round(relY / slotHeight);
    const clamped = Math.min(idx, bestColLayout.kpIds.length);
    return { chapterId: bestColLayout.chapterId, insertIndex: clamped };
  }, [columns]);

  const getColumnCenterY = useCallback((chapterId: string, col: DragColumn) => {
    const layout = columnsListRef.current.find((c) => c.chapterId === chapterId);
    return col.y + (layout?.columnHeight ?? CHAPTER_HEIGHT) / 2;
  }, []);

  const getSortedChapterIds = useCallback(() => {
    const chapters = stateRef.current.chapters;
    const chapterIds = new Set(chapters.map((ch) => ch.id));
    const sortAxis = layoutModeRef.current === "mobile" ? "y" : "x";

    return [...columnsRef.current.entries()]
      .filter(([id]) => chapterIds.has(id))
      .sort(([idA, a], [idB, b]) => {
        if (sortAxis === "y") {
          return getColumnCenterY(idA, a) - getColumnCenterY(idB, b);
        }
        return a.x - b.x;
      })
      .map(([id]) => id);
  }, [getColumnCenterY]);

  // Check if a dropped column overlaps another column (chapter-chapter combine).
  const checkDropInteraction = useCallback((sourceId: string, sourceCol: DragColumn): boolean => {
    // Mobile stacks chapters vertically — overlap-based combine blocks reorder drops.
    if (layoutModeRef.current === "mobile") return false;

    for (const [targetId, targetCol] of columnsRef.current) {
      if (targetId === sourceId) continue;

      const overlapX = Math.abs(sourceCol.x - targetCol.x) < CHAPTER_WIDTH * 0.6;
      const overlapY = Math.abs(sourceCol.y - targetCol.y) < CHAPTER_HEIGHT * 0.6;
      if (overlapX && overlapY) {
        setConfirmCombine({ sourceId, targetId, type: "chapter" });
        return true;
      }
    }
    return false;
  }, []);

  const beginChapterDrag = useCallback((chapterId: string, clientX: number, clientY: number) => {
    const col = columnsRef.current.get(chapterId);
    if (!col) return;
    const canvas = clientToCanvas(clientX, clientY);
    col.isDragging = true;
    isNoteDraggingRef.current = true;
    setIsNoteDragging(true);
    dragRef.current = {
      noteId: chapterId,
      startX: clientX,
      startY: clientY,
      offsetX: col.x,
      offsetY: col.y,
      canvasStartX: canvas.x,
      canvasStartY: canvas.y,
    };
    setRenderTick((t) => t + 1);
  }, [clientToCanvas]);

  const beginKpDrag = useCallback((
    kpId: string,
    chapterId: string,
    kpIndex: number,
    color: NoteColor,
    clientX: number,
    clientY: number,
  ) => {
    const colState = columnsRef.current.get(chapterId);
    if (!colState) return;

    const colLayout = columnsListRef.current.find((c) => c.chapterId === chapterId);
    const isHorizontal = colLayout?.kpOrientation === "horizontal";

    const kpX = isHorizontal
      ? colState.x + KP_INDENT + kpIndex * (KP_WIDTH + KP_GAP)
      : colState.x + KP_INDENT;
    const kpY = isHorizontal
      ? colState.y + CHAPTER_HEIGHT + KP_TOP_OFFSET
      : colState.y + CHAPTER_HEIGHT + KP_TOP_OFFSET + kpIndex * (KP_HEIGHT + KP_GAP);

    const canvas = clientToCanvas(clientX, clientY);

    kpDragRef.current = {
      kpId,
      fromChapterId: chapterId,
      fromIndex: kpIndex,
      x: kpX,
      y: kpY,
      startX: clientX,
      startY: clientY,
      originX: kpX,
      originY: kpY,
      grabOffsetX: canvas.x - kpX,
      grabOffsetY: canvas.y - kpY,
      color,
    };
    isNoteDraggingRef.current = true;
    setIsNoteDragging(true);
    setRenderTick((t) => t + 1);
  }, [clientToCanvas]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (isPanningRef.current && layoutModeRef.current === "desktop") {
      const dx = clientX - panStartRef.current.x;
      const dy = clientY - panStartRef.current.y;
      const newPan = {
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      };
      panRef.current = newPan;
      setPan(newPan);
      return;
    }

    if (kpDragRef.current) {
      const canvas = clientToCanvas(clientX, clientY);
      kpDragRef.current.x = canvas.x - kpDragRef.current.grabOffsetX;
      kpDragRef.current.y = canvas.y - kpDragRef.current.grabOffsetY;

      const kpCenterX = kpDragRef.current.x + KP_WIDTH / 2;
      const kpCenterY = kpDragRef.current.y + KP_HEIGHT / 2;
      const nearest = findNearestColumn(kpCenterX, kpCenterY);
      setNearestColId(nearest?.chapterId ?? null);

      setRenderTick((t) => t + 1);
      return;
    }

    const { noteId, offsetX, offsetY, canvasStartX, canvasStartY } = dragRef.current;
    if (!noteId) return;
    const col = columnsRef.current.get(noteId);
    if (!col) return;

    if (layoutModeRef.current === "mobile") {
      const canvas = clientToCanvas(clientX, clientY);
      col.x = offsetX + (canvas.x - canvasStartX);
      col.y = offsetY + (canvas.y - canvasStartY);
    } else {
      const z = zoomRef.current;
      const dx = (clientX - dragRef.current.startX) / z;
      const dy = (clientY - dragRef.current.startY) / z;
      col.x = offsetX + dx;
      col.y = offsetY + dy;
      col.vx = dx;
      col.targetRotation = Math.max(-15, Math.min(15, dx * 0.3));
    }
    setRenderTick((t) => t + 1);
  }, [clientToCanvas, findNearestColumn]);

  const handlePointerUp = useCallback(() => {
    clearLongPress();
    isNoteDraggingRef.current = false;
    setIsNoteDragging(false);

    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (kpDragRef.current) {
      const kp = kpDragRef.current;
      const kpCenterX = kp.x + KP_WIDTH / 2;
      const kpCenterY = kp.y + KP_HEIGHT / 2;
      const nearest = findNearestColumn(kpCenterX, kpCenterY);

      if (nearest) {
        if (nearest.chapterId === kp.fromChapterId) {
          let newIndex = nearest.insertIndex;
          if (newIndex > kp.fromIndex) newIndex = Math.max(0, newIndex - 1);
          if (newIndex !== kp.fromIndex) {
            dispatch({
              type: "REORDER_KEY_POINT",
              chapterId: kp.fromChapterId,
              keyPointId: kp.kpId,
              newIndex,
            });
          }
        } else {
          dispatch({
            type: "MOVE_KEY_POINT",
            keyPointId: kp.kpId,
            fromChapterId: kp.fromChapterId,
            toChapterId: nearest.chapterId,
            toIndex: nearest.insertIndex,
          });
        }
      }

      kpDragRef.current = null;
      setNearestColId(null);
      setRenderTick((t) => t + 1);
      return;
    }

    const { noteId } = dragRef.current;
    if (!noteId) return;
    const col = columnsRef.current.get(noteId);
    if (col) {
      col.isDragging = false;
      col.targetRotation = col.baseRotation;

      const combined = checkDropInteraction(noteId, col);
      if (!combined) {
        const sortedIds = getSortedChapterIds();
        const currentOrder = [...stateRef.current.chapters]
          .sort((a, b) => a.chapter_number - b.chapter_number)
          .map((ch) => ch.id);
        const orderChanged = sortedIds.some((id, i) => id !== currentOrder[i]);
        if (orderChanged) {
          dispatchRef.current({ type: "REORDER_CHAPTERS", orderedIds: sortedIds });
        } else {
          const layout = columnsListRef.current.find((c) => c.chapterId === noteId);
          if (layout) {
            col.x = layout.x;
            col.y = layout.y;
          }
        }
      } else {
        const layout = columnsListRef.current.find((c) => c.chapterId === noteId);
        if (layout) {
          col.x = layout.x;
          col.y = layout.y;
        }
      }
    }
    dragRef.current.noteId = null;
    setRenderTick((t) => t + 1);
  }, [clearLongPress, dispatch, findNearestColumn, checkDropInteraction, getSortedChapterIds]);

  // Column drag handler
  const handleColumnMouseDown = useCallback((e: React.MouseEvent, chapterId: string) => {
    if ((e.target as HTMLElement).contentEditable === "true") return;
    e.preventDefault();
    e.stopPropagation();
    beginChapterDrag(chapterId, e.clientX, e.clientY);
  }, [beginChapterDrag]);

  const handleColumnTouchStart = useCallback((e: React.TouchEvent, chapterId: string) => {
    if (layoutModeRef.current !== "mobile") return;
    const touch = e.touches[0];
    if (!touch) return;

    clearLongPress();
    navigator.vibrate?.(8);
    beginChapterDrag(chapterId, touch.clientX, touch.clientY);
  }, [beginChapterDrag, clearLongPress]);

  // KP drag handler — starts independent KP drag
  const handleKpMouseDown = useCallback((
    e: React.MouseEvent,
    kpId: string,
    chapterId: string,
    kpIndex: number,
    color: NoteColor,
  ) => {
    if ((e.target as HTMLElement).contentEditable === "true") return;
    e.preventDefault();
    e.stopPropagation();
    beginKpDrag(kpId, chapterId, kpIndex, color, e.clientX, e.clientY);
  }, [beginKpDrag]);

  const handleKpTouchStart = useCallback((
    e: React.TouchEvent,
    kpId: string,
    chapterId: string,
    kpIndex: number,
    color: NoteColor,
  ) => {
    if (layoutModeRef.current !== "mobile") return;
    const touch = e.touches[0];
    if (!touch) return;

    clearLongPress();
    navigator.vibrate?.(8);
    beginKpDrag(kpId, chapterId, kpIndex, color, touch.clientX, touch.clientY);
  }, [beginKpDrag, clearLongPress]);

  const handleNoteTouchEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      handlePointerMove(e.clientX, e.clientY);
    }

    function handleMouseUp() {
      handlePointerUp();
    }

    function handleTouchMove(e: TouchEvent) {
      if (longPressRef.current && e.touches.length === 1) {
        const touch = e.touches[0];
        lastTouchRef.current = { clientX: touch.clientX, clientY: touch.clientY };
        const dx = touch.clientX - longPressRef.current.startX;
        const dy = touch.clientY - longPressRef.current.startY;
        if (Math.hypot(dx, dy) > LONG_PRESS_CANCEL_PX) {
          clearLongPress();
        }
      }

      if (kpDragRef.current || dragRef.current.noteId) {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) handlePointerMove(touch.clientX, touch.clientY);
      }
    }

    function handleTouchEnd() {
      if (kpDragRef.current || dragRef.current.noteId) {
        handlePointerUp();
      } else {
        clearLongPress();
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { capture: true });
    window.addEventListener("touchcancel", handleTouchEnd, { capture: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd, { capture: true });
      window.removeEventListener("touchcancel", handleTouchEnd, { capture: true });
    };
  }, [clearLongPress, handlePointerMove, handlePointerUp]);

  function handleConfirmCombine() {
    if (!confirmCombine) return;
    if (confirmCombine.type === "keyPoint") {
      dispatch({ type: "COMBINE_KEY_POINTS", targetId: confirmCombine.targetId, sourceId: confirmCombine.sourceId });
    } else {
      dispatch({ type: "COMBINE_CHAPTERS", targetId: confirmCombine.targetId, sourceId: confirmCombine.sourceId });
    }
    setConfirmCombine(null);
  }

  // Canvas pan on background drag
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (layoutModeRef.current === "mobile") return;
    if (dragRef.current.noteId) return;
    if (kpDragRef.current) return;
    isPanningRef.current = true;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
  }, []);

  // Wheel-to-zoom, anchored to cursor position (desktop only)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || layoutMode !== "desktop") return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const oldZoom = zoomRef.current;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const newZoom = Math.min(3, Math.max(0.15, oldZoom + delta));
      const scale = newZoom / oldZoom;

      const newPanX = cursorX - scale * (cursorX - panRef.current.x);
      const newPanY = cursorY - scale * (cursorY - panRef.current.y);

      zoomRef.current = newZoom;
      panRef.current = { x: newPanX, y: newPanY };
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [layoutMode]);

  // Pinch-to-zoom on mobile (single-finger scroll remains native)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || layoutMode !== "mobile") return;

    function syncMobileZoomDomLocal(newZoom: number) {
      syncMobileZoomDom(newZoom);
    }

    function applyMobileZoom(newZoom: number, viewportX: number, viewportY: number) {
      const oldZoom = zoomRef.current;
      if (Math.abs(newZoom - oldZoom) < 0.002) return;

      const scale = newZoom / oldZoom;
      el!.scrollLeft = viewportX * (scale - 1) + el!.scrollLeft * scale;
      el!.scrollTop = viewportY * (scale - 1) + el!.scrollTop * scale;
      zoomRef.current = newZoom;
      syncMobileZoomDomLocal(newZoom);
    }

    function flushPendingPinch() {
      pinchRafRef.current = 0;
      const pending = pendingPinchRef.current;
      if (!pending) return;
      applyMobileZoom(pending.zoom, pending.viewportX, pending.viewportY);
      pendingPinchRef.current = null;
    }

    function scheduleMobileZoom(newZoom: number, viewportX: number, viewportY: number) {
      pendingPinchRef.current = { zoom: newZoom, viewportX, viewportY };
      if (!pinchRafRef.current) {
        pinchRafRef.current = requestAnimationFrame(flushPendingPinch);
      }
    }

    function handleTouchStart(e: TouchEvent) {
      if (isNoteDraggingRef.current) return;
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDistance: touchDistance(e.touches[0], e.touches[1]),
          initialZoom: zoomRef.current,
        };
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!pinchRef.current || e.touches.length < 2) return;
      e.preventDefault();

      const distance = touchDistance(e.touches[0], e.touches[1]);
      const newZoom = clampZoom(
        pinchRef.current.initialZoom * (distance / pinchRef.current.initialDistance),
        MOBILE_ZOOM_MIN,
        MOBILE_ZOOM_MAX
      );

      const rect = el!.getBoundingClientRect();
      const viewportX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const viewportY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

      scheduleMobileZoom(newZoom, viewportX, viewportY);
    }

    function handleTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        if (pinchRafRef.current) {
          cancelAnimationFrame(pinchRafRef.current);
          flushPendingPinch();
        }
        pinchRef.current = null;
        setZoom(zoomRef.current);
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      if (pinchRafRef.current) cancelAnimationFrame(pinchRafRef.current);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [layoutMode, syncMobileZoomDom]);

  const contentBounds = useMemo(() => {
    if (columns.length === 0) {
      return { x: 0, y: 0, width: 400, height: 400 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = 0;
    let maxY = 0;

    for (const col of columns) {
      const dragCol = columnsRef.current.get(col.chapterId);
      const x = dragCol?.x ?? col.x;
      const y = dragCol?.y ?? col.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + col.columnWidth);
      maxY = Math.max(maxY, y + col.columnHeight);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [columns, layoutMode]);

  const canvasBounds = useMemo(() => {
    const edgePad = layoutMode === "mobile" ? MOBILE_FRAME_PADDING : 80;
    return {
      width: contentBounds.width + edgePad * 2,
      height: contentBounds.height + edgePad * 2,
    };
  }, [contentBounds, layoutMode]);

  useEffect(() => {
    canvasBoundsRef.current = { width: canvasBounds.width, height: canvasBounds.height };
  }, [canvasBounds]);

  // Frame mobile viewport when canvas gets real dimensions (tab visible, layout settled)
  useEffect(() => {
    if (layoutMode !== "mobile") return;

    const el = canvasRef.current;
    if (!el) return;

    let frameTimer: ReturnType<typeof setTimeout> | null = null;

    const tryFrame = () => {
      if (hasMobileFramedRef.current || columnsListRef.current.length === 0) return;
      if (frameMobileViewport()) {
        hasMobileFramedRef.current = true;
      }
    };

    const observer = new ResizeObserver(() => {
      if (frameTimer) clearTimeout(frameTimer);
      frameTimer = setTimeout(tryFrame, 50);
    });

    observer.observe(el);
    requestAnimationFrame(() => requestAnimationFrame(tryFrame));
    frameTimer = setTimeout(tryFrame, 150);

    return () => {
      observer.disconnect();
      if (frameTimer) clearTimeout(frameTimer);
    };
  }, [layoutMode, columns, frameMobileViewport]);

  const scaledCanvasBounds = useMemo(() => ({
    width: canvasBounds.width * zoom,
    height: canvasBounds.height * zoom,
  }), [canvasBounds, zoom]);

  const gridBackgroundStyle = {
    backgroundImage: `
      linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
  } as const;

  // Compute edge path between chapter columns
  function getEdgePath(edge: EdgeDef): string {
    const sourceCol = columnsRef.current.get(edge.sourceId);
    const targetCol = columnsRef.current.get(edge.targetId);
    if (!sourceCol || !targetCol) return "";

    const sx = sourceCol.x + CHAPTER_WIDTH / 2;
    const sy = sourceCol.y + CHAPTER_HEIGHT / 2;
    const tx = targetCol.x + CHAPTER_WIDTH / 2;
    const ty = targetCol.y + CHAPTER_HEIGHT / 2;

    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const cx = mx;
    const cy = my - 40;

    return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
  }

  const handleAddChapter = useCallback((color: NoteColor) => {
    dispatch({ type: "ADD_CHAPTER" });
  }, [dispatch]);

  // Current KP drag state for rendering
  const kpDrag = kpDragRef.current;

  const isMobileLayout = layoutMode === "mobile";

  const boardLayers = (
    <>
      {/* SVG edges layer */}
      <svg
        ref={svgRef}
        style={{
          position: isMobileLayout ? "relative" : "absolute",
          top: isMobileLayout ? undefined : 0,
          left: isMobileLayout ? undefined : 0,
          width: isMobileLayout ? canvasBounds.width : "100%",
          height: isMobileLayout ? canvasBounds.height : "100%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <g
          filter="url(#marker-wobble)"
          transform={isMobileLayout ? undefined : `translate(${pan.x}, ${pan.y}) scale(${zoom})`}
        >
          {edges.map((edge) => {
            const path = getEdgePath(edge);
            if (!path) return null;
            return (
              <path
                key={edge.id}
                d={path}
                fill="none"
                stroke="rgba(0,0,0,0.12)"
                strokeWidth={4}
                opacity={0.3}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      </svg>

      {/* Column layer */}
      <div
        style={{
          position: isMobileLayout ? "relative" : "absolute",
          top: isMobileLayout ? undefined : 0,
          left: isMobileLayout ? undefined : 0,
          width: isMobileLayout ? canvasBounds.width : "100%",
          height: isMobileLayout ? canvasBounds.height : "100%",
          minWidth: isMobileLayout ? canvasBounds.width : undefined,
          minHeight: isMobileLayout ? canvasBounds.height : undefined,
          zIndex: 2,
          transform: isMobileLayout ? undefined : `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {columns.map((col) => {
          const dragCol = columnsRef.current.get(col.chapterId);
          if (!dragCol) return null;

          const chapter = state.chapters.find((ch) => ch.id === col.chapterId);
          if (!chapter) return null;

          const scale = dragCol.isDragging ? 1.03 : 1;
          const isDropTarget = nearestColId === col.chapterId && kpDrag !== null;

          const colX = dragCol.x;
          const colY = dragCol.y;
          const isColumnDragging = dragCol.isDragging;

          return (
            <div
              key={col.chapterId}
              data-outline-chapter={col.chapterId}
              onMouseDown={(e) => handleColumnMouseDown(e, col.chapterId)}
              className={isColumnDragging ? "ds-outline-note--dragging" : undefined}
              style={{
                position: "absolute",
                left: colX,
                top: colY,
                width: col.columnWidth,
                transform: isMobileLayout
                  ? isColumnDragging ? "scale(1.02)" : undefined
                  : `rotate(${dragCol.rotation}deg) scale(${scale})`,
                zIndex: isColumnDragging ? 100 : 10,
                transition: isColumnDragging
                  ? "none"
                  : isMobileLayout
                    ? "left 0.28s ease-out, top 0.28s ease-out, transform 0.28s ease-out"
                    : "transform 0.3s ease-out",
              }}
            >
              {/* Column background — subtle grouping indicator */}
              <div
                style={{
                  position: "absolute",
                  top: -8,
                  left: -10,
                  right: -10,
                  bottom: -8,
                  background: isDropTarget ? getHighlightBg(col.color) : getColumnBg(col.color),
                  border: isDropTarget
                    ? `2.5px dashed ${getHighlightBorder(col.color)}`
                    : `1.5px dashed ${getBorderColor(col.color)}`,
                  borderRadius: 10,
                  pointerEvents: "none",
                  opacity: col.kpIds.length > 0 || isDropTarget ? 1 : 0,
                  transition: "background 0.15s, border 0.15s, opacity 0.15s",
                }}
              />

              {/* Chapter header card */}
              <ChapterNote
                chapter={chapter}
                color={col.color}
                rotation={dragCol.rotation}
                isDragging={dragCol.isDragging}
                keyPointCount={col.kpIds.length}
                isMobile={isMobileLayout}
                onDragHandleTouchStart={(e) => handleColumnTouchStart(e, col.chapterId)}
                onDragHandleTouchEnd={handleNoteTouchEnd}
                onEdit={(field, value) => dispatch({ type: "EDIT_CHAPTER", chapterId: chapter.id, field, value })}
                onDelete={() => dispatch({ type: "DELETE_CHAPTER", chapterId: chapter.id })}
                onAddKeyPoint={() => dispatch({ type: "ADD_KEY_POINT", chapterId: chapter.id })}
              />

              {/* Key points — vertical stack on desktop, horizontal row on mobile */}
              <div
                style={{
                  marginTop: KP_TOP_OFFSET,
                  marginLeft: KP_INDENT,
                  display: "flex",
                  flexDirection: col.kpOrientation === "horizontal" ? "row" : "column",
                  gap: KP_GAP,
                  flexWrap: col.kpOrientation === "horizontal" ? "nowrap" : undefined,
                }}
              >
                {col.kpIds.map((kpId, kpIndex) => {
                  const kp = state.keyPoints.find((k) => k.id === kpId);
                  if (!kp) return null;

                  // Hide KP from its slot while it's being dragged
                  const isBeingDragged = kpDrag?.kpId === kpId;

                  return (
                    <div
                      key={kpId}
                      data-outline-kp={kpId}
                      onMouseDown={(e) => handleKpMouseDown(e, kpId, col.chapterId, kpIndex, col.color)}
                      style={{
                        opacity: isBeingDragged ? 0.25 : 1,
                        transition: "opacity 0.15s",
                        flex: "0 0 auto",
                      }}
                    >
                      <KeyPointNote
                        keyPoint={kp}
                        color={col.color}
                        rotation={0}
                        isDragging={isBeingDragged}
                        isMobile={isMobileLayout}
                        onDragHandleTouchStart={(e) => handleKpTouchStart(e, kpId, col.chapterId, kpIndex, col.color)}
                        onDragHandleTouchEnd={handleNoteTouchEnd}
                        onEdit={(field, value) => dispatch({ type: "EDIT_KEY_POINT", keyPointId: kp.id, field, value })}
                        onDelete={() => dispatch({ type: "DELETE_KEY_POINT", keyPointId: kp.id })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Ghost KP — floating card while dragging */}
        {kpDrag && (() => {
          const kp = state.keyPoints.find((k) => k.id === kpDrag.kpId);
          if (!kp) return null;
          return (
            <div
              style={{
                position: "absolute",
                left: kpDrag.x,
                top: kpDrag.y,
                zIndex: 100,
                pointerEvents: "none",
                transform: "rotate(-2deg) scale(1.05)",
                opacity: 0.9,
              }}
            >
              <KeyPointNote
                keyPoint={kp}
                color={kpDrag.color}
                rotation={-2}
                isDragging={true}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            </div>
          );
        })()}
      </div>
    </>
  );

  return (
    <div
      ref={canvasRef}
      className={isMobileLayout ? "ds-outline-canvas ds-outline-canvas--mobile" : "ds-outline-canvas"}
      onMouseDown={handleCanvasMouseDown}
      style={{
        position: "relative",
        width: "100%",
        height: isMobileLayout ? undefined : "calc(100vh - 160px)",
        overflow: isMobileLayout ? "auto" : "hidden",
        WebkitOverflowScrolling: isMobileLayout ? "touch" : undefined,
        touchAction: isMobileLayout ? (isNoteDragging ? "none" : "pan-x pan-y") : undefined,
        background: "#f4f1ea",
        backgroundImage: isMobileLayout
          ? undefined
          : `
          linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
        `,
        backgroundSize: isMobileLayout ? undefined : `${40 * zoom}px ${40 * zoom}px`,
        backgroundPosition: isMobileLayout ? undefined : `${pan.x}px ${pan.y}px`,
        borderRadius: "0 0 12px 12px",
        cursor: isMobileLayout ? "default" : (isPanningRef.current ? "grabbing" : "grab"),
      }}
    >
      {/* SVG Filters */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="paper-texture" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
            <feDiffuseLighting in="noise" lightingColor="white" surfaceScale="1.5" result="light">
              <feDistantLight azimuth="45" elevation="55" />
            </feDiffuseLighting>
            <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="0" k2="1" k3="0.1" k4="0" />
          </filter>
          <filter id="marker-wobble">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" result="noise" seed="2" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="rough-edge" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="4" result="noise" seed="1" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {isMobileLayout ? (
        <div
          ref={mobileSpacerRef}
          style={{
            width: scaledCanvasBounds.width,
            height: scaledCanvasBounds.height,
            position: "relative",
          }}
        >
          <div
            ref={mobileScaleRef}
            style={{
              width: canvasBounds.width,
              height: canvasBounds.height,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              position: "relative",
              background: "#f4f1ea",
              ...gridBackgroundStyle,
              willChange: "transform",
            }}
          >
            {boardLayers}
          </div>
        </div>
      ) : (
        boardLayers
      )}
      {confirmCombine && (
        <div style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          padding: "16px 24px",
          background: "white",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          border: "1px solid rgba(0,0,0,0.1)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          fontFamily: "'Kalam', cursive",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#191816" }}>
            Combine these {confirmCombine.type === "chapter" ? "chapters" : "key points"}?
          </div>
          <div style={{ fontSize: 12, color: "#7a7369" }}>
            This will merge their content together.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setConfirmCombine(null)}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 8,
                background: "white",
                color: "#7a7369",
                cursor: "pointer",
                fontFamily: "'Kalam', cursive",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmCombine}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                borderRadius: 8,
                background: "#191816",
                color: "white",
                cursor: "pointer",
                fontFamily: "'Kalam', cursive",
              }}
            >
              Combine
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <EditorToolbar
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAddChapter={handleAddChapter}
        saveStatus={saveStatus}
        isDirty={state.dirty}
        onContinue={onContinue}
        hasChapters={state.chapters.length > 0}
      />
    </div>
  );
}

export default function OutlineEditor(props: OutlineEditorProps) {
  return <OutlineEditorInner {...props} />;
}
