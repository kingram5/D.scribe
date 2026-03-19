"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chapter, KeyPoint } from "@/types";
import { useOutlineState } from "./useOutlineState";
import { buildLayout, NOTE_COLORS, type NotePosition, type EdgeDef, type NoteColor } from "./layout";
import { ChapterNote } from "./ChapterNode";
import { KeyPointNote } from "./KeyPointNode";
import { EditorToolbar } from "./EditorToolbar";

interface OutlineEditorProps {
  projectId: string;
  initialChapters: Chapter[];
  initialKeyPoints: KeyPoint[];
  onContinue: () => void;
}

interface DragNote {
  id: string;
  x: number;
  y: number;
  rotation: number;
  baseRotation: number;
  targetRotation: number;
  vx: number;
  isDragging: boolean;
}

function randomRotation(range: number) {
  return (Math.random() - 0.5) * 2 * range;
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

  // Mutable note states for physics (avoid re-renders per frame)
  const notesRef = useRef<Map<string, DragNote>>(new Map());
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

  // Positions and edges from layout
  const [positions, setPositions] = useState<NotePosition[]>([]);
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
    const { positions: newPos, edges: newEdges } = buildLayout(state.chapters, state.keyPoints);
    setPositions(newPos);
    setEdges(newEdges);

    // Initialize note physics state for new notes, preserve existing positions for existing ones
    const existingNotes = notesRef.current;
    const newNotes = new Map<string, DragNote>();
    newPos.forEach((p) => {
      const existing = existingNotes.get(p.id);
      if (existing) {
        newNotes.set(p.id, existing);
      } else {
        const range = p.type === "chapter" ? 2 : 1;
        const baseRot = randomRotation(range);
        newNotes.set(p.id, {
          id: p.id,
          x: p.x,
          y: p.y,
          rotation: baseRot,
          baseRotation: baseRot,
          targetRotation: baseRot,
          vx: 0,
          isDragging: false,
        });
      }
    });
    notesRef.current = newNotes;
    setRenderTick((t) => t + 1);
  }, [state.chapters, state.keyPoints]);

  // Physics animation loop
  useEffect(() => {
    let running = true;
    function tick() {
      if (!running) return;
      let needsUpdate = false;
      notesRef.current.forEach((note) => {
        if (note.isDragging) return;
        const diff = note.targetRotation - note.rotation;
        if (Math.abs(diff) > 0.1) {
          note.rotation += diff * 0.2;
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

  // Drag handlers
  const handleNoteMouseDown = useCallback((e: React.MouseEvent, noteId: string) => {
    if ((e.target as HTMLElement).contentEditable === "true") return;
    e.preventDefault();
    e.stopPropagation();
    const note = notesRef.current.get(noteId);
    if (!note) return;
    note.isDragging = true;
    dragRef.current = {
      noteId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: note.x,
      offsetY: note.y,
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

      const { noteId, startX, startY, offsetX, offsetY } = dragRef.current;
      if (!noteId) return;
      const note = notesRef.current.get(noteId);
      if (!note) return;
      const z = zoomRef.current;
      const dx = (e.clientX - startX) / z;
      const dy = (e.clientY - startY) / z;
      note.x = offsetX + dx;
      note.y = offsetY + dy;
      note.vx = dx;
      // Tilt based on horizontal movement
      note.targetRotation = Math.max(-15, Math.min(15, dx * 0.3));
      setRenderTick((t) => t + 1);
    }

    function handleMouseUp() {
      // End panning
      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }

      const { noteId } = dragRef.current;
      if (!noteId) return;
      const note = notesRef.current.get(noteId);
      if (note) {
        note.isDragging = false;
        note.targetRotation = note.baseRotation;

        // Check for combine/move interactions
        checkDropInteraction(noteId, note);
      }
      dragRef.current.noteId = null;
      setRenderTick((t) => t + 1);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chapters]);

  // Check if a dropped note overlaps another
  const checkDropInteraction = useCallback((sourceId: string, sourceNote: DragNote) => {
    const sourcePos = positions.find((p) => p.id === sourceId);
    if (!sourcePos) return;

    // Find overlapping notes
    for (const [targetId, targetNote] of notesRef.current) {
      if (targetId === sourceId) continue;
      const targetPos = positions.find((p) => p.id === targetId);
      if (!targetPos) continue;

      const overlapX = Math.abs(sourceNote.x - targetNote.x) < (sourcePos.width + targetPos.width) / 3;
      const overlapY = Math.abs(sourceNote.y - targetNote.y) < (sourcePos.height + targetPos.height) / 3;

      if (overlapX && overlapY) {
        const sourceIsKp = sourcePos.type === "keyPoint";
        const targetIsKp = targetPos.type === "keyPoint";
        const sourceIsCh = sourcePos.type === "chapter";
        const targetIsCh = targetPos.type === "chapter";

        // Key point → Chapter (move)
        if (sourceIsKp && targetIsCh) {
          const sourceChapter = state.chapters.find((ch) => ch.key_point_ids.includes(sourceId));
          if (sourceChapter && sourceChapter.id !== targetId) {
            dispatch({
              type: "MOVE_KEY_POINT",
              keyPointId: sourceId,
              fromChapterId: sourceChapter.id,
              toChapterId: targetId,
            });
          }
          return;
        }

        // KP + KP combine
        if (sourceIsKp && targetIsKp) {
          setConfirmCombine({ sourceId, targetId, type: "keyPoint" });
          return;
        }

        // Ch + Ch combine
        if (sourceIsCh && targetIsCh) {
          setConfirmCombine({ sourceId, targetId, type: "chapter" });
          return;
        }
      }
    }
  }, [positions, state.chapters, dispatch]);

  function handleConfirmCombine() {
    if (!confirmCombine) return;
    if (confirmCombine.type === "keyPoint") {
      dispatch({ type: "COMBINE_KEY_POINTS", targetId: confirmCombine.targetId, sourceId: confirmCombine.sourceId });
    } else {
      dispatch({ type: "COMBINE_CHAPTERS", targetId: confirmCombine.targetId, sourceId: confirmCombine.sourceId });
    }
    setConfirmCombine(null);
  }

  // Canvas pan on background drag — triggers if no note is being dragged
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't pan if we started dragging a note
    if (dragRef.current.noteId) return;
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

      // Adjust pan so zoom anchors to cursor position
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

  // Compute edge path
  function getEdgePath(edge: EdgeDef): string {
    const sourceNote = notesRef.current.get(edge.sourceId);
    const targetNote = notesRef.current.get(edge.targetId);
    const sourcePos = positions.find((p) => p.id === edge.sourceId);
    const targetPos = positions.find((p) => p.id === edge.targetId);
    if (!sourceNote || !targetNote || !sourcePos || !targetPos) return "";

    const sx = sourceNote.x + sourcePos.width / 2;
    const sy = sourceNote.y + sourcePos.height / 2;
    const tx = targetNote.x + targetPos.width / 2;
    const ty = targetNote.y + targetPos.height / 2;

    // Quadratic bezier with curve offset
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2;
    const cx = mx;
    const cy = my - 40;

    return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
  }

  const handleAddChapter = useCallback((color: NoteColor) => {
    dispatch({ type: "ADD_CHAPTER" });
  }, [dispatch]);

  return (
    <div
      ref={canvasRef}
      onMouseDown={handleCanvasMouseDown}
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 160px)",
        overflow: "hidden",
        background: "#f4f1ea",
        backgroundImage: `
          linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
        `,
        backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        borderRadius: "0 0 12px 12px",
        cursor: isPanningRef.current ? "grabbing" : "grab",
      }}
    >
      {/* SVG Filters */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          {/* Paper texture filter */}
          <filter id="paper-texture" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
            <feDiffuseLighting in="noise" lightingColor="white" surfaceScale="1.5" result="light">
              <feDistantLight azimuth="45" elevation="55" />
            </feDiffuseLighting>
            <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="0" k2="1" k3="0.1" k4="0" />
          </filter>

          {/* Marker wobble for edges */}
          <filter id="marker-wobble">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" result="noise" seed="2" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* Rough edge for notes */}
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

      {/* Notes layer */}
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
        {positions.map((pos) => {
          const note = notesRef.current.get(pos.id);
          if (!note) return null;

          const chapter = pos.type === "chapter"
            ? state.chapters.find((ch) => ch.id === pos.id)
            : undefined;
          const keyPoint = pos.type === "keyPoint"
            ? state.keyPoints.find((kp) => kp.id === pos.id)
            : undefined;

          const scale = note.isDragging ? 1.05 : 1;

          return (
            <div
              key={pos.id}
              onMouseDown={(e) => handleNoteMouseDown(e, pos.id)}
              style={{
                position: "absolute",
                left: note.x,
                top: note.y,
                transform: `rotate(${note.rotation}deg) scale(${scale})`,
                zIndex: note.isDragging ? 50 : pos.type === "chapter" ? 10 : 5,
                transition: note.isDragging ? "none" : "transform 0.3s ease-out",
              }}
            >
              {pos.type === "chapter" && chapter && (
                <ChapterNote
                  chapter={chapter}
                  color={pos.color}
                  rotation={note.rotation}
                  isDragging={note.isDragging}
                  keyPointCount={(chapter.key_point_ids || []).length}
                  onEdit={(field, value) => dispatch({ type: "EDIT_CHAPTER", chapterId: chapter.id, field, value })}
                  onDelete={() => dispatch({ type: "DELETE_CHAPTER", chapterId: chapter.id })}
                  onAddKeyPoint={() => dispatch({ type: "ADD_KEY_POINT", chapterId: chapter.id })}
                />
              )}
              {pos.type === "keyPoint" && keyPoint && (
                <KeyPointNote
                  keyPoint={keyPoint}
                  color={pos.color}
                  rotation={note.rotation}
                  isDragging={note.isDragging}
                  onEdit={(field, value) => dispatch({ type: "EDIT_KEY_POINT", keyPointId: keyPoint.id, field, value })}
                  onDelete={() => dispatch({ type: "DELETE_KEY_POINT", keyPointId: keyPoint.id })}
                />
              )}
            </div>
          );
        })}
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
        onContinue={onContinue}
        hasChapters={state.chapters.length > 0}
      />
    </div>
  );
}

export default function OutlineEditor(props: OutlineEditorProps) {
  return <OutlineEditorInner {...props} />;
}
