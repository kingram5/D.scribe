"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  color: NoteColor;
}

function randomRotation(range: number) {
  return (Math.random() - 0.5) * 2 * range;
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

  // Mutable column states for physics (avoid re-renders per frame)
  const columnsRef = useRef<Map<string, DragColumn>>(new Map());
  const dragRef = useRef<{
    noteId: string | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  }>({ noteId: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const rafRef = useRef<number>(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // KP drag state — separate from column drag
  const kpDragRef = useRef<KpDragState | null>(null);
  const [nearestColId, setNearestColId] = useState<string | null>(null);
  const [nearestInsertIndex, setNearestInsertIndex] = useState<number | null>(null);
  const [nearestGapIndex, setNearestGapIndex] = useState<number | null>(null);

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

  // Rebuild layout when state changes
  useEffect(() => {
    const { columns: newCols, edges: newEdges } = buildLayout(state.chapters, state.keyPoints);
    setColumns(newCols);
    setEdges(newEdges);

    // Initialize column physics state — only chapters get drag entries
    const existing = columnsRef.current;
    const newMap = new Map<string, DragColumn>();
    newCols.forEach((col) => {
      const prev = existing.get(col.chapterId);
      if (prev) {
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
  }, [state.chapters, state.keyPoints]);

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

  // Find nearest column to a canvas X position, and compute insertion index from Y
  const findNearestColumn = useCallback((canvasX: number, canvasY: number): { chapterId: string; insertIndex: number } | null => {
    let bestDist = Infinity;
    let bestColLayout: ColumnLayout | null = null;
    let bestColState: DragColumn | null = null;

    for (const col of columns) {
      const colState = columnsRef.current.get(col.chapterId);
      if (!colState) continue;
      const colCenterX = colState.x + CHAPTER_WIDTH / 2;
      const dist = Math.abs(canvasX - colCenterX);
      if (dist < bestDist) {
        bestDist = dist;
        bestColLayout = col;
        bestColState = colState;
      }
    }

    if (!bestColLayout || !bestColState) return null;

    // Compute insertion index based on Y position within column
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

  // Find nearest gap between chapters for reordering
  const findNearestGap = useCallback((canvasX: number, draggingChapterId: string): number | null => {
    const otherCols = columns
      .filter(c => c.chapterId !== draggingChapterId)
      .sort((a, b) => {
        const aState = columnsRef.current.get(a.chapterId);
        const bState = columnsRef.current.get(b.chapterId);
        return (aState?.x ?? 0) - (bState?.x ?? 0);
      });

    if (otherCols.length === 0) return 0;

    for (let i = 0; i < otherCols.length; i++) {
      const col = otherCols[i];
      const colState = columnsRef.current.get(col.chapterId);
      if (!colState) continue;
      const colCenterX = colState.x + CHAPTER_WIDTH / 2;
      if (canvasX < colCenterX) return i;
    }
    return otherCols.length;
  }, [columns]);

  // Column drag handler
  const handleColumnMouseDown = useCallback((e: React.MouseEvent, chapterId: string) => {
    if ((e.target as HTMLElement).contentEditable === "true") return;
    e.preventDefault();
    e.stopPropagation();
    const col = columnsRef.current.get(chapterId);
    if (!col) return;
    col.isDragging = true;
    dragRef.current = {
      noteId: chapterId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: col.x,
      offsetY: col.y,
    };
    setRenderTick((t) => t + 1);
  }, []);

  // KP drag handler — starts independent KP drag
  const handleKpMouseDown = useCallback((e: React.MouseEvent, kpId: string, chapterId: string, kpIndex: number, color: NoteColor) => {
    if ((e.target as HTMLElement).contentEditable === "true") return;
    e.preventDefault();
    e.stopPropagation();

    const colState = columnsRef.current.get(chapterId);
    if (!colState) return;

    // Compute KP's canvas position within the column
    const kpX = colState.x + KP_INDENT;
    const kpY = colState.y + CHAPTER_HEIGHT + KP_TOP_OFFSET + kpIndex * (KP_HEIGHT + KP_GAP);

    kpDragRef.current = {
      kpId,
      fromChapterId: chapterId,
      fromIndex: kpIndex,
      x: kpX,
      y: kpY,
      startX: e.clientX,
      startY: e.clientY,
      originX: kpX,
      originY: kpY,
      color,
    };
    setRenderTick((t) => t + 1);
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      // Handle panning
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        const newPan = {
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        };
        panRef.current = newPan;
        setPan(newPan);
        return;
      }

      // Handle KP drag
      if (kpDragRef.current) {
        const z = zoomRef.current;
        const dx = (e.clientX - kpDragRef.current.startX) / z;
        const dy = (e.clientY - kpDragRef.current.startY) / z;
        kpDragRef.current.x = kpDragRef.current.originX + dx;
        kpDragRef.current.y = kpDragRef.current.originY + dy;

        // Update nearest column highlight
        const kpCenterX = kpDragRef.current.x + KP_WIDTH / 2;
        const kpCenterY = kpDragRef.current.y + KP_HEIGHT / 2;
        const nearest = findNearestColumn(kpCenterX, kpCenterY);
        setNearestColId(nearest?.chapterId ?? null);
        setNearestInsertIndex(nearest?.insertIndex ?? null);

        setRenderTick((t) => t + 1);
        return;
      }

      // Handle column drag
      const { noteId, startX, startY, offsetX, offsetY } = dragRef.current;
      if (!noteId) return;
      const col = columnsRef.current.get(noteId);
      if (!col) return;
      const z = zoomRef.current;
      const dx = (e.clientX - startX) / z;
      const dy = (e.clientY - startY) / z;
      col.x = offsetX + dx;
      col.y = offsetY + dy;
      col.vx = dx;
      col.targetRotation = Math.max(-15, Math.min(15, dx * 0.3));

      // Update nearest gap for chapter reorder
      const colCenterX = col.x + CHAPTER_WIDTH / 2;
      const gapIdx = findNearestGap(colCenterX, noteId);
      setNearestGapIndex(gapIdx);

      setRenderTick((t) => t + 1);
    }

    function handleMouseUp() {
      // End panning
      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }

      // End KP drag — snap to nearest column
      if (kpDragRef.current) {
        const kp = kpDragRef.current;
        const kpCenterX = kp.x + KP_WIDTH / 2;
        const kpCenterY = kp.y + KP_HEIGHT / 2;
        const nearest = findNearestColumn(kpCenterX, kpCenterY);

        if (nearest) {
          if (nearest.chapterId === kp.fromChapterId) {
            // Reorder within same chapter
            // Adjust index: if dragging down past original position, account for the gap
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
            // Move to different chapter
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
        setNearestInsertIndex(null);
        setRenderTick((t) => t + 1);
        return;
      }

      // End column drag
      const { noteId } = dragRef.current;
      if (!noteId) return;
      const col = columnsRef.current.get(noteId);
      if (col) {
        col.isDragging = false;
        col.targetRotation = col.baseRotation;
        
        // Check for combine first
        const combined = checkDropInteraction(noteId, col);
        
        if (!combined && nearestGapIndex !== null) {
          // Reorder chapter
          dispatch({
            type: "REORDER_CHAPTER",
            chapterId: noteId,
            newIndex: nearestGapIndex,
          });
        }
      }
      dragRef.current.noteId = null;
      setNearestGapIndex(null);
      setRenderTick((t) => t + 1);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, findNearestColumn]);

  // Check if a dropped column overlaps another column (chapter-chapter combine)
  const checkDropInteraction = useCallback((sourceId: string, sourceCol: DragColumn): boolean => {
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

  // Wheel-to-zoom, anchored to cursor position
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

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
  }, []);

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

  return (
    <div
      style={{
        width: "100%",
        padding: "40px 0",
        display: "flex",
        justifyContent: "center",
        background: "#3d1c1c", // Deep mahogany base
        backgroundImage: `
          linear-gradient(rgba(0,0,0,0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.3) 1px, transparent 1px),
          url("https://www.transparenttextures.com/patterns/wood-pattern.png"),
          radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 70%)
        `,
        backgroundSize: "100% 4px, 4px 100%, 400px 400px, 100% 100%",
        boxShadow: "inset 0 0 200px rgba(0,0,0,0.5)",
      }}
    >
      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        style={{
          position: "relative",
          width: "92%",
          height: "calc(100vh - 350px)",
          minHeight: 650,
          overflow: "hidden",
          background: "#fefcf5", // Aged paper color
          backgroundImage: `
            radial-gradient(circle, rgba(0,0,0,0.02) 1px, transparent 1px),
            linear-gradient(rgba(0,0,0,0.01) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.01) 1px, transparent 1px)
          `,
          backgroundSize: `${40 * zoom}px ${40 * zoom}px, ${20 * zoom}px ${20 * zoom}px, ${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          borderRadius: 2,
          cursor: isPanningRef.current ? "grabbing" : "grab",
          
          // Desk Blotter / Paper Frame
          border: "24px solid #1a1a1a", // Dark leather/wood frame
          borderImage: "linear-gradient(to bottom, #2c1810, #1a0f0a) 1",
          boxShadow: `
            0 20px 50px rgba(0,0,0,0.4),
            0 10px 20px rgba(0,0,0,0.3),
            inset 0 0 100px rgba(0,0,0,0.02)
          `,
        }}
      >
        {/* Frame Detail (Stitching/Gold Inlay) */}
        <div style={{
          position: "absolute",
          inset: -20,
          border: "1px solid rgba(184, 134, 11, 0.3)", // Subtle gold inlay
          pointerEvents: "none",
          zIndex: 102,
        }} />

        {/* Paper Texture */}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: 0.1,
          pointerEvents: "none",
          backgroundImage: `url("https://www.transparenttextures.com/patterns/natural-paper.png")`,
          zIndex: 0,
        }} />

        {/* Desk Lighting */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.05) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }} />

        {/* Brass Tacks */}
        {[
          { top: -14, left: -14 },
          { top: -14, right: -14 },
          { bottom: -14, left: -14 },
          { bottom: -14, right: -14 }
        ].map((pos, i) => (
          <div key={i} style={{
            position: "absolute",
            width: 12,
            height: 12,
            background: "radial-gradient(circle at 30% 30%, #ffd700, #b8860b)", // Brass look
            borderRadius: "50%",
            boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.5)",
            zIndex: 103,
            ...pos
          }} />
        ))}

        {/* Pen Rest (Subtle) */}
        <div style={{
          position: "absolute",
          bottom: -20,
          left: "10%",
          right: "10%",
          height: 10,
          background: "#1a0f0a",
          borderRadius: "0 0 10px 10px",
          boxShadow: "0 4px 8px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.1)",
          zIndex: 101,
        }} />

      {/* Desk Blotter Title (Handwritten Label) */}
      <div style={{
        position: "absolute",
        top: 20,
        left: 40,
        fontFamily: "'Kalam', cursive",
        fontSize: 20,
        color: "rgba(26, 15, 10, 0.4)",
        transform: "rotate(-1deg)",
        pointerEvents: "none",
        zIndex: 2,
        userSelect: "none",
        borderBottom: "1px solid rgba(26, 15, 10, 0.1)",
        paddingBottom: 4,
      }}>
        Draft: {projectId}
      </div>

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

      {/* SVG edges layer */}
      <svg
        ref={svgRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <g
          filter="url(#marker-wobble)"
          transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
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
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 2,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
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

          return (
            <div
              key={col.chapterId}
              onMouseDown={(e) => handleColumnMouseDown(e, col.chapterId)}
              style={{
                position: "absolute",
                left: dragCol.x,
                top: dragCol.y,
                transform: `rotate(${dragCol.rotation}deg) scale(${scale})`,
                zIndex: dragCol.isDragging ? 50 : 10,
                transition: dragCol.isDragging ? "none" : "transform 0.3s ease-out",
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
                onEdit={(field, value) => dispatch({ type: "EDIT_CHAPTER", chapterId: chapter.id, field, value })}
                onDelete={() => dispatch({ type: "DELETE_CHAPTER", chapterId: chapter.id })}
                onAddKeyPoint={() => dispatch({ type: "ADD_KEY_POINT", chapterId: chapter.id })}
              />

              {/* Key points stacked below */}
              <div style={{ marginTop: KP_TOP_OFFSET, marginLeft: KP_INDENT, display: "flex", flexDirection: "column", gap: KP_GAP, position: "relative" }}>
                {col.kpIds.map((kpId, kpIndex) => {
                  const kp = state.keyPoints.find((k) => k.id === kpId);
                  if (!kp) return null;

                  // Hide KP from its slot while it's being dragged
                  const isBeingDragged = kpDrag?.kpId === kpId;
                  const showDropIndicator = isDropTarget && nearestInsertIndex === kpIndex;

                  return (
                    <React.Fragment key={kpId}>
                      {showDropIndicator && (
                        <div style={{
                          height: 4,
                          background: getHighlightBorder(col.color),
                          borderRadius: 2,
                          margin: "-2px 0",
                          position: "relative",
                          zIndex: 20,
                          boxShadow: `0 0 8px ${getHighlightBorder(col.color)}`,
                        }}>
                          <div style={{
                            position: "absolute",
                            left: -6,
                            top: -4,
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: getHighlightBorder(col.color),
                            boxShadow: `0 0 8px ${getHighlightBorder(col.color)}`,
                          }} />
                        </div>
                      )}
                      <div
                        onMouseDown={(e) => handleKpMouseDown(e, kpId, col.chapterId, kpIndex, col.color)}
                        style={{
                          opacity: isBeingDragged ? 0.25 : 1,
                          transition: "opacity 0.15s",
                        }}
                      >
                        <KeyPointNote
                          keyPoint={kp}
                          color={col.color}
                          rotation={0}
                          isDragging={false}
                          onEdit={(field, value) => dispatch({ type: "EDIT_KEY_POINT", keyPointId: kp.id, field, value })}
                          onDelete={() => dispatch({ type: "DELETE_KEY_POINT", keyPointId: kp.id })}
                        />
                      </div>
                    </React.Fragment>
                  );
                })}
                {/* Drop indicator at the very end */}
                {isDropTarget && nearestInsertIndex === col.kpIds.length && (
                  <div style={{
                    height: 4,
                    background: getHighlightBorder(col.color),
                    borderRadius: 2,
                    margin: "-2px 0",
                    position: "relative",
                    zIndex: 20,
                    boxShadow: `0 0 8px ${getHighlightBorder(col.color)}`,
                  }}>
                    <div style={{
                      position: "absolute",
                      left: -6,
                      top: -4,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: getHighlightBorder(col.color),
                      boxShadow: `0 0 8px ${getHighlightBorder(col.color)}`,
                    }} />
                  </div>
                )}
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
                transform: "rotate(-3deg) scale(1.08)",
                opacity: 0.95,
                filter: "drop-shadow(0 25px 30px rgba(0,0,0,0.2))",
              }}
            >
              <KeyPointNote
                keyPoint={kp}
                color={kpDrag.color}
                rotation={-3}
                isDragging={true}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            </div>
          );
        })()}

        {/* Chapter Gap Indicator */}
        {nearestGapIndex !== null && dragRef.current.noteId && (() => {
          // Find the X position for the gap
          const sortedCols = columns
            .filter(c => c.chapterId !== dragRef.current.noteId)
            .sort((a, b) => {
              const aState = columnsRef.current.get(a.chapterId);
              const bState = columnsRef.current.get(b.chapterId);
              return (aState?.x ?? 0) - (bState?.x ?? 0);
            });
          
          let gapX = 0;
          if (sortedCols.length === 0) {
            gapX = 100;
          } else if (nearestGapIndex === 0) {
            const firstCol = columnsRef.current.get(sortedCols[0].chapterId);
            gapX = (firstCol?.x ?? 0) - 60;
          } else if (nearestGapIndex === sortedCols.length) {
            const lastCol = columnsRef.current.get(sortedCols[sortedCols.length - 1].chapterId);
            gapX = (lastCol?.x ?? 0) + CHAPTER_WIDTH + 60;
          } else {
            const leftCol = columnsRef.current.get(sortedCols[nearestGapIndex - 1].chapterId);
            const rightCol = columnsRef.current.get(sortedCols[nearestGapIndex].chapterId);
            gapX = ((leftCol?.x ?? 0) + CHAPTER_WIDTH + (rightCol?.x ?? 0)) / 2;
          }

          return (
            <div style={{
              position: "absolute",
              left: gapX - 2,
              top: 0,
              width: 4,
              height: 1000,
              background: "rgba(25, 24, 22, 0.15)",
              borderRadius: 2,
              zIndex: 5,
              pointerEvents: "none",
              transition: "left 0.2s ease-out",
            }}>
              <div style={{
                position: "absolute",
                top: 40,
                left: -4,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "rgba(25, 24, 22, 0.3)",
              }} />
            </div>
          );
        })()}
      </div>

      {/* Combine confirmation */}
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
    </div>
  );
}

export default function OutlineEditor(props: OutlineEditorProps) {
  return <OutlineEditorInner {...props} />;
}
